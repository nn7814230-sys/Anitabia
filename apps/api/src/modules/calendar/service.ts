import type { QueryResultRow } from "pg";

import { config } from "../../config.js";
import { pool } from "../../database/client.js";

const source = "kodik-shikimori";
const refreshMilliseconds = 6 * 60 * 60 * 1000;

type SourceAnime = {
  id?: string | number | null;
  name?: string | null;
  russian?: string | null;
  image?: { original?: string | null } | null;
};

type SourceCalendarEntry = {
  next_episode?: number | null;
  next_episode_at?: string | null;
  duration?: number | null;
  anime?: SourceAnime | null;
  kind?: string | null;
  score?: number | null;
  status?: string | null;
  episodes?: number | null;
  episodes_aired?: number | null;
  aired_on?: string | null;
  released_on?: string | null;
};

type CalendarEntry = {
  shikimoriId: number;
  animeName: string;
  animeRussian: string | null;
  posterUrl: string | null;
  nextEpisode: number | null;
  nextEpisodeAt: string | null;
  durationMinutes: number | null;
  animeKind: string | null;
  score: number | null;
  status: string | null;
  episodesTotal: number | null;
  episodesAired: number | null;
  airedOn: string | null;
  releasedOn: string | null;
};

type CalendarRow = QueryResultRow & {
  shikimori_id: number;
  anime_name: string;
  anime_russian: string | null;
  poster_url: string | null;
  next_episode: number | null;
  next_episode_at: Date | null;
  duration_minutes: number | null;
  anime_kind: string | null;
  score: string | null;
  status: string | null;
  episodes_total: number | null;
  episodes_aired: number | null;
  aired_on: string | null;
  released_on: string | null;
};

function nullableString(value: unknown, maximumLength = 2_000): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maximumLength) : null;
}

function nullablePositiveInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 32_767 ? number : null;
}

function nullableShikimoriId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}

function nullableScore(value: unknown): number | null {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 10 ? Math.round(score * 10) / 10 : null;
}

function nullableDate(value: unknown): string | null {
  const date = nullableString(value, 10);
  return date && /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : null;
}

function nullableTimestamp(value: unknown): string | null {
  const timestamp = nullableString(value, 64);
  return timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : null;
}

function nullableHttpUrl(value: unknown): string | null {
  const url = nullableString(value);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function normalizeEntry(value: unknown): CalendarEntry | null {
  if (!value || typeof value !== "object") return null;
  const sourceEntry = value as SourceCalendarEntry;
  const anime = sourceEntry.anime;
  const shikimoriId = nullableShikimoriId(anime?.id);
  const animeName = nullableString(anime?.name) ?? nullableString(anime?.russian);
  if (!shikimoriId || !animeName) return null;

  return {
    shikimoriId,
    animeName,
    animeRussian: nullableString(anime?.russian),
    posterUrl: nullableHttpUrl(anime?.image?.original),
    nextEpisode: nullablePositiveInteger(sourceEntry.next_episode),
    nextEpisodeAt: nullableTimestamp(sourceEntry.next_episode_at),
    durationMinutes: nullablePositiveInteger(sourceEntry.duration),
    animeKind: nullableString(sourceEntry.kind, 30),
    score: nullableScore(sourceEntry.score),
    status: nullableString(sourceEntry.status, 30),
    episodesTotal: nullablePositiveInteger(sourceEntry.episodes),
    episodesAired: nullablePositiveInteger(sourceEntry.episodes_aired),
    airedOn: nullableDate(sourceEntry.aired_on),
    releasedOn: nullableDate(sourceEntry.released_on),
  };
}

function calendarUrl(): URL {
  if (!config.kodikApiToken) throw new Error("KODIK_API_TOKEN is required for calendar synchronization.");
  const url = new URL(config.kodikCalendarUrl);
  url.searchParams.set("token", config.kodikApiToken);
  return url;
}

async function downloadCalendar(): Promise<{ raw: SourceCalendarEntry[]; entries: CalendarEntry[] }> {
  const response = await fetch(calendarUrl(), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Kodik calendar returned HTTP ${response.status}.`);

  const payload = await response.json() as unknown;
  if (!Array.isArray(payload)) throw new Error("Kodik calendar payload must be an array.");

  const entries = payload.map(normalizeEntry).filter((entry): entry is CalendarEntry => entry !== null);
  if (!entries.length) throw new Error("Kodik calendar did not contain valid entries.");
  return { raw: payload as SourceCalendarEntry[], entries };
}

export async function syncCalendarPayload(payload: unknown): Promise<{
  entries: number; syncedAt: string; updatedReleases: number; createdEpisodes: number;
}> {
  if (!Array.isArray(payload)) throw new Error("Calendar payload must be an array.");
  const raw = payload as SourceCalendarEntry[];
  const entries = raw.map(normalizeEntry).filter((entry): entry is CalendarEntry => entry !== null);
  if (!entries.length) throw new Error("Calendar payload did not contain valid entries.");
  const syncedAt = new Date();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    for (const entry of entries) {
      await client.query(
        `INSERT INTO release_calendar (
          shikimori_id, anime_name, anime_russian, poster_url, next_episode, next_episode_at,
          duration_minutes, anime_kind, score, status, episodes_total, episodes_aired,
          aired_on, released_on, source_synced_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        ) ON CONFLICT (shikimori_id) DO UPDATE SET
          anime_name = EXCLUDED.anime_name,
          anime_russian = EXCLUDED.anime_russian,
          poster_url = EXCLUDED.poster_url,
          next_episode = EXCLUDED.next_episode,
          next_episode_at = EXCLUDED.next_episode_at,
          duration_minutes = EXCLUDED.duration_minutes,
          anime_kind = EXCLUDED.anime_kind,
          score = EXCLUDED.score,
          status = EXCLUDED.status,
          episodes_total = EXCLUDED.episodes_total,
          episodes_aired = EXCLUDED.episodes_aired,
          aired_on = EXCLUDED.aired_on,
          released_on = EXCLUDED.released_on,
          source_synced_at = EXCLUDED.source_synced_at`,
        [
          entry.shikimoriId, entry.animeName, entry.animeRussian, entry.posterUrl,
          entry.nextEpisode, entry.nextEpisodeAt, entry.durationMinutes, entry.animeKind,
          entry.score, entry.status, entry.episodesTotal, entry.episodesAired,
          entry.airedOn, entry.releasedOn, syncedAt,
        ],
      );
    }

    await client.query(
      "DELETE FROM release_calendar WHERE source_synced_at <> $1",
      [syncedAt],
    );
    const episodeResult = await client.query(
      `WITH counts AS (
         SELECT r.id AS release_id,
                GREATEST(
                  r.episodes_released,
                  COALESCE(c.episodes_aired, 0),
                  GREATEST(COALESCE(c.next_episode, 1) - 1, 0)
                )::smallint AS target_count,
                c.duration_minutes
         FROM releases r
         JOIN release_calendar c ON c.shikimori_id = r.shikimori_id
         WHERE r.shikimori_id IS NOT NULL
       )
       INSERT INTO episodes (release_id, number, title, duration_seconds, kodik_url, published_at)
       SELECT counts.release_id, series.number::smallint, CONCAT('Серия ', series.number),
              COALESCE(counts.duration_minutes * 60, 1440), player.kodik_url, NOW()
       FROM counts
       JOIN LATERAL generate_series(1, counts.target_count) AS series(number) ON true
       JOIN LATERAL (
         SELECT e.kodik_url
         FROM episodes e
         WHERE e.release_id = counts.release_id AND e.kodik_url IS NOT NULL
         ORDER BY e.number DESC
         LIMIT 1
       ) AS player ON true
       ON CONFLICT (release_id, number) DO NOTHING`,
    );
    const releaseResult = await client.query(
      `UPDATE releases r
       SET episodes_released = GREATEST(
             r.episodes_released,
             COALESCE(c.episodes_aired, 0),
             GREATEST(COALESCE(c.next_episode, 1) - 1, 0)
           )::smallint,
           episodes_total = CASE
             WHEN c.episodes_total IS NOT NULL
               AND c.episodes_total >= GREATEST(COALESCE(c.episodes_aired, 0), COALESCE(c.next_episode, 1) - 1)
             THEN c.episodes_total
             ELSE r.episodes_total
           END,
           updated_at = NOW()
       FROM release_calendar c
       WHERE r.shikimori_id = c.shikimori_id
         AND (
           r.episodes_released < GREATEST(COALESCE(c.episodes_aired, 0), COALESCE(c.next_episode, 1) - 1)
           OR (c.episodes_total IS NOT NULL AND r.episodes_total IS DISTINCT FROM c.episodes_total)
         )`,
    );
    await client.query(
      `INSERT INTO calendar_syncs (source, synced_at, entries_count, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (source) DO UPDATE SET
         synced_at = EXCLUDED.synced_at,
         entries_count = EXCLUDED.entries_count,
         payload = EXCLUDED.payload`,
      [source, syncedAt, entries.length, JSON.stringify(raw)],
    );
    await client.query("COMMIT");
    return {
      entries: entries.length,
      syncedAt: syncedAt.toISOString(),
      updatedReleases: releaseResult.rowCount ?? 0,
      createdEpisodes: episodeResult.rowCount ?? 0,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function syncKodikCalendar(): Promise<{
  entries: number; syncedAt: string; updatedReleases: number; createdEpisodes: number;
}> {
  const { raw } = await downloadCalendar();
  return syncCalendarPayload(raw);
}

export async function listCalendarEntries(limit: number): Promise<{ entries: CalendarEntry[]; syncedAt: string | null }> {
  const [entriesResult, syncResult] = await Promise.all([
    pool.query<CalendarRow>(
      `SELECT shikimori_id, anime_name, anime_russian, poster_url, next_episode, next_episode_at,
              duration_minutes, anime_kind, score, status, episodes_total, episodes_aired,
              aired_on, released_on
       FROM release_calendar
       ORDER BY next_episode_at ASC NULLS LAST, anime_russian ASC NULLS LAST, anime_name ASC
       LIMIT $1`,
      [limit],
    ),
    pool.query<{ synced_at: Date }>(
      "SELECT synced_at FROM calendar_syncs WHERE source = $1",
      [source],
    ),
  ]);

  return {
    entries: entriesResult.rows.map((row) => ({
      shikimoriId: row.shikimori_id,
      animeName: row.anime_name,
      animeRussian: row.anime_russian,
      posterUrl: row.poster_url,
      nextEpisode: row.next_episode,
      nextEpisodeAt: row.next_episode_at?.toISOString() ?? null,
      durationMinutes: row.duration_minutes,
      animeKind: row.anime_kind,
      score: row.score === null ? null : Number(row.score),
      status: row.status,
      episodesTotal: row.episodes_total,
      episodesAired: row.episodes_aired,
      airedOn: row.aired_on,
      releasedOn: row.released_on,
    })),
    syncedAt: syncResult.rows[0]?.synced_at.toISOString() ?? null,
  };
}

export function startKodikCalendarScheduler(): () => void {
  let isSyncing = false;
  const run = async (): Promise<void> => {
    if (isSyncing) return;
    isSyncing = true;
    try {
      const result = await syncKodikCalendar();
      console.info(`[calendar] Synced ${result.entries} entries at ${result.syncedAt}.`);
    } catch (error) {
      console.error("[calendar] Synchronization failed", error);
    } finally {
      isSyncing = false;
    }
  };

  void run();
  const interval = setInterval(() => void run(), refreshMilliseconds);
  interval.unref();
  return () => clearInterval(interval);
}
