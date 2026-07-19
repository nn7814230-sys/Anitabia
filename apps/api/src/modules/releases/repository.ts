import type { QueryResultRow } from "pg";
import { pool } from "../../database/client.js";
import type { Episode, Release, ReleaseStatus } from "../../types.js";

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
  published_at: Date | null;
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
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    durationSeconds: row.duration_seconds,
    videoUrl: row.video_url,
    publishedAt: row.published_at?.toISOString() ?? null,
  };
}

export interface ReleaseFilters {
  search?: string;
  genre?: string;
  status?: ReleaseStatus;
  limit: number;
}

export async function listReleases(filters: ReleaseFilters): Promise<Release[]> {
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

  values.push(String(filters.limit));
  const condition = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const result = await pool.query<ReleaseRow>(
    `SELECT ${releaseFields}
     FROM releases r
     LEFT JOIN release_genres rg ON rg.release_id = r.id
     LEFT JOIN genres g ON g.id = rg.genre_id
     ${condition}
     GROUP BY r.id
     ORDER BY r.created_at DESC
     LIMIT $${values.length}`,
    values,
  );

  return result.rows.map(mapRelease);
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
    `SELECT id, number, title, duration_seconds, video_url, published_at
     FROM episodes
     WHERE release_id = $1
     ORDER BY number`,
    [row.id],
  );

  return { release: mapRelease(row), episodes: episodeResult.rows.map(mapEpisode) };
}
