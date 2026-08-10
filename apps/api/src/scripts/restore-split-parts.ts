import type { QueryResultRow } from "pg";

import { pool } from "../database/client.js";

type ReleaseRow = QueryResultRow & {
  id: string;
  title: string;
  release_year: number;
  episodes_total: number | null;
  episodes_released: number;
};

type EpisodeRow = QueryResultRow & {
  number: number;
  kodik_url: string | null;
};

type PartCandidate = {
  release: ReleaseRow;
  baseTitle: string;
  part: number;
};

type RestoreGroup = {
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
    /^(?<base>.+?)[\s.:—–-]+(?:\u0447\u0430\u0441\u0442\u044c|part)\s*(?<part>\d+|[ivxlcdm]+)\s*$/iu,
  );
  const base = match?.groups?.base?.trim();
  const part = match?.groups?.part ? partNumber(match.groups.part) : null;

  if (!base || !part || part < 2) return null;
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

function restoreGroups(releases: ReleaseRow[]): RestoreGroup[] {
  const byTitle = new Map<string, ReleaseRow[]>();
  for (const release of releases) {
    const key = normalizeTitle(release.title);
    const items = byTitle.get(key) ?? [];
    items.push(release);
    byTitle.set(key, items);
  }

  const groups = new Map<string, RestoreGroup>();
  for (const release of releases) {
    const part = extractPartCandidate(release);
    if (!part) continue;

    const target = chooseTarget(part, byTitle.get(normalizeTitle(part.baseTitle)) ?? []);
    if (!target) continue;

    const group = groups.get(target.id) ?? { target, sources: [] };
    group.sources.push(part);
    groups.set(target.id, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      sources: group.sources.sort((left, right) => left.part - right.part || left.release.release_year - right.release.release_year),
    }))
    .sort((left, right) => left.target.title.localeCompare(right.target.title, "ru"));
}

function hasCopiedTail(targetEpisodes: EpisodeRow[], sourceEpisodes: EpisodeRow[]): boolean {
  if (!sourceEpisodes.length || targetEpisodes.length <= sourceEpisodes.length) return false;
  if (!sourceEpisodes.every((episode, index) => episode.number === index + 1)) return false;

  const tail = targetEpisodes.slice(-sourceEpisodes.length);
  return tail.every((episode, index) => episode.kodik_url === sourceEpisodes[index]?.kodik_url);
}

async function restoreGroup(group: RestoreGroup, apply: boolean): Promise<{ removedEpisodes: number; restored: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const targetResult = await client.query<EpisodeRow>(
      "SELECT number, kodik_url FROM episodes WHERE release_id = $1 ORDER BY number",
      [group.target.id],
    );
    let remaining = targetResult.rows;
    let removedEpisodes = 0;

    for (const source of [...group.sources].reverse()) {
      const sourceResult = await client.query<EpisodeRow>(
        "SELECT number, kodik_url FROM episodes WHERE release_id = $1 ORDER BY number",
        [source.release.id],
      );
      if (!hasCopiedTail(remaining, sourceResult.rows)) {
        await client.query("ROLLBACK");
        return { removedEpisodes: 0, restored: false };
      }
      removedEpisodes += sourceResult.rows.length;
      remaining = remaining.slice(0, -sourceResult.rows.length);
    }

    if (apply) {
      const sourceEpisodeTotal = group.sources.reduce(
        (total, source) => total + (source.release.episodes_total ?? source.release.episodes_released),
        0,
      );
      const episodesTotal = group.target.episodes_total === null
        ? null
        : Math.max(remaining.length, group.target.episodes_total - sourceEpisodeTotal);

      await client.query(
        "DELETE FROM episodes WHERE release_id = $1 AND number > $2",
        [group.target.id, remaining.length],
      );
      await client.query(
        `UPDATE releases
         SET episodes_released = $1,
             episodes_total = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [remaining.length, episodesTotal, group.target.id],
      );
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }

    return { removedEpisodes, restored: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function restoreSplitParts(): Promise<void> {
  const apply = hasArgument("apply");
  const releases = await pool.query<ReleaseRow>(
    `SELECT id, title, release_year, episodes_total, episodes_released
     FROM releases
     WHERE release_type = 'series'
     ORDER BY title, release_year, id`,
  );
  const groups = restoreGroups(releases.rows);

  let restoredReleases = 0;
  let skippedReleases = 0;
  let removedEpisodes = 0;
  for (const group of groups) {
    const result = await restoreGroup(group, apply);
    if (result.restored) {
      restoredReleases += 1;
      removedEpisodes += result.removedEpisodes;
    } else {
      skippedReleases += 1;
    }
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    groups: groups.length,
    restoredReleases,
    skippedReleases,
    removedEpisodes,
  }, null, 2));
}

restoreSplitParts()
  .catch((error: unknown) => {
    console.error("Part restoration failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
