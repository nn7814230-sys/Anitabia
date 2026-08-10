import type { QueryResultRow } from "pg";

import { config } from "../config.js";
import { pool } from "../database/client.js";
import { kodikEmbedUrl } from "../modules/playback/kodik.js";
import type { ReleaseType } from "../types.js";

type ReleaseRow = QueryResultRow & {
  id: string;
  slug: string;
  title: string;
  original_title: string | null;
  release_year: number;
  release_type: ReleaseType;
  episodes_released: number;
};

type EpisodeRow = QueryResultRow & {
  id: string;
  number: number;
  kodik_url: string | null;
};

type KodikEpisode = string | { link?: string | null };

type KodikResult = {
  link?: string | null;
  title?: string | null;
  title_orig?: string | null;
  other_title?: string | null;
  year?: number | null;
  type?: string | null;
  episodes_count?: number | null;
  translation?: { title?: string | null; type?: string | null } | null;
  seasons?: Record<string, {
    link?: string | null;
    episodes?: Record<string, KodikEpisode>;
  }> | null;
};

type KodikResponse = {
  results?: KodikResult[];
};

type Candidate = {
  result: KodikResult;
  score: number;
};

function hasArgument(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function candidateTitles(result: KodikResult): string[] {
  const otherTitles = result.other_title?.split(/\s*\/\s*/u) ?? [];
  return [result.title, result.title_orig, ...otherTitles].filter((title): title is string => Boolean(title));
}

function preferredTranslationScore(translationTitle: string | null | undefined): number {
  const title = normalizeTitle(translationTitle ?? "");
  if (title.includes("anilibria")) return 40;
  if (title.includes("anidub")) return 20;
  if (title.includes("animevost") || title.includes("anistar")) return 10;
  if (title.includes("subtitles")) return -10;
  return 0;
}

function titleScore(release: ReleaseRow, result: KodikResult): number {
  const sourceTitles = [release.title, release.original_title]
    .filter((title): title is string => Boolean(title))
    .map(normalizeTitle);
  const remoteTitles = candidateTitles(result).map(normalizeTitle);

  if (sourceTitles.some((title) => remoteTitles.includes(title))) return 100;
  return 0;
}

function expectedKodikType(releaseType: ReleaseType): string | null {
  if (releaseType === "series") return "anime-serial";
  if (releaseType === "movie") return "anime";
  return null;
}

function chooseCandidate(release: ReleaseRow, results: KodikResult[]): Candidate | null {
  const expectedType = expectedKodikType(release.release_type);
  const candidates = results
    .map((result): Candidate | null => {
      const exactTitleScore = titleScore(release, result);
      if (!exactTitleScore) return null;

      let score = exactTitleScore * 100;
      if (result.year === release.release_year) score += 50;
      if (expectedType && result.type === expectedType) score += 25;
      if (typeof result.episodes_count === "number") {
        score += Math.min(result.episodes_count, 1_000) * 2;
        if (result.episodes_count >= release.episodes_released) score += 25;
      }
      score += preferredTranslationScore(result.translation?.title);

      return { result, score };
    })
    .filter((candidate): candidate is Candidate => candidate !== null)
    .sort((left, right) => right.score - left.score);

  return candidates[0] ?? null;
}

function episodePlayerUrls(result: KodikResult): Map<number, string> {
  const firstSeason = result.seasons?.["1"] ?? Object.values(result.seasons ?? {})[0];
  const playerUrls = new Map<number, string>();

  for (const [number, episode] of Object.entries(firstSeason?.episodes ?? {})) {
    const parsedNumber = Number(number);
    const episodeLink = typeof episode === "string" ? episode : episode.link;
    const playerUrl = kodikEmbedUrl(episodeLink ?? null);

    if (Number.isInteger(parsedNumber) && parsedNumber > 0 && playerUrl) {
      playerUrls.set(parsedNumber, playerUrl);
    }
  }

  if (playerUrls.size) return playerUrls;

  const fallbackUrl = kodikEmbedUrl(firstSeason?.link ?? result.link ?? null);
  if (fallbackUrl) playerUrls.set(1, fallbackUrl);
  return playerUrls;
}

async function findKodikResults(release: ReleaseRow): Promise<KodikResult[]> {
  const endpoint = new URL("/search", config.kodikApiUrl);
  endpoint.searchParams.set("token", config.kodikApiToken ?? "");
  endpoint.searchParams.set("title", release.original_title ?? release.title);
  endpoint.searchParams.set("limit", "50");
  endpoint.searchParams.set("with_episodes", "true");

  const expectedType = expectedKodikType(release.release_type);
  if (expectedType) endpoint.searchParams.set("types", expectedType);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Kodik API returned HTTP ${response.status}.`);
  }

  const payload = await response.json() as KodikResponse;
  return Array.isArray(payload.results) ? payload.results : [];
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function sync() {
  if (!config.kodikApiToken) {
    throw new Error("KODIK_API_TOKEN is required for Kodik synchronization.");
  }

  const apply = hasArgument("apply");
  const replace = hasArgument("replace");
  const releases = await pool.query<ReleaseRow>(
    `SELECT id, slug, title, original_title, release_year, release_type, episodes_released
     FROM releases
     ORDER BY created_at DESC`,
  );

  let matched = 0;
  let skipped = 0;
  let linkedEpisodes = 0;
  let createdEpisodes = 0;
  let updatedEpisodes = 0;
  let preserved = 0;

  for (const [index, release] of releases.rows.entries()) {
    const results = await findKodikResults(release);
    const candidate = chooseCandidate(release, results);

    if (!candidate) {
      skipped += 1;
      continue;
    }

    matched += 1;
    const playerUrls = episodePlayerUrls(candidate.result);
    if (!playerUrls.size) {
      skipped += 1;
      matched -= 1;
      continue;
    }

    const episodes = await pool.query<EpisodeRow>(
      `SELECT id, number, kodik_url
       FROM episodes
       WHERE release_id = $1
       ORDER BY number`,
      [release.id],
    );
    const existingEpisodes = new Map(episodes.rows.map((episode) => [episode.number, episode]));

    for (const [number, playerUrl] of playerUrls) {
      const episode = existingEpisodes.get(number);
      if (episode?.kodik_url && !replace) {
        preserved += 1;
        continue;
      }

      if (apply) {
        await pool.query(
          `INSERT INTO episodes (release_id, number, duration_seconds, kodik_url, published_at)
           VALUES ($1, $2, 1440, $3, NOW())
           ON CONFLICT (release_id, number) DO UPDATE
           SET kodik_url = EXCLUDED.kodik_url`,
          [release.id, number, playerUrl],
        );
      }

      linkedEpisodes += 1;
      if (episode) updatedEpisodes += 1;
      else createdEpisodes += 1;
    }

    if (apply) {
      const availableEpisodeCount = await pool.query<{ count: number }>(
        `SELECT count(*)::integer AS count
         FROM episodes
         WHERE release_id = $1 AND kodik_url IS NOT NULL`,
        [release.id],
      );
      const episodeCount = Number(availableEpisodeCount.rows[0]?.count ?? 0);

      await pool.query(
        `UPDATE releases
         SET episodes_released = $1::smallint,
             episodes_total = GREATEST(COALESCE(episodes_total, 0::smallint), $1::smallint),
             updated_at = NOW()
         WHERE id = $2`,
        [episodeCount, release.id],
      );
    }

    if (index < releases.rows.length - 1) await sleep(250);
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    releases: releases.rowCount ?? 0,
    matched,
    skipped,
    episodeLinks: linkedEpisodes,
    createdEpisodes,
    updatedEpisodes,
    preserved,
  }, null, 2));
}

sync()
  .catch((error: unknown) => {
    console.error("Kodik synchronization failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
