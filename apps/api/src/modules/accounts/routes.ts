import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { QueryResultRow } from "pg";

import { pool } from "../../database/client.js";
import type { AccountUser, Release } from "../../types.js";
import { profileEngagement } from "../engagement/service.js";
import {
  accountByEmail,
  accountFromSession,
  createAccount,
  createSession,
  deleteSession,
  expiredSessionCookie,
  normalizeEmail,
  normalizeUsername,
  passwordMatches,
  sessionCookie,
  sessionTokenFromRequest,
  updateAccountUsername,
  validEmail,
  validPassword,
  validUsername,
} from "./service.js";

type AccountRequest = FastifyRequest & { account: AccountUser | null };

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
  status: Release["status"];
  episodes_total: number | null;
  episodes_released: number;
  rating: string | null;
  age_rating: string;
  genres: string[];
  last_watched_at?: Date;
  episode_number?: number | null;
};

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

const releaseFields = `
  r.id, r.slug, r.title, r.original_title, r.description, r.poster_url, r.banner_url, r.trailer_url, r.official_url,
  r.release_year, r.release_type, r.status, r.episodes_total, r.episodes_released, r.rating, r.age_rating,
  COALESCE(array_agg(g.name) FILTER (WHERE g.name IS NOT NULL), '{}') AS genres
`;

function bodyValue(body: unknown, key: string): string {
  if (!body || typeof body !== "object") return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function setSession(reply: FastifyReply, token: string): void {
  reply.header("set-cookie", sessionCookie(token));
}

async function requireAccount(request: AccountRequest, reply: FastifyReply): Promise<AccountUser | null> {
  if (request.account) return request.account;
  await reply.code(401).send({ message: "Требуется вход в аккаунт." });
  return null;
}

async function profileReleases(userId: string): Promise<{ favorites: Release[]; history: Array<Release & { lastWatchedAt: string; episodeNumber: number | null }> }> {
  const favoritesResult = await pool.query<ReleaseRow>(
    `SELECT ${releaseFields}
     FROM user_favorites f
     JOIN releases r ON r.id = f.release_id
     LEFT JOIN release_genres rg ON rg.release_id = r.id
     LEFT JOIN genres g ON g.id = rg.genre_id
     WHERE f.user_id = $1
     GROUP BY r.id, f.created_at
     ORDER BY f.created_at DESC
     LIMIT 100`,
    [userId],
  );
  const historyResult = await pool.query<ReleaseRow>(
    `SELECT ${releaseFields}, h.last_watched_at, h.episode_number
     FROM user_watch_history h
     JOIN releases r ON r.id = h.release_id
     LEFT JOIN release_genres rg ON rg.release_id = r.id
     LEFT JOIN genres g ON g.id = rg.genre_id
     WHERE h.user_id = $1
     GROUP BY r.id, h.last_watched_at, h.episode_number
     ORDER BY h.last_watched_at DESC
     LIMIT 100`,
    [userId],
  );

  return {
    favorites: favoritesResult.rows.map(mapRelease),
    history: historyResult.rows.map((row) => ({
      ...mapRelease(row),
      lastWatchedAt: row.last_watched_at?.toISOString() ?? new Date(0).toISOString(),
      episodeNumber: row.episode_number ?? null,
    })),
  };
}

export const accountRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (request) => {
    const accountRequest = request as AccountRequest;
    accountRequest.account = await accountFromSession(sessionTokenFromRequest(request));
  });

  app.post("/auth/register", async (request, reply) => {
    const email = normalizeEmail(bodyValue(request.body, "email"));
    const password = bodyValue(request.body, "password");
    const username = normalizeUsername(bodyValue(request.body, "username"));
    if (!validEmail(email) || !validPassword(password) || !validUsername(username)) {
      return reply.code(400).send({ message: "Проверьте e-mail, имя (3–32 символа) и пароль (от 8 символов)." });
    }

    try {
      const user = await createAccount(email, username, password);
      setSession(reply, await createSession(user.id));
      return reply.code(201).send({ data: user });
    } catch (error: unknown) {
      if (typeof error === "object" && error && "code" in error && error.code === "23505") {
        return reply.code(409).send({ message: "Такой e-mail или имя уже заняты." });
      }
      throw error;
    }
  });

  app.post("/auth/login", async (request, reply) => {
    const email = normalizeEmail(bodyValue(request.body, "email"));
    const password = bodyValue(request.body, "password");
    const user = validEmail(email) ? await accountByEmail(email) : null;
    if (!user || !(await passwordMatches(password, user.password_hash))) {
      return reply.code(401).send({ message: "Неверный e-mail или пароль." });
    }

    const account: AccountUser = { id: user.id, email: user.email, username: user.username, createdAt: user.created_at.toISOString() };
    setSession(reply, await createSession(account.id));
    return { data: account };
  });

  app.post("/auth/logout", async (request, reply) => {
    await deleteSession(sessionTokenFromRequest(request));
    reply.header("set-cookie", expiredSessionCookie());
    return reply.code(204).send();
  });

  app.get("/auth/me", async (request) => ({ data: (request as AccountRequest).account }));

  app.get("/profile", async (request, reply) => {
    const account = await requireAccount(request as AccountRequest, reply);
    if (!account) return;
    const [releases, engagement] = await Promise.all([
      profileReleases(account.id),
      profileEngagement(account.id),
    ]);
    return { data: { user: account, ...releases, ...engagement } };
  });

  app.patch("/profile", async (request, reply) => {
    const account = await requireAccount(request as AccountRequest, reply);
    if (!account) return;
    const username = normalizeUsername(bodyValue(request.body, "username"));
    if (!validUsername(username)) return reply.code(400).send({ message: "Имя должно содержать от 3 до 32 символов." });

    try {
      const user = await updateAccountUsername(account.id, username);
      return { data: user };
    } catch (error: unknown) {
      if (typeof error === "object" && error && "code" in error && error.code === "23505") {
        return reply.code(409).send({ message: "Это имя уже занято." });
      }
      throw error;
    }
  });

  app.put<{ Params: { slug: string } }>("/profile/favorites/:slug", async (request, reply) => {
    const account = await requireAccount(request as AccountRequest, reply);
    if (!account) return;
    const result = await pool.query(
      `INSERT INTO user_favorites (user_id, release_id)
       SELECT $1, id FROM releases WHERE slug = $2
       ON CONFLICT DO NOTHING
       RETURNING release_id`,
      [account.id, request.params.slug],
    );
    if (!result.rowCount) {
      const exists = await pool.query("SELECT 1 FROM releases WHERE slug = $1", [request.params.slug]);
      if (!exists.rowCount) return reply.code(404).send({ message: "Релиз не найден." });
    }
    return reply.code(204).send();
  });

  app.delete<{ Params: { slug: string } }>("/profile/favorites/:slug", async (request, reply) => {
    const account = await requireAccount(request as AccountRequest, reply);
    if (!account) return;
    await pool.query(
      `DELETE FROM user_favorites f
       USING releases r
       WHERE f.user_id = $1 AND f.release_id = r.id AND r.slug = $2`,
      [account.id, request.params.slug],
    );
    return reply.code(204).send();
  });

  app.post("/profile/history", async (request, reply) => {
    const account = await requireAccount(request as AccountRequest, reply);
    if (!account) return;
    const releaseSlug = bodyValue(request.body, "releaseSlug");
    const requestedEpisode = Number(bodyValue(request.body, "episodeNumber"));
    const episodeNumber = Number.isInteger(requestedEpisode) && requestedEpisode > 0 ? requestedEpisode : null;
    const result = await pool.query(
      `INSERT INTO user_watch_history (user_id, release_id, episode_number, last_watched_at)
       SELECT $1, id, $3, NOW() FROM releases WHERE slug = $2
       ON CONFLICT (user_id, release_id) DO UPDATE
       SET episode_number = EXCLUDED.episode_number, last_watched_at = NOW()
       RETURNING release_id`,
      [account.id, releaseSlug, episodeNumber],
    );
    if (!result.rowCount) return reply.code(404).send({ message: "Релиз не найден." });
    return reply.code(204).send();
  });
};
