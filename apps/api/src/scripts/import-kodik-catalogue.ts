import { existsSync, readFileSync, writeFileSync } from "node:fs";

import type { QueryResultRow } from "pg";

import { pool } from "../database/client.js";
import { kodikEmbedUrl } from "../modules/playback/kodik.js";
import type { ReleaseStatus, ReleaseType } from "../types.js";

type SourceMaterial = {
  anime_title?: string | null;
  title_en?: string | null;
  other_titles?: string[] | null;
  other_titles_en?: string[] | null;
  other_titles_jp?: string[] | null;
  anime_description?: string | null;
  description?: string | null;
  anime_poster_url?: string | null;
  poster_url?: string | null;
  screenshots?: string[] | null;
  anime_kind?: string | null;
  anime_status?: string | null;
  anime_genres?: string[] | null;
  all_genres?: string[] | null;
  shikimori_rating?: number | null;
  kinopoisk_rating?: number | null;
  imdb_rating?: number | null;
  minimal_age?: number | null;
  rating_mpaa?: string | null;
  episodes_total?: number | null;
  episodes_aired?: number | null;
};

type SourceRecord = {
  type?: "anime" | "anime-serial" | null;
  id?: string | null;
  shikimori_id?: string | number | null;
  title?: string | null;
  title_orig?: string | null;
  other_title?: string | null;
  year?: number | null;
  episodes_count?: number | null;
  last_episode?: number | null;
  player_link?: string | null;
  link?: string | null;
  blocked_countries?: string[] | null;
  updated_at?: string | null;
  translate?: string | null;
  translation?: { title?: string | null; type?: string | null } | null;
  material_data?: SourceMaterial | null;
};

type ExistingRelease = QueryResultRow & {
  slug: string;
  title: string;
  original_title: string | null;
  release_year: number;
  release_type: ReleaseType;
};

type PreparedRelease = {
  sourceId: string;
  slug: string;
  sourceKey: string;
  title: string;
  originalTitle: string | null;
  description: string;
  posterUrl: string;
  bannerUrl: string | null;
  releaseYear: number;
  releaseType: ReleaseType;
  status: ReleaseStatus;
  episodesTotal: number | null;
  episodesReleased: number;
  rating: number | null;
  ageRating: string;
  shikimoriId: number | null;
  genres: string[];
  aliases: string[];
  playerUrl: string;
};

const genreNames: Record<string, string> = {
  action: "Экшен",
  adventure: "Приключения",
  fantasy: "Фэнтези",
  drama: "Драма",
  comedy: "Комедия",
  sci_fi: "Фантастика",
  romance: "Романтика",
  mystery: "Детектив",
  supernatural: "Сверхъестественное",
  slice_of_life: "Повседневность",
  psychological: "Психология",
  thriller: "Триллер",
  sports: "Спорт",
  music: "Музыка",
  horror: "Ужасы",
  mecha: "Меха",
};

const genreRules: Array<[string, string[]]> = [
  ["action", ["экшен", "боевик", "action", "боевые искусства"]],
  ["adventure", ["приключен", "adventure"]],
  ["fantasy", ["фэнтези", "fantasy", "исэкай", "магия", "мифология"]],
  ["drama", ["драма", "drama", "истор"]],
  ["comedy", ["комедия", "comedy", "пародия"]],
  ["sci_fi", ["фантастика", "science fiction", "киберпанк", "космос"]],
  ["romance", ["романтика", "romance", "гарем", "сёдзё"]],
  ["mystery", ["детектив", "mystery", "тайна"]],
  ["supernatural", ["сверхъестествен", "supernatural", "мистика", "вампир"]],
  ["slice_of_life", ["повседневност", "slice of life"]],
  ["psychological", ["психолог", "psychological"]],
  ["thriller", ["триллер", "thriller"]],
  ["sports", ["спорт", "sports"]],
  ["music", ["музык", "music", "идол"]],
  ["horror", ["ужас", "horror", "хоррор"]],
  ["mecha", ["меха", "mecha", "робот"]],
];

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function requiredArgument(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

function hasArgument(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function readLimit(): number | null {
  const value = argument("limit");
  if (!value) return null;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer.");
  return limit;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function positiveInteger(value: number | null | undefined): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 32_767 ? number : null;
}

function externalInteger(value: string | number | null | undefined): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 2_147_483_647 ? number : null;
}

function validHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function releaseType(source: SourceRecord): ReleaseType {
  if (source.type === "anime-serial") return "series";
  const kind = source.material_data?.anime_kind;
  if (kind === "ova" || kind === "special" || kind === "tv_special") return "ova";
  if (kind === "ona" || kind === "cm" || kind === "music" || kind === "pv") return "ona";
  return "movie";
}

function releaseStatus(source: SourceRecord): ReleaseStatus {
  const status = source.material_data?.anime_status;
  if (status === "ongoing") return "ongoing";
  if (status === "anons") return "announced";
  return "completed";
}

function sourceEpisodesReleased(source: SourceRecord): number {
  if (source.type === "anime") return 1;

  const declaredTotal = positiveInteger(source.material_data?.episodes_total);
  const reported = positiveInteger(source.material_data?.episodes_aired)
    ?? positiveInteger(source.last_episode)
    ?? positiveInteger(source.episodes_count)
    ?? 1;

  // Kodik's episodes_count can include specials or report a stale aggregate.
  // Shikimori's aired count is preferred, followed by the actual last episode,
  // and no released count may exceed the declared size of a completed title.
  return declaredTotal ? Math.min(reported, declaredTotal) : reported;
}

function ageRating(source: SourceRecord): string {
  const age = positiveInteger(source.material_data?.minimal_age);
  if (age) return `${Math.min(age, 18)}+`;
  const mpaa = source.material_data?.rating_mpaa?.toUpperCase();
  if (mpaa === "R" || mpaa === "NC-17") return "18+";
  if (mpaa === "PG-13") return "16+";
  if (mpaa === "PG") return "12+";
  return "16+";
}

function rating(source: SourceRecord): number | null {
  const values = [
    source.material_data?.shikimori_rating,
    source.material_data?.kinopoisk_rating,
    source.material_data?.imdb_rating,
  ];
  const value = values.find((item) => typeof item === "number" && Number.isFinite(item) && item > 0);
  return typeof value === "number" ? Math.min(10, Math.round(value * 10) / 10) : null;
}

function sourceGenres(source: SourceRecord): string[] {
  const labels = [
    ...(source.material_data?.anime_genres ?? []),
    ...(source.material_data?.all_genres ?? []),
  ].map((item) => item.toLocaleLowerCase("ru-RU"));

  const mapped = genreRules
    .filter(([, needles]) => needles.some((needle) => labels.some((label) => label.includes(needle))))
    .map(([slug]) => slug);

  return mapped.length ? [...new Set(mapped)] : ["fantasy"];
}

function sourceAliases(source: SourceRecord): string[] {
  const values = [
    source.title,
    source.title_orig,
    source.other_title,
    source.material_data?.anime_title,
    source.material_data?.title_en,
    ...(source.material_data?.other_titles ?? []),
    ...(source.material_data?.other_titles_en ?? []),
    ...(source.material_data?.other_titles_jp ?? []),
  ];
  const aliases = new Map<string, string>();
  for (const value of values) {
    const alias = value?.replace(/\s+/g, " ").trim();
    const normalizedAlias = normalize(alias);
    if (alias && normalizedAlias && !aliases.has(normalizedAlias)) aliases.set(normalizedAlias, alias);
  }
  return [...aliases.values()];
}

function translationScore(source: SourceRecord): number {
  const translation = (source.translation?.title ?? source.translate ?? "").toLocaleLowerCase("ru-RU");
  const provider = translation.includes("anilibria") ? 1_000
    : translation.includes("aniliberty") ? 900
      : translation.includes("anidub") ? 800
        : translation.includes("anistar") ? 700
          : translation.includes("animevost") ? 600
            : 0;
  const translationType = source.translation?.type === "voice" ? 100 : 0;
  const episodeScore = sourceEpisodesReleased(source);
  const updateScore = Date.parse(source.updated_at ?? "") || 0;
  return provider + translationType + episodeScore / 10_000 + updateScore / 1e16;
}

function sourceKey(source: SourceRecord): string {
  return [
    source.type,
    normalize(source.title_orig ?? source.material_data?.anime_title ?? source.title),
    source.year ?? source.material_data?.episodes_total ?? "",
  ].join("|");
}

function sourceTitle(source: SourceRecord): string {
  return source.material_data?.anime_title?.trim() || source.title?.trim() || "";
}

function normalizedDescription(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function bestSourceDescription(source: SourceRecord): string {
  return [source.material_data?.description, source.material_data?.anime_description]
    .map(normalizedDescription)
    .sort((left, right) => right.length - left.length)[0] ?? "";
}

function mergeCandidateMetadata(preferred: SourceRecord, alternative: SourceRecord): SourceRecord {
  const description = [bestSourceDescription(preferred), bestSourceDescription(alternative)]
    .sort((left, right) => right.length - left.length)[0] ?? "";
  if (!description) return preferred;
  return {
    ...preferred,
    material_data: {
      ...preferred.material_data,
      description,
    },
  };
}

function cleanShikimoriDescription(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\[(?:character|anime|manga|ranobe)=\d+\s+([^\x5d]+)\]/giu, "$1")
    .replace(/\[url=[^\s\x5d]+\s+([^\x5d]+)\]/giu, "$1")
    .replace(/\[\/?(?:b|i|u|s|spoiler)\]/giu, "")
    .replace(/\[[^\x5d]+\]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function enrichMissingDescriptions(
  candidates: Map<string, SourceRecord>,
  cacheFile: string,
): Promise<{ requested: number; enriched: number; unavailable: number }> {
  const cache = existsSync(cacheFile)
    ? JSON.parse(readFileSync(cacheFile, "utf8")) as Record<string, string | null>
    : {};
  const missing = [...candidates.entries()].filter(([, source]) => !bestSourceDescription(source));
  let requested = 0;
  let enriched = 0;

  for (const [key, source] of missing) {
    const id = externalInteger(source.shikimori_id);
    if (!id) continue;
    const cacheKey = String(id);
    let description = cache[cacheKey];

    if (description === undefined) {
      requested += 1;
      try {
        const response = await fetch(`https://shikimori.one/api/animes/${id}`, {
          headers: { accept: "application/json", "user-agent": "Anitabia/1.0 (https://anitabia.ru)" },
          signal: AbortSignal.timeout(20_000),
        });
        if (response.status === 429) {
          await new Promise((resolve) => setTimeout(resolve, 10_000));
          continue;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json() as { description?: unknown };
        description = cleanShikimoriDescription(payload.description) || null;
      } catch (error) {
        console.warn(`[descriptions] Could not load Shikimori ${id}:`, error);
        description = null;
      }
      cache[cacheKey] = description;
      if (requested % 25 === 0) {
        writeFileSync(cacheFile, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
        console.log(`[descriptions] Checked ${requested} uncached titles.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }

    if (description) {
      candidates.set(key, {
        ...source,
        material_data: { ...source.material_data, description },
      });
      enriched += 1;
    }
  }

  writeFileSync(cacheFile, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  return { requested, enriched, unavailable: missing.length - enriched };
}

function isSplitPartTitle(value: string | null | undefined): boolean {
  return /(?:\u0447\u0430\u0441\u0442\u044c|part)\s*(?:\d+|[ivxlcdm]+)\s*$/iu.test(value ?? "");
}

// Kodik can use one original title for a whole season while Russian titles
// distinguish its separate parts. Preserve those cards independently.
function candidateKey(source: SourceRecord): string {
  const title = sourceTitle(source);
  return isSplitPartTitle(title) ? `${sourceKey(source)}|${normalize(title)}` : sourceKey(source);
}

function sourceSlug(source: SourceRecord): string {
  const id = source.id?.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!id) throw new Error("Source record has no valid id.");
  return `kodik-${id}`;
}

function prepare(source: SourceRecord): PreparedRelease | null {
  const playerUrl = kodikEmbedUrl(source.player_link ?? source.link ?? null);
  const title = sourceTitle(source);
  const posterUrl = validHttpUrl(source.material_data?.anime_poster_url ?? source.material_data?.poster_url);
  const releaseYear = positiveInteger(source.year);
  const sourceId = source.id?.trim();
  if (!playerUrl || !title || !posterUrl || !releaseYear || !sourceId || !source.type) return null;

  const status = releaseStatus(source);
  const episodesReleased = sourceEpisodesReleased(source);
  const declaredTotal = positiveInteger(source.material_data?.episodes_total);
  const episodesTotal = status === "ongoing"
    ? declaredTotal
    : declaredTotal ?? episodesReleased;
  const description = (bestSourceDescription(source) || "Описание пока не добавлено.").slice(0, 12_000);

  return {
    sourceId,
    slug: sourceSlug(source),
    sourceKey: sourceKey(source),
    title,
    originalTitle: source.title_orig?.trim() || source.material_data?.title_en?.trim() || null,
    description,
    posterUrl,
    bannerUrl: validHttpUrl(source.material_data?.screenshots?.[0]),
    releaseYear,
    releaseType: releaseType(source),
    status,
    episodesTotal,
    episodesReleased,
    rating: rating(source),
    ageRating: ageRating(source),
    shikimoriId: externalInteger(source.shikimori_id),
    genres: sourceGenres(source),
    aliases: sourceAliases(source),
    playerUrl,
  };
}

function existingKeys(releases: ExistingRelease[]): Map<string, string> {
  const keys = new Map<string, string>();
  for (const release of releases) {
    for (const title of [release.title, release.original_title]) {
      const normalizedTitle = normalize(title);
      if (normalizedTitle) keys.set([release.release_type, release.release_year, normalizedTitle].join("|"), release.slug);
    }
  }
  return keys;
}

function matchingExistingSlug(item: PreparedRelease, keys: Map<string, string>): string | null {
  const titles = isSplitPartTitle(item.title) ? [item.title] : [item.title, item.originalTitle];
  for (const title of titles
    .filter((title): title is string => Boolean(title))
  ) {
    const slug = keys.get([item.releaseType, item.releaseYear, normalize(title)].join("|"));
    if (slug) return slug;
  }
  return null;
}

function collectCandidates(file: string, candidates: Map<string, SourceRecord>, availableKeys: Set<string>): void {
  const source = JSON.parse(readFileSync(file, "utf8")) as unknown;
  if (!Array.isArray(source)) throw new Error(`${file} must contain a JSON array.`);

  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const record = item as SourceRecord;
    if ((record.blocked_countries ?? []).includes("RU")) continue;
    const key = candidateKey(record);
    availableKeys.add(key);
    if (!prepare(record)) continue;

    const current = candidates.get(key);
    if (!current) {
      candidates.set(key, record);
      continue;
    }
    const preferred = translationScore(record) > translationScore(current) ? record : current;
    const alternative = preferred === record ? current : record;
    candidates.set(key, mergeCandidateMetadata(preferred, alternative));
  }
}

async function ensureGenres(): Promise<void> {
  for (const [slug, name] of Object.entries(genreNames)) {
    await pool.query(
      "INSERT INTO genres (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING",
      [slug, name],
    );
  }
}

async function importBatch(items: PreparedRelease[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of items) {
      const release = await client.query<QueryResultRow & { id: string }>(
        `INSERT INTO releases (
          slug, title, original_title, description, poster_url, banner_url, release_year, release_type,
          status, episodes_total, episodes_released, rating, age_rating, shikimori_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (slug) DO UPDATE SET
          title = EXCLUDED.title, original_title = EXCLUDED.original_title,
          description = CASE
            WHEN EXCLUDED.description = 'Описание пока не добавлено.' THEN releases.description
            ELSE EXCLUDED.description
          END,
          poster_url = EXCLUDED.poster_url, banner_url = EXCLUDED.banner_url, release_year = EXCLUDED.release_year,
          release_type = EXCLUDED.release_type, status = EXCLUDED.status, episodes_total = EXCLUDED.episodes_total,
          episodes_released = CASE
            WHEN EXCLUDED.status = 'ongoing'
              THEN GREATEST(releases.episodes_released, EXCLUDED.episodes_released)
            ELSE EXCLUDED.episodes_released
          END,
          rating = EXCLUDED.rating, age_rating = EXCLUDED.age_rating,
          shikimori_id = COALESCE(EXCLUDED.shikimori_id, releases.shikimori_id),
          updated_at = NOW()
        RETURNING id`,
        [
          item.slug, item.title, item.originalTitle, item.description, item.posterUrl, item.bannerUrl,
          item.releaseYear, item.releaseType, item.status, item.episodesTotal, item.episodesReleased,
          item.rating, item.ageRating, item.shikimoriId,
        ],
      );
      const releaseId = release.rows[0]?.id;
      if (!releaseId) throw new Error(`Could not import ${item.sourceId}.`);

      await client.query("DELETE FROM release_genres WHERE release_id = $1", [releaseId]);
      await client.query(
        `INSERT INTO release_genres (release_id, genre_id)
         SELECT $1, id FROM genres WHERE slug = ANY($2::text[])
         ON CONFLICT DO NOTHING`,
        [releaseId, item.genres],
      );

      await client.query("DELETE FROM release_aliases WHERE release_id = $1", [releaseId]);
      await client.query(
        `INSERT INTO release_aliases (release_id, alias, normalized_alias)
         SELECT $1, alias, normalized
         FROM unnest($2::text[], $3::text[]) AS source(alias, normalized)
         ON CONFLICT DO NOTHING`,
        [releaseId, item.aliases, item.aliases.map(normalize)],
      );

      const episodeNumbers = Array.from({ length: item.episodesReleased }, (_, index) => index + 1);
      await client.query(
        `INSERT INTO episodes (release_id, number, title, duration_seconds, kodik_url, published_at)
         SELECT $1, number, CONCAT('Серия ', number), 1440, $3, NOW()
         FROM unnest($2::smallint[]) AS number
         ON CONFLICT (release_id, number) DO UPDATE SET
           title = EXCLUDED.title,
           duration_seconds = EXCLUDED.duration_seconds,
           kodik_url = EXCLUDED.kodik_url,
           published_at = EXCLUDED.published_at`,
        [releaseId, episodeNumbers, item.playerUrl],
      );
      await client.query(
        "DELETE FROM episodes WHERE release_id = $1 AND number > $2 AND $3 = 'completed'",
        [releaseId, item.episodesReleased, item.status],
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

async function importCatalogue() {
  const serialFile = requiredArgument("serial");
  const movieFile = requiredArgument("movies");
  const apply = hasArgument("apply");
  const updateExisting = hasArgument("update-existing");
  const limit = readLimit();
  const candidates = new Map<string, SourceRecord>();
  const availableKeys = new Set<string>();

  collectCandidates(serialFile, candidates, availableKeys);
  collectCandidates(movieFile, candidates, availableKeys);

  const descriptionEnrichment = hasArgument("enrich-descriptions")
    ? await enrichMissingDescriptions(candidates, requiredArgument("description-cache"))
    : { requested: 0, enriched: 0, unavailable: 0 };

  const prepared = [...candidates.values()]
    .map(prepare)
    .filter((item): item is PreparedRelease => item !== null)
    .sort((left, right) => right.releaseYear - left.releaseYear || left.title.localeCompare(right.title, "ru"));
  const existing = await pool.query<ExistingRelease>(
    "SELECT slug, title, original_title, release_year, release_type FROM releases",
  );
  const known = existingKeys(existing.rows);
  const resolved = prepared.map((item) => {
    const existingSlug = matchingExistingSlug(item, known);
    return { item: existingSlug ? { ...item, slug: existingSlug } : item, existing: Boolean(existingSlug) };
  });
  const selected = updateExisting ? resolved : resolved.filter(({ existing }) => !existing);
  const limitedItems = (limit === null ? selected : selected.slice(0, limit)).map(({ item }) => item);
  const existingSelected = (limit === null ? selected : selected.slice(0, limit)).filter(({ existing }) => existing).length;

  if (apply) {
    await ensureGenres();
    for (let index = 0; index < limitedItems.length; index += 100) {
      await importBatch(limitedItems.slice(index, index + 100));
      console.log(`Imported ${Math.min(index + 100, limitedItems.length)} of ${limitedItems.length} releases.`);
    }
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    updateExisting,
    descriptionEnrichment,
    sourceGroups: availableKeys.size,
    skippedWithoutPoster: availableKeys.size - candidates.size,
    alreadyInCatalogue: resolved.filter(({ existing }) => existing).length,
    existingSelected,
    newSelected: limitedItems.length - existingSelected,
    releases: limitedItems.length,
    episodes: limitedItems.reduce((sum, item) => sum + item.episodesReleased, 0),
    missingDescriptions: limitedItems.filter((item) => item.description === "Описание пока не добавлено.").length,
    shortDescriptions: limitedItems.filter((item) => item.description !== "Описание пока не добавлено." && item.description.length < 120).length,
  }, null, 2));
}

importCatalogue()
  .catch((error: unknown) => {
    console.error("Kodik catalogue import failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
