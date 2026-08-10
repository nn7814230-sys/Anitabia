import type { QueryResultRow } from "pg";

import { config } from "../config.js";
import { pool } from "../database/client.js";
import { kodikEmbedUrl } from "../modules/playback/kodik.js";

type KodikEpisode = string | { link?: string | null };

type KodikResult = {
  title_orig?: string | null;
  year?: number | null;
  translation?: { title?: string | null } | null;
  seasons?: Record<string, { episodes?: Record<string, KodikEpisode> }> | null;
};

type KodikResponse = { results?: KodikResult[] };

type Segment = {
  query: string;
  originalTitle: string;
  preferredTranslation: string;
  year: number;
  season: string;
  episodeCount: number;
  maxEpisodeNumber?: number;
};

type ReleaseImport = {
  slug: string;
  episodeCount: number;
  segments: Segment[];
};

const releases: ReleaseImport[] = [
  {
    slug: "kurokos-basketball",
    episodeCount: 25,
    segments: [{
      query: "Kuroko no Basket",
      originalTitle: "Kuroko no Baske",
      preferredTranslation: "AniDUB",
      year: 2012,
      season: "1",
      episodeCount: 25,
    }],
  },
  {
    slug: "jujutsu-kaisen-season-1",
    episodeCount: 24,
    segments: [{
      query: "Jujutsu Kaisen",
      originalTitle: "Jujutsu Kaisen",
      preferredTranslation: "AniLibria.TV",
      year: 2020,
      season: "1",
      episodeCount: 24,
    }],
  },
  {
    slug: "hajime-no-ippo",
    episodeCount: 75,
    segments: [{
      query: "Hajime no Ippo",
      originalTitle: "Hajime no Ippo: The Fighting",
      preferredTranslation: "AniDUB",
      year: 2000,
      season: "1",
      episodeCount: 75,
      maxEpisodeNumber: 75,
    }],
  },
  {
    slug: "komi-cant-communicate",
    episodeCount: 12,
    segments: [{
      query: "Komi-san wa, Komyushou Desu.",
      originalTitle: "Komi-san wa, Komyushou Desu.",
      preferredTranslation: "AniLibria.TV",
      year: 2021,
      season: "1",
      episodeCount: 12,
    }],
  },
  {
    slug: "tsurune",
    episodeCount: 13,
    segments: [{
      query: "Tsurune",
      originalTitle: "Tsurune: Kazemai Koukou Kyuudou Bu",
      preferredTranslation: "AniLibria.TV",
      year: 2018,
      season: "1",
      episodeCount: 13,
    }],
  },
  {
    slug: "my-dress-up-darling",
    episodeCount: 24,
    segments: [
      {
        query: "Sono Bisque Doll wa Koi wo Suru",
        originalTitle: "Sono Bisque Doll wa Koi o Suru",
        preferredTranslation: "AniLibria.TV",
        year: 2022,
        season: "1",
        episodeCount: 12,
      },
      {
        query: "Sono Bisque Doll wa Koi wo Suru",
        originalTitle: "Sono Bisque Doll wa Koi o Suru (2025)",
        preferredTranslation: "AniDUB",
        year: 2025,
        season: "2",
        episodeCount: 12,
      },
    ],
  },
  {
    slug: "konosuba",
    episodeCount: 31,
    segments: [
      {
        query: "Kono Subarashii Sekai ni Shukufuku wo!",
        originalTitle: "Kono Subarashii Sekai ni Shukufuku o!",
        preferredTranslation: "AniLibria.TV",
        year: 2016,
        season: "1",
        episodeCount: 10,
      },
      {
        query: "Kono Subarashii Sekai ni Shukufuku wo!",
        originalTitle: "Kono Subarashii Sekai ni Shukufuku o! 2",
        preferredTranslation: "AniLibria.TV",
        year: 2017,
        season: "2",
        episodeCount: 10,
      },
      {
        query: "Kono Subarashii Sekai ni Shukufuku wo!",
        originalTitle: "Kono Subarashii Sekai ni Shukufuku o! 3",
        preferredTranslation: "AniLibria.TV",
        year: 2024,
        season: "3",
        episodeCount: 11,
      },
    ],
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

function segmentPlayerUrls(segment: Segment, results: KodikResult[]): string[] {
  const matches = results.filter((result) => (
    result.title_orig === segment.originalTitle
    && result.year === segment.year
    && Boolean(result.seasons?.[segment.season]?.episodes)
  ));
  const match = matches.find((result) => result.translation?.title === segment.preferredTranslation) ?? matches[0];
  if (!match) throw new Error(`Could not find Kodik segment: ${segment.originalTitle}.`);

  const episodes = Object.entries(match.seasons?.[segment.season]?.episodes ?? {})
    .map(([number, episode]) => {
      const sourceUrl = typeof episode === "string" ? episode : episode.link;
      return { number: Number(number), url: kodikEmbedUrl(sourceUrl ?? null) };
    })
    .filter((episode): episode is { number: number; url: string } => (
      Number.isInteger(episode.number)
      && episode.number > 0
      && (!segment.maxEpisodeNumber || episode.number <= segment.maxEpisodeNumber)
      && Boolean(episode.url)
    ))
    .sort((left, right) => left.number - right.number);

  if (episodes.length !== segment.episodeCount) {
    throw new Error(`Kodik returned ${episodes.length} episodes for ${segment.originalTitle}; expected ${segment.episodeCount}.`);
  }

  return episodes.map((episode) => episode.url);
}

async function importRelease(definition: ReleaseImport, urls: string[]): Promise<void> {
  const release = await pool.query<QueryResultRow & { id: string }>(
    "SELECT id FROM releases WHERE slug = $1",
    [definition.slug],
  );
  const releaseId = release.rows[0]?.id;
  if (!releaseId) throw new Error(`Release ${definition.slug} was not found.`);

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
       SET episodes_released = $1::smallint,
           episodes_total = $1::smallint,
           updated_at = NOW()
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
}

async function syncSkippedReleases() {
  if (!config.kodikApiToken) throw new Error("KODIK_API_TOKEN is required.");

  const apply = hasArgument("apply");
  const imported: Array<{ slug: string; episodes: number }> = [];

  for (const definition of releases) {
    const urls: string[] = [];
    for (const segment of definition.segments) {
      urls.push(...segmentPlayerUrls(segment, await searchKodik(segment.query)));
    }
    if (urls.length !== definition.episodeCount) {
      throw new Error(`Expected ${definition.episodeCount} total episodes for ${definition.slug}, received ${urls.length}.`);
    }

    if (apply) await importRelease(definition, urls);
    imported.push({ slug: definition.slug, episodes: urls.length });
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", releases: imported }, null, 2));
}

syncSkippedReleases()
  .catch((error: unknown) => {
    console.error("Kodik skipped-release synchronization failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
