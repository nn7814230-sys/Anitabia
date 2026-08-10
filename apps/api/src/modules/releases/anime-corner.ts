import type { QueryResultRow } from "pg";

import { pool } from "../../database/client.js";

const source = "anime-corner-weekly";
const feedUrl = "https://animecorner.me/category/anime-of-the-week/feed/";
const refreshMilliseconds = 6 * 60 * 60 * 1000;

type Ranking = { rank: number; title: string; votePercent: number | null };
type FeedEntry = { title: string; url: string; publishedAt: string | null };
type AliasRow = QueryResultRow & { release_id: string; alias: string };

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—",
    rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (entity, code: string) => {
    if (code.startsWith("#x")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return named[code.toLowerCase()] ?? entity;
  });
}

function plainText(value: string): string {
  return decodeEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/giu, "$1").replace(/<[^>]+>/gu, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalTokens(value: string): string[] {
  const roman: Record<string, string> = { ii: "2", iii: "3", iv: "4", v: "5", vi: "6" };
  return plainText(value)
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/\b(ii|iii|iv|v|vi)\b/gu, (token) => roman[token] ?? token)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter((token) => token && !new Set(["the", "a", "an", "of", "and", "in", "to", "is", "season", "part", "cour"]).has(token));
}

function matchScore(left: string, right: string): number {
  const leftTokens = canonicalTokens(left);
  const rightTokens = canonicalTokens(right);
  if (!leftTokens.length || !rightTokens.length) return 0;
  const leftCompact = leftTokens.join("");
  const rightCompact = rightTokens.join("");
  if (leftCompact === rightCompact) return 1;

  const leftNumbers = new Set(leftTokens.filter((token) => /^\d+$/u.test(token)));
  const rightNumbers = new Set(rightTokens.filter((token) => /^\d+$/u.test(token)));
  if (leftNumbers.size && rightNumbers.size && ![...leftNumbers].some((number) => rightNumbers.has(number))) return 0;

  const containment = leftCompact.includes(rightCompact) || rightCompact.includes(leftCompact)
    ? Math.min(leftCompact.length, rightCompact.length) / Math.max(leftCompact.length, rightCompact.length)
    : 0;
  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const dice = (2 * intersection) / (leftSet.size + rightSet.size);
  return Math.max(containment, dice);
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { accept: "text/html, application/rss+xml", "user-agent": "Anitabia/1.0 (https://anitabia.ru)" },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Anime Corner returned HTTP ${response.status} for ${url}.`);
  return response.text();
}

function latestRankingEntry(feed: string): FeedEntry {
  for (const item of feed.match(/<item\b[\s\S]*?<\/item>/giu) ?? []) {
    const title = plainText(item.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? "");
    if (!/anime rankings\s*[–—-]\s*week\s*\d+/iu.test(title)) continue;
    const url = plainText(item.match(/<link\b[^>]*>([\s\S]*?)<\/link>/iu)?.[1] ?? "");
    const published = plainText(item.match(/<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/iu)?.[1] ?? "");
    if (!url.startsWith("https://animecorner.me/")) continue;
    return { title, url, publishedAt: Number.isFinite(Date.parse(published)) ? new Date(published).toISOString() : null };
  }
  throw new Error("Anime Corner feed did not contain a weekly ranking article.");
}

function parseRankings(html: string): Ranking[] {
  const rankings = new Map<number, Ranking>();
  for (const row of html.match(/<tr\b[^>]*>[\s\S]*?(?=<tr\b|<\/table>)/giu) ?? []) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)(?=<td\b|<\/tr>|$)/giu)]
      .map((match) => plainText(match[1].replace(/<\/td>\s*$/iu, "")));
    if (cells.length < 3) continue;
    const rank = Number.parseInt(cells[0], 10);
    const votePercent = Number.parseFloat(cells[2]);
    if (!Number.isInteger(rank) || rank < 1 || rank > 200 || !cells[1]) continue;
    rankings.set(rank, { rank, title: cells[1], votePercent: Number.isFinite(votePercent) ? votePercent : null });
  }
  const result = [...rankings.values()].sort((left, right) => left.rank - right.rank);
  if (result.length < 20 || result[0]?.rank !== 1) throw new Error(`Anime Corner parser found only ${result.length} ranking rows.`);
  return result;
}

async function matchRankings(rankings: Ranking[]): Promise<Map<number, string>> {
  const result = await pool.query<AliasRow>(
    `SELECT ra.release_id, ra.alias
     FROM release_aliases ra
     JOIN releases r ON r.id = ra.release_id
     WHERE r.status IN ('ongoing', 'announced') OR r.release_year >= EXTRACT(YEAR FROM NOW()) - 1`,
  );
  const aliases = new Map<string, string[]>();
  for (const row of result.rows) aliases.set(row.release_id, [...(aliases.get(row.release_id) ?? []), row.alias]);

  const matches = new Map<number, string>();
  for (const ranking of rankings) {
    const candidates = [...aliases.entries()]
      .map(([releaseId, releaseAliases]) => ({
        releaseId,
        score: Math.max(...releaseAliases.map((alias) => matchScore(ranking.title, alias))),
      }))
      .sort((left, right) => right.score - left.score);
    const best = candidates[0];
    const next = candidates[1];
    if (best && best.score >= 0.62 && (best.score === 1 || best.score - (next?.score ?? 0) >= 0.08)) {
      matches.set(ranking.rank, best.releaseId);
    }
  }
  return matches;
}

export async function syncAnimeCornerRankings(apply = true): Promise<{
  articleTitle: string; articleUrl: string; rankings: number; matched: number; applied: boolean;
}> {
  const entry = latestRankingEntry(await fetchText(feedUrl));
  const rankings = parseRankings(await fetchText(entry.url));
  const matches = await matchRankings(rankings);
  if (matches.size < 5) throw new Error(`Only ${matches.size} Anime Corner titles matched the catalogue.`);

  if (apply) {
    const syncedAt = new Date();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM anime_corner_rankings");
      for (const ranking of rankings) {
        await client.query(
          `INSERT INTO anime_corner_rankings (
            rank, source_title, vote_percent, release_id, article_url, article_title, published_at, synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [ranking.rank, ranking.title, ranking.votePercent, matches.get(ranking.rank) ?? null,
            entry.url, entry.title, entry.publishedAt, syncedAt],
        );
      }
      await client.query(
        `INSERT INTO anime_corner_syncs (
          source, article_url, article_title, published_at, synced_at, rankings_count, matched_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (source) DO UPDATE SET
          article_url = EXCLUDED.article_url, article_title = EXCLUDED.article_title,
          published_at = EXCLUDED.published_at, synced_at = EXCLUDED.synced_at,
          rankings_count = EXCLUDED.rankings_count, matched_count = EXCLUDED.matched_count`,
        [source, entry.url, entry.title, entry.publishedAt, syncedAt, rankings.length, matches.size],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return { articleTitle: entry.title, articleUrl: entry.url, rankings: rankings.length, matched: matches.size, applied: apply };
}

export function startAnimeCornerScheduler(): () => void {
  let syncing = false;
  const run = async () => {
    if (syncing) return;
    syncing = true;
    try {
      const result = await syncAnimeCornerRankings();
      console.info(`[anime-corner] Synced ${result.matched}/${result.rankings} titles from ${result.articleTitle}.`);
    } catch (error) {
      console.error("[anime-corner] Synchronization failed", error);
    } finally {
      syncing = false;
    }
  };
  void run();
  const interval = setInterval(() => void run(), refreshMilliseconds);
  interval.unref();
  return () => clearInterval(interval);
}
