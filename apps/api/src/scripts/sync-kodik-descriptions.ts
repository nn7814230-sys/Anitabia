import { readFileSync } from "node:fs";

import type { QueryResultRow } from "pg";

import { pool } from "../database/client.js";
import type { ReleaseType } from "../types.js";

type SourceMaterial = {
  anime_title?: string | null;
  title_en?: string | null;
  anime_description?: string | null;
  description?: string | null;
  anime_kind?: string | null;
};

type SourceRecord = {
  type?: "anime" | "anime-serial" | null;
  id?: string | null;
  shikimori_id?: string | number | null;
  title?: string | null;
  title_orig?: string | null;
  year?: number | null;
  material_data?: SourceMaterial | null;
};

type ReleaseRow = QueryResultRow & {
  id: string;
  slug: string;
  title: string;
  original_title: string | null;
  release_year: number;
  release_type: ReleaseType;
};

const missingDescription = "Описание пока не добавлено.";
const generatedDescription = "«%» — карточка расширенного каталога Anitabia.%";
const shikimoriEndpoint = "https://shikimori.io/api/graphql";
const shikimoriRequestIntervalMs = 750;

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function requiredArgument(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function positiveInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 32_767 ? number : null;
}

function sourceReleaseType(source: SourceRecord): ReleaseType {
  if (source.type === "anime-serial") return "series";
  const kind = source.material_data?.anime_kind;
  if (kind === "ova" || kind === "special" || kind === "tv_special") return "ova";
  if (kind === "ona" || kind === "cm" || kind === "music" || kind === "pv") return "ona";
  return "movie";
}

function sourceSlug(source: SourceRecord): string | null {
  const id = source.id?.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return id ? `kodik-${id}` : null;
}

function cleanDescription(value: string | null | undefined): string | null {
  if (!value) return null;
  const description = value
    .replace(/<br\s*\/?>/giu, " ")
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&quot;/giu, "\"")
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&amp;/giu, "&")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 12_000);
  return description.length >= 20 ? description : null;
}

function sourceTitles(source: SourceRecord): string[] {
  return [
    source.material_data?.anime_title,
    source.title,
    source.title_orig,
    source.material_data?.title_en,
  ].filter((title): title is string => Boolean(title?.trim()));
}

function titleKey(releaseType: ReleaseType, releaseYear: number, title: string): string | null {
  const normalizedTitle = normalize(title);
  return normalizedTitle ? `${releaseType}|${releaseYear}|${normalizedTitle}` : null;
}

function addDescription(map: Map<string, string>, key: string, description: string): void {
  const current = map.get(key);
  if (!current || description.length > current.length) map.set(key, description);
}

function addShikimoriId(map: Map<string, Set<number>>, key: string, shikimoriId: number): void {
  const ids = map.get(key) ?? new Set<number>();
  ids.add(shikimoriId);
  map.set(key, ids);
}

function collectDescriptions(
  file: string,
  bySlug: Map<string, string>,
  byTitle: Map<string, Set<string>>,
  shikimoriBySlug: Map<string, number>,
  shikimoriByTitle: Map<string, Set<number>>,
  shikimoriByName: Map<string, Set<number>>,
): void {
  const source = JSON.parse(readFileSync(file, "utf8")) as unknown;
  if (!Array.isArray(source)) throw new Error(`${file} must contain a JSON array.`);

  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const record = item as SourceRecord;
    const description = cleanDescription(record.material_data?.anime_description ?? record.material_data?.description);
    const year = positiveInteger(record.year);
    if (!year || !record.type) continue;

    const slug = sourceSlug(record);
    const shikimoriId = positiveInteger(record.shikimori_id);
    if (slug && description) addDescription(bySlug, slug, description);
    if (slug && shikimoriId) shikimoriBySlug.set(slug, shikimoriId);

    const releaseType = sourceReleaseType(record);
    for (const title of sourceTitles(record)) {
      const key = titleKey(releaseType, year, title);
      if (!key) continue;
      if (description) {
        const descriptions = byTitle.get(key) ?? new Set<string>();
        descriptions.add(description);
        byTitle.set(key, descriptions);
      }
      if (shikimoriId) {
        addShikimoriId(shikimoriByTitle, key, shikimoriId);
        addShikimoriId(shikimoriByName, normalize(title), shikimoriId);
      }
    }
  }
}

function titleDescription(release: ReleaseRow, byTitle: Map<string, Set<string>>): string | null {
  const matches = new Set<string>();
  for (const title of [release.title, release.original_title]) {
    if (!title) continue;
    const key = titleKey(release.release_type, release.release_year, title);
    if (!key) continue;
    for (const description of byTitle.get(key) ?? []) matches.add(description);
  }
  return matches.size === 1 ? [...matches][0] ?? null : null;
}

function titleShikimoriId(
  release: ReleaseRow,
  byTitle: Map<string, Set<number>>,
  byName: Map<string, Set<number>>,
): number | null {
  const matches = new Set<number>();
  for (const title of [release.title, release.original_title]) {
    if (!title) continue;
    const key = titleKey(release.release_type, release.release_year, title);
    if (!key) continue;
    for (const shikimoriId of byTitle.get(key) ?? []) matches.add(shikimoriId);
  }
  if (matches.size === 1) return [...matches][0] ?? null;
  if (matches.size > 1) return null;

  for (const title of [release.title, release.original_title]) {
    if (!title) continue;
    for (const shikimoriId of byName.get(normalize(title)) ?? []) matches.add(shikimoriId);
  }
  return matches.size === 1 ? [...matches][0] ?? null : null;
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

type ShikimoriAnime = { id: string | number; description?: string | null };
type ShikimoriResponse = { data?: { animes?: ShikimoriAnime[] }; errors?: Array<{ message?: string }> };

async function fetchShikimoriDescriptions(ids: number[]): Promise<Map<number, string>> {
  const descriptions = new Map<number, string>();
  const batches = Array.from({ length: Math.ceil(ids.length / 50) }, (_, index) => ids.slice(index * 50, index * 50 + 50));

  for (const [index, batch] of batches.entries()) {
    if (index) await pause(shikimoriRequestIntervalMs);
    const response = await fetch(shikimoriEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Anitabia/1.0 (supportanitabia@gmail.com)",
      },
      body: JSON.stringify({
        query: "query ($ids: String!, $limit: Int!) { animes(ids: $ids, limit: $limit) { id description } }",
        variables: { ids: batch.join(","), limit: batch.length },
      }),
    });
    if (!response.ok) throw new Error(`Shikimori returned HTTP ${response.status}.`);
    const payload = await response.json() as ShikimoriResponse;
    if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message ?? "Unknown GraphQL error").join("; "));
    for (const anime of payload.data?.animes ?? []) {
      const id = positiveInteger(anime.id);
      const description = cleanDescription(anime.description);
      if (id && description) descriptions.set(id, description);
    }
  }

  return descriptions;
}

async function syncDescriptions(): Promise<void> {
  const serialFile = requiredArgument("serial");
  const movieFile = requiredArgument("movies");
  const apply = process.argv.includes("--apply");
  const bySlug = new Map<string, string>();
  const byTitle = new Map<string, Set<string>>();
  const shikimoriBySlug = new Map<string, number>();
  const shikimoriByTitle = new Map<string, Set<number>>();
  const shikimoriByName = new Map<string, Set<number>>();

  collectDescriptions(serialFile, bySlug, byTitle, shikimoriBySlug, shikimoriByTitle, shikimoriByName);
  collectDescriptions(movieFile, bySlug, byTitle, shikimoriBySlug, shikimoriByTitle, shikimoriByName);

  const releases = await pool.query<ReleaseRow>(
    `SELECT id, slug, title, original_title, release_year, release_type
     FROM releases
     WHERE btrim(description) = '' OR description = $1 OR description LIKE $2`,
    [missingDescription, generatedDescription],
  );

  const updates = new Map<string, string>();
  const unresolvedReleases: ReleaseRow[] = [];
  for (const release of releases.rows) {
    const description = bySlug.get(release.slug) ?? titleDescription(release, byTitle);
    if (description) updates.set(release.id, description);
    else unresolvedReleases.push(release);
  }

  const shikimoriReleaseIds = new Map<string, number>();
  for (const release of unresolvedReleases) {
    const shikimoriId = shikimoriBySlug.get(release.slug) ?? titleShikimoriId(release, shikimoriByTitle, shikimoriByName);
    if (shikimoriId) shikimoriReleaseIds.set(release.id, shikimoriId);
  }
  const shikimoriDescriptions = await fetchShikimoriDescriptions([...new Set(shikimoriReleaseIds.values())]);
  for (const [releaseId, shikimoriId] of shikimoriReleaseIds) {
    const description = shikimoriDescriptions.get(shikimoriId);
    if (description) updates.set(releaseId, description);
  }

  if (apply && updates.size) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [id, description] of updates) {
        await client.query(
          "UPDATE releases SET description = $1, updated_at = NOW() WHERE id = $2",
          [description, id],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    sourceDescriptions: bySlug.size,
    releasesWithoutDescription: releases.rowCount ?? 0,
    kodikMatches: releases.rows.length - unresolvedReleases.length,
    shikimoriCandidates: new Set(shikimoriReleaseIds.values()).size,
    shikimoriDescriptions: shikimoriDescriptions.size,
    updated: updates.size,
    unresolved: (releases.rowCount ?? 0) - updates.size,
  }, null, 2));
}

syncDescriptions()
  .catch((error: unknown) => {
    console.error("Kodik description synchronization failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
