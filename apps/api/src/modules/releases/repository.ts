import type { QueryResultRow } from "pg";

import { pool } from "../../database/client.js";
import { kodikEmbedUrl } from "../playback/kodik.js";
import type { Episode, Release, ReleaseStatus } from "../../types.js";
import { popularReleaseSlugs } from "./popular.js";

type ReleaseRow = QueryResultRow & {
  id: string;
  slug: string;
  title: string;
  original_title: string | null;
  description: string;
  poster_url: string;
  banner_url: string | null;
  trailer_url: string | null;
  official_url: string | null;
  release_year: number;
  release_type: Release["releaseType"];
  status: ReleaseStatus;
  episodes_total: number | null;
  episodes_released: number;
  rating: string | null;
  age_rating: string;
  genres: string[];
};

type EpisodeRow = QueryResultRow & {
  id: string;
  number: number;
  title: string | null;
  duration_seconds: number | null;
  video_url: string | null;
  kodik_url: string | null;
  published_at: Date | null;
};

type ReleaseSitemapRow = QueryResultRow & {
  slug: string;
  updated_at: Date;
};

const releaseFields = `
  r.id, r.slug, r.title, r.original_title, r.description, r.poster_url, r.banner_url, r.trailer_url, r.official_url,
  r.release_year, r.release_type, r.status, r.episodes_total, r.episodes_released,
  r.rating, r.age_rating,
  COALESCE(array_agg(g.name) FILTER (WHERE g.name IS NOT NULL), '{}') AS genres
`;

function mapRelease(row: ReleaseRow): Release {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    originalTitle: row.original_title,
    description: row.description,
    posterUrl: row.poster_url,
    bannerUrl: row.banner_url,
    trailerUrl: row.trailer_url,
    officialUrl: row.official_url,
    releaseYear: row.release_year,
    releaseType: row.release_type,
    status: row.status,
    episodesTotal: row.episodes_total,
    episodesReleased: row.episodes_released,
    rating: row.rating === null ? null : Number(row.rating),
    ageRating: row.age_rating,
    genres: row.genres,
  };
}

function mapEpisode(row: EpisodeRow): Episode {
  const embedUrl = kodikEmbedUrl(row.kodik_url);

  return {
    id: row.id,
    number: row.number,
    title: row.title,
    durationSeconds: row.duration_seconds,
    videoUrl: row.video_url,
    embedUrl,
    videoProvider: embedUrl ? "kodik" : row.video_url ? "native" : null,
    publishedAt: row.published_at?.toISOString() ?? null,
  };
}

export interface ReleaseFilters {
  search?: string;
  genre?: string;
  status?: ReleaseStatus;
  limit: number;
  offset: number;
}

export interface ReleaseListResult {
  releases: Release[];
  total: number;
}

export interface PopularReleaseResult {
  releases: Release[];
  source: {
    label: string;
    url: string | null;
    publishedAt: string | null;
    syncedAt: string | null;
  };
}

function releaseConditions(filters: Omit<ReleaseFilters, "limit" | "offset">): { condition: string; values: string[] } {
  const where: string[] = [];
  const values: string[] = [];

  if (filters.search) {
    values.push(`%${filters.search}%`);
    where.push(`(r.title ILIKE $${values.length} OR r.original_title ILIKE $${values.length})`);
  }

  if (filters.status) {
    values.push(filters.status);
    where.push(`r.status = $${values.length}`);
  }

  if (filters.genre) {
    values.push(filters.genre);
    where.push(`EXISTS (
      SELECT 1 FROM release_genres rg_filter
      JOIN genres g_filter ON g_filter.id = rg_filter.genre_id
      WHERE rg_filter.release_id = r.id AND g_filter.slug = $${values.length}
    )`);
  }

  return { condition: where.length ? `WHERE ${where.join(" AND ")}` : "", values };
}

export async function listReleases(filters: ReleaseFilters): Promise<ReleaseListResult> {
  const { condition, values } = releaseConditions(filters);
  const pageValues = [...values, String(filters.limit), String(filters.offset)];
  const result = await pool.query<ReleaseRow>(
    `SELECT ${releaseFields}
     FROM releases r
     LEFT JOIN release_genres rg ON rg.release_id = r.id
     LEFT JOIN genres g ON g.id = rg.genre_id
     ${condition}
     GROUP BY r.id
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT $${values.length + 1}
     OFFSET $${values.length + 2}`,
    pageValues,
  );

  const totalResult = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM releases r
     ${condition}`,
    values,
  );

  return {
    releases: result.rows.map(mapRelease),
    total: Number(totalResult.rows[0]?.count ?? 0),
  };
}

function animeCornerLabel(articleTitle: string): string {
  const match = articleTitle.match(/(Winter|Spring|Summer|Fall)\s+(\d{4})\s+Anime Rankings\s*[–—-]\s*Week\s*(\d+)/iu);
  if (!match) return `По голосованию Anime Corner · ${articleTitle}`;
  const seasons: Record<string, string> = { winter: "зима", spring: "весна", summer: "лето", fall: "осень" };
  return `По голосованию Anime Corner · ${seasons[match[1].toLowerCase()]} ${match[2]}, неделя ${match[3]}`;
}

export async function listPopularReleases(): Promise<PopularReleaseResult> {
  const dynamic = await pool.query<ReleaseRow>(
    `SELECT ${releaseFields}
     FROM anime_corner_rankings popular
     JOIN releases r ON r.id = popular.release_id
     LEFT JOIN release_genres rg ON rg.release_id = r.id
     LEFT JOIN genres g ON g.id = rg.genre_id
     WHERE popular.release_id IS NOT NULL
     GROUP BY r.id, popular.rank
     ORDER BY popular.rank
     LIMIT 12`,
  );
  const sync = await pool.query<{
    article_url: string; article_title: string; published_at: Date | null; synced_at: Date;
  }>(
    `SELECT article_url, article_title, published_at, synced_at
     FROM anime_corner_syncs WHERE source = 'anime-corner-weekly'`,
  );
  const syncRow = sync.rows[0];
  if (dynamic.rows.length >= 5 && syncRow) {
    return {
      releases: dynamic.rows.map(mapRelease),
      source: {
        label: animeCornerLabel(syncRow.article_title),
        url: syncRow.article_url,
        publishedAt: syncRow.published_at?.toISOString() ?? null,
        syncedAt: syncRow.synced_at.toISOString(),
      },
    };
  }

  const fallback = await pool.query<ReleaseRow>(
    `SELECT ${releaseFields}
     FROM unnest($1::text[]) WITH ORDINALITY AS popular(slug, position)
     JOIN releases r ON r.slug = popular.slug
     LEFT JOIN release_genres rg ON rg.release_id = r.id
     LEFT JOIN genres g ON g.id = rg.genre_id
     GROUP BY r.id, popular.position
     ORDER BY popular.position`,
    [popularReleaseSlugs],
  );

  return {
    releases: fallback.rows.map(mapRelease),
    source: {
      label: "По голосованию Anime Corner · резервная подборка",
      url: null,
      publishedAt: null,
      syncedAt: null,
    },
  };
}

export async function findReleaseBySlug(
  slug: string,
): Promise<{ release: Release; episodes: Episode[] } | null> {
  const releaseResult = await pool.query<ReleaseRow>(
    `SELECT ${releaseFields}
     FROM releases r
     LEFT JOIN release_genres rg ON rg.release_id = r.id
     LEFT JOIN genres g ON g.id = rg.genre_id
     WHERE r.slug = $1
     GROUP BY r.id`,
    [slug],
  );

  const row = releaseResult.rows[0];
  if (!row) return null;

  const episodeResult = await pool.query<EpisodeRow>(
    `SELECT id, number, title, duration_seconds, video_url, kodik_url, published_at
     FROM episodes
     WHERE release_id = $1
     ORDER BY number`,
    [row.id],
  );

  return { release: mapRelease(row), episodes: episodeResult.rows.map(mapEpisode) };
}

export async function listReleaseSitemapEntries(): Promise<Array<{ slug: string; updatedAt: Date }>> {
  const result = await pool.query<ReleaseSitemapRow>(
    `SELECT slug, updated_at
     FROM releases
     ORDER BY updated_at DESC`,
  );

  return result.rows.map((row) => ({
    slug: row.slug,
    updatedAt: row.updated_at,
  }));
}
