import type { QueryResultRow } from "pg";

import { pool } from "../database/client.js";
import type { ReleaseStatus } from "../types.js";

type ReleaseRow = QueryResultRow & {
  id: string;
  title: string;
  original_title: string | null;
  release_year: number;
  status: ReleaseStatus;
  episodes_total: number | null;
  episodes_released: number;
};

type PartCandidate = {
  release: ReleaseRow;
  baseTitle: string;
  part: number;
};

type MergeGroup = {
  target: ReleaseRow;
  sources: PartCandidate[];
};

const romanValues: Record<string, number> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
};

// "Part" is an official season number in these franchises rather than a
// split cour. Keep their separate seasons intact.
const excludedBaseTitles = new Set([
  "люпен iii",
  "с начала",
  "с начала 2",
]);

function hasArgument(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("ru-RU");
}

function romanToNumber(value: string): number | null {
  const letters = value.toUpperCase();
  if (!/^[IVXLCDM]+$/u.test(letters)) return null;

  let total = 0;
  let previous = 0;
  for (const letter of [...letters].reverse()) {
    const current = romanValues[letter];
    if (!current) return null;
    if (current < previous) total -= current;
    else {
      total += current;
      previous = current;
    }
  }
  return total;
}

function partNumber(value: string): number | null {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) return numeric;
  return romanToNumber(value);
}

function extractPartCandidate(release: ReleaseRow): PartCandidate | null {
  const match = release.title.match(
    /^(?<base>.+?)[\s.:—–-]+(?:часть|part)\s*(?<part>\d+|[ivxlcdm]+)\s*$/iu,
  );
  const base = match?.groups?.base?.trim();
  const part = match?.groups?.part ? partNumber(match.groups.part) : null;

  if (!base || !part || part < 2 || excludedBaseTitles.has(normalizeTitle(base))) return null;
  return { release, baseTitle: base, part };
}

function chooseTarget(source: PartCandidate, candidates: ReleaseRow[]): ReleaseRow | null {
  return candidates
    .filter((candidate) => candidate.id !== source.release.id)
    .sort((left, right) => {
      const leftIsEarlier = left.release_year <= source.release.release_year ? 0 : 1;
      const rightIsEarlier = right.release_year <= source.release.release_year ? 0 : 1;
      return leftIsEarlier - rightIsEarlier
        || Math.abs(left.release_year - source.release.release_year) - Math.abs(right.release_year - source.release.release_year)
        || left.release_year - right.release_year
        || left.id.localeCompare(right.id);
    })[0] ?? null;
}

function groupMerges(releases: ReleaseRow[]): { groups: MergeGroup[]; skipped: PartCandidate[] } {
  const byTitle = new Map<string, ReleaseRow[]>();
  for (const release of releases) {
    const key = normalizeTitle(release.title);
    const items = byTitle.get(key) ?? [];
    items.push(release);
    byTitle.set(key, items);
  }

  const groups = new Map<string, MergeGroup>();
  const skipped: PartCandidate[] = [];
  for (const release of releases) {
    const part = extractPartCandidate(release);
    if (!part) continue;

    const target = chooseTarget(part, byTitle.get(normalizeTitle(part.baseTitle)) ?? []);
    if (!target) {
      skipped.push(part);
      continue;
    }

    const group = groups.get(target.id) ?? { target, sources: [] };
    group.sources.push(part);
    groups.set(target.id, group);
  }

  return {
    groups: [...groups.values()]
      .map((group) => ({
        ...group,
        sources: group.sources.sort((left, right) => left.part - right.part || left.release.release_year - right.release.release_year),
      }))
      .sort((left, right) => left.target.title.localeCompare(right.target.title, "ru")),
    skipped,
  };
}

function mergedStatus(items: ReleaseRow[]): ReleaseStatus {
  if (items.some((item) => item.status === "ongoing")) return "ongoing";
  if (items.some((item) => item.status === "completed")) return "completed";
  return "announced";
}

function mergedEpisodeTotal(items: ReleaseRow[]): number | null {
  if (items.every((item) => item.episodes_total === null)) return null;
  return items.reduce((total, item) => total + (item.episodes_total ?? item.episodes_released), 0);
}

async function applyMerge(group: MergeGroup): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let offsetResult = await client.query<{ max_number: number }>(
      "SELECT COALESCE(MAX(number), 0)::integer AS max_number FROM episodes WHERE release_id = $1",
      [group.target.id],
    );
    let offset = Number(offsetResult.rows[0]?.max_number ?? 0);
    let copiedEpisodes = 0;

    for (const source of group.sources) {
      await client.query(
        `INSERT INTO release_genres (release_id, genre_id)
         SELECT $1, genre_id FROM release_genres WHERE release_id = $2
         ON CONFLICT DO NOTHING`,
        [group.target.id, source.release.id],
      );

      const copied = await client.query(
        `INSERT INTO episodes (release_id, number, title, duration_seconds, video_url, kodik_url, published_at)
         SELECT $1, number + $2, CONCAT('Серия ', number + $2), duration_seconds, video_url, kodik_url, published_at
         FROM episodes
         WHERE release_id = $3
         ORDER BY number`,
        [group.target.id, offset, source.release.id],
      );
      copiedEpisodes += copied.rowCount ?? 0;

      offsetResult = await client.query<{ max_number: number }>(
        "SELECT COALESCE(MAX(number), 0)::integer AS max_number FROM episodes WHERE release_id = $1",
        [group.target.id],
      );
      offset = Number(offsetResult.rows[0]?.max_number ?? offset);

      await client.query("DELETE FROM releases WHERE id = $1", [source.release.id]);
    }

    const allItems = [group.target, ...group.sources.map((source) => source.release)];
    const countResult = await client.query<{ count: number }>(
      "SELECT COUNT(*)::integer AS count FROM episodes WHERE release_id = $1",
      [group.target.id],
    );
    const episodeCount = Number(countResult.rows[0]?.count ?? 0);
    const total = mergedEpisodeTotal(allItems);

    await client.query(
      `UPDATE releases
       SET episodes_released = $1,
           episodes_total = $2,
           status = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [episodeCount, total === null ? null : Math.max(total, episodeCount), mergedStatus(allItems), group.target.id],
    );
    await client.query("COMMIT");
    return copiedEpisodes;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function mergeSplitParts(): Promise<void> {
  const apply = hasArgument("apply");
  const result = await pool.query<ReleaseRow>(
    `SELECT id, title, original_title, release_year, status, episodes_total, episodes_released
     FROM releases
     WHERE release_type = 'series'
     ORDER BY title, release_year, id`,
  );
  const { groups, skipped } = groupMerges(result.rows);

  let copiedEpisodes = 0;
  if (apply) {
    for (const group of groups) copiedEpisodes += await applyMerge(group);
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    mergedReleases: groups.length,
    removedPartCards: groups.reduce((count, group) => count + group.sources.length, 0),
    copiedEpisodes,
    skippedPartCards: skipped.length,
    groups: groups.map((group) => ({
      title: group.target.title,
      targetId: group.target.id,
      parts: group.sources.map((source) => ({ part: source.part, title: source.release.title, id: source.release.id })),
    })),
  }, null, 2));
}

mergeSplitParts()
  .catch((error: unknown) => {
    console.error("Part merge failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
