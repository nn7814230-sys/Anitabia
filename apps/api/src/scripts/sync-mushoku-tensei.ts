import type { QueryResultRow } from "pg";

import { config } from "../config.js";
import { pool } from "../database/client.js";
import { kodikEmbedUrl } from "../modules/playback/kodik.js";

type KodikEpisode = string | { link?: string | null };

type KodikResult = {
  title?: string | null;
  title_orig?: string | null;
  translation?: { title?: string | null } | null;
  seasons?: Record<string, { episodes?: Record<string, KodikEpisode> }> | null;
};

type KodikResponse = { results?: KodikResult[] };

type Segment = {
  query: string;
  title: string;
  originalTitle: string;
  translation: string;
  episodeCount: number;
};

const segments: Segment[] = [
  {
    query: "Mushoku Tensei: Isekai Ittara Honki Dasu",
    title: "Реинкарнация безработного [ТВ-1, часть 1]",
    originalTitle: "Mushoku Tensei: Isekai Ittara Honki Dasu",
    translation: "AniLibria.TV",
    episodeCount: 11,
  },
  {
    query: "Mushoku Tensei: Isekai Ittara Honki Dasu",
    title: "Реинкарнация безработного [ТВ-1, часть 2]",
    originalTitle: "Mushoku Tensei: Isekai Ittara Honki Dasu (2021)",
    translation: "AniLibria.TV",
    episodeCount: 12,
  },
  {
    query: "Mushoku Tensei II: Isekai Ittara Honki Dasu",
    title: "Реинкарнация безработного [ТВ-2, часть 1]",
    originalTitle: "Mushoku Tensei II: Isekai Ittara Honki Dasu",
    translation: "AniLibria.TV",
    episodeCount: 13,
  },
  {
    query: "Mushoku Tensei II: Isekai Ittara Honki Dasu",
    title: "Реинкарнация безработного [ТВ-2, часть 2]",
    originalTitle: "Mushoku Tensei II: Isekai Ittara Honki Dasu (2024)",
    translation: "AniLibria.TV",
    episodeCount: 12,
  },
  {
    query: "Mushoku Tensei III: Isekai Ittara Honki Dasu",
    title: "Реинкарнация безработного [ТВ-3]",
    originalTitle: "Mushoku Tensei III: Isekai Ittara Honki Dasu",
    translation: "AniDUB",
    episodeCount: 4,
  },
];

function hasArgument(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function searchKodik(query: string): Promise<KodikResult[]> {
  const endpoint = new URL("/search", config.kodikApiUrl);
  endpoint.searchParams.set("token", config.kodikApiToken ?? "");
  endpoint.searchParams.set("title", query);
  endpoint.searchParams.set("types", "anime-serial");
  endpoint.searchParams.set("with_episodes", "true");
  endpoint.searchParams.set("limit", "100");

  const response = await fetch(endpoint, { method: "POST", headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Kodik API returned HTTP ${response.status}.`);

  const payload = await response.json() as KodikResponse;
  return Array.isArray(payload.results) ? payload.results : [];
}

function playerUrls(segment: Segment, results: KodikResult[]): string[] {
  const match = results.find((result) => (
    result.title === segment.title
    && result.title_orig === segment.originalTitle
    && result.translation?.title === segment.translation
  ));
  if (!match) throw new Error(`Could not find Kodik segment: ${segment.title}.`);

  const season = Object.values(match.seasons ?? {})[0];
  const urls = Object.entries(season?.episodes ?? {})
    .map(([number, episode]) => {
      const sourceUrl = typeof episode === "string" ? episode : episode.link;
      return { number: Number(number), url: kodikEmbedUrl(sourceUrl ?? null) };
    })
    .filter((episode): episode is { number: number; url: string } => (
      Number.isInteger(episode.number) && episode.number >= 0 && Boolean(episode.url)
    ))
    .sort((left, right) => (left.number === 0 ? Number.MAX_SAFE_INTEGER : left.number) - (right.number === 0 ? Number.MAX_SAFE_INTEGER : right.number))
    .map((episode) => episode.url);

  if (urls.length !== segment.episodeCount) {
    throw new Error(`Kodik returned ${urls.length} episodes for ${segment.title}; expected ${segment.episodeCount}.`);
  }

  return urls;
}

async function syncMushokuTensei() {
  if (!config.kodikApiToken) throw new Error("KODIK_API_TOKEN is required.");

  const apply = hasArgument("apply");
  const urls: string[] = [];

  for (const segment of segments) {
    urls.push(...playerUrls(segment, await searchKodik(segment.query)));
  }

  if (urls.length !== 52) throw new Error(`Expected 52 total episodes, received ${urls.length}.`);
  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", release: "mushoku-tensei", episodes: urls.length }, null, 2));
    return;
  }

  const release = await pool.query<QueryResultRow & { id: string }>(
    "SELECT id FROM releases WHERE slug = $1",
    ["mushoku-tensei"],
  );
  const releaseId = release.rows[0]?.id;
  if (!releaseId) throw new Error("Release mushoku-tensei was not found.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [index, url] of urls.entries()) {
      await client.query(
        `INSERT INTO episodes (release_id, number, duration_seconds, kodik_url, published_at)
         VALUES ($1, $2, 1440, $3, NOW())
         ON CONFLICT (release_id, number) DO UPDATE SET kodik_url = EXCLUDED.kodik_url`,
        [releaseId, index + 1, url],
      );
    }
    await client.query(
      `UPDATE releases
       SET episodes_released = $1::smallint, episodes_total = NULL, updated_at = NOW()
       WHERE id = $2`,
      [urls.length, releaseId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  console.log(JSON.stringify({ mode: "apply", release: "mushoku-tensei", episodes: urls.length }, null, 2));
}

syncMushokuTensei()
  .catch((error: unknown) => {
    console.error("Mushoku Tensei Kodik synchronization failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
