import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient, QueryResultRow } from "pg";

import { pool } from "../../database/client.js";
import type { AccountUser } from "../../types.js";
import { accountFromSession, sessionTokenFromRequest } from "../accounts/service.js";
import { awardNewAchievements } from "./service.js";

type AccountRequest = FastifyRequest & { account: AccountUser | null };

type CommentRow = QueryResultRow & {
  id: string;
  content: string;
  created_at: Date;
  updated_at: Date;
  user_id: string;
  username: string;
};

function bodyValue(body: unknown, key: string): unknown {
  return body && typeof body === "object" ? (body as Record<string, unknown>)[key] : undefined;
}

async function requireAccount(request: AccountRequest, reply: FastifyReply): Promise<AccountUser | null> {
  if (request.account) return request.account;
  await reply.code(401).send({ message: "Требуется вход в аккаунт." });
  return null;
}

function mapComment(row: CommentRow, viewerId: string | null) {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    author: { id: row.user_id, username: row.username },
    isOwn: viewerId === row.user_id,
  };
}

async function completeEpisode(
  client: PoolClient,
  userId: string,
  releaseSlug: string,
  episodeNumber: number,
) {
  const releaseResult = await client.query<QueryResultRow & {
    id: string;
    episodes_total: number | null;
    episodes_released: number;
    status: "ongoing" | "completed" | "announced";
  }>(
    `SELECT id, episodes_total, episodes_released, status
     FROM releases
     WHERE slug = $1
     FOR UPDATE`,
    [releaseSlug],
  );
  const release = releaseResult.rows[0];
  if (!release) return null;

  const availableEpisodes = release.episodes_released > 0
    ? release.episodes_released
    : release.status === "completed" ? Math.max(release.episodes_total ?? 0, 1) : 0;
  if (episodeNumber > availableEpisodes) return { invalidEpisode: true as const };

  const completionResult = await client.query(
    `INSERT INTO user_episode_completions (user_id, release_id, episode_number)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING episode_number`,
    [userId, release.id, episodeNumber],
  );
  await client.query(
    `INSERT INTO user_watch_history (user_id, release_id, episode_number, last_watched_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, release_id) DO UPDATE
     SET episode_number = GREATEST(COALESCE(user_watch_history.episode_number, 0), EXCLUDED.episode_number),
         last_watched_at = NOW()`,
    [userId, release.id, episodeNumber],
  );

  const countResult = await client.query<QueryResultRow & { count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM user_episode_completions
     WHERE user_id = $1 AND release_id = $2`,
    [userId, release.id],
  );
  const completedCount = countResult.rows[0]?.count ?? 0;
  const completionTarget = release.episodes_total
    ?? (release.status === "completed" ? release.episodes_released : 0);
  const status = completionTarget > 0 && completedCount >= completionTarget ? "completed" : "watching";

  await client.query(
    `INSERT INTO user_release_statuses (user_id, release_id, status, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, release_id) DO UPDATE
     SET status = CASE
       WHEN user_release_statuses.status = 'completed' THEN 'completed'
       ELSE EXCLUDED.status
     END,
     updated_at = NOW()`,
    [userId, release.id, status],
  );

  return {
    invalidEpisode: false as const,
    inserted: Boolean(completionResult.rowCount),
    completedCount,
    status,
  };
}

export const engagementRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (request) => {
    const accountRequest = request as AccountRequest;
    accountRequest.account = await accountFromSession(sessionTokenFromRequest(request));
  });

  app.post("/video/complete", async (request, reply) => {
    const account = await requireAccount(request as AccountRequest, reply);
    if (!account) return;
    const releaseSlugValue = bodyValue(request.body, "releaseSlug");
    const episodeNumberValue = bodyValue(request.body, "episodeNumber");
    const releaseSlug = typeof releaseSlugValue === "string" ? releaseSlugValue.trim() : "";
    const episodeNumber = Number(episodeNumberValue);
    if (!releaseSlug || !Number.isInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 10_000) {
      return reply.code(400).send({ message: "Укажите корректный релиз и номер серии." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await completeEpisode(client, account.id, releaseSlug, episodeNumber);
      if (!result) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ message: "Релиз не найден." });
      }
      if (result.invalidEpisode) {
        await client.query("ROLLBACK");
        return reply.code(400).send({ message: "Эта серия ещё не доступна." });
      }
      const newAchievements = await awardNewAchievements(account.id, client);
      await client.query("COMMIT");
      return { data: { ...result, newAchievements } };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.put<{ Params: { slug: string } }>("/profile/list/:slug", async (request, reply) => {
    const account = await requireAccount(request as AccountRequest, reply);
    if (!account) return;
    const statusValue = bodyValue(request.body, "status");
    if (statusValue !== "planned" && statusValue !== "watching" && statusValue !== "completed") {
      return reply.code(400).send({ message: "Неизвестный статус списка." });
    }
    const result = await pool.query(
      `INSERT INTO user_release_statuses (user_id, release_id, status, updated_at)
       SELECT $1, id, $3, NOW() FROM releases WHERE slug = $2
       ON CONFLICT (user_id, release_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
       RETURNING release_id`,
      [account.id, request.params.slug, statusValue],
    );
    if (!result.rowCount) return reply.code(404).send({ message: "Релиз не найден." });
    const newAchievements = await awardNewAchievements(account.id);
    return { data: { status: statusValue, newAchievements } };
  });

  app.get<{ Params: { slug: string }; Querystring: { limit?: string } }>("/releases/:slug/comments", async (request, reply) => {
    const releaseResult = await pool.query<QueryResultRow & { id: string }>("SELECT id FROM releases WHERE slug = $1", [request.params.slug]);
    const releaseId = releaseResult.rows[0]?.id;
    if (!releaseId) return reply.code(404).send({ message: "Релиз не найден." });
    const requestedLimit = Number(request.query?.limit ?? 50);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const result = await pool.query<CommentRow>(
      `SELECT c.id, c.content, c.created_at, c.updated_at, c.user_id, u.username
       FROM release_comments c
       JOIN app_users u ON u.id = c.user_id
       WHERE c.release_id = $1
       ORDER BY c.created_at DESC
       LIMIT $2`,
      [releaseId, limit],
    );
    const viewerId = (request as AccountRequest).account?.id ?? null;
    return { data: result.rows.map((row) => mapComment(row, viewerId)) };
  });

  app.post<{ Params: { slug: string } }>("/releases/:slug/comments", async (request, reply) => {
    const account = await requireAccount(request as AccountRequest, reply);
    if (!account) return;
    const contentValue = bodyValue(request.body, "content");
    const content = typeof contentValue === "string" ? contentValue.trim() : "";
    if (!content || content.length > 2000) {
      return reply.code(400).send({ message: "Комментарий должен содержать от 1 до 2000 символов." });
    }
    const recentResult = await pool.query(
      `SELECT 1 FROM release_comments
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '10 seconds'
       LIMIT 1`,
      [account.id],
    );
    if (recentResult.rowCount) return reply.code(429).send({ message: "Подождите несколько секунд перед новым комментарием." });

    const result = await pool.query<CommentRow>(
      `WITH inserted AS (
         INSERT INTO release_comments (user_id, release_id, content)
         SELECT $1, id, $3 FROM releases WHERE slug = $2
         RETURNING id, content, created_at, updated_at, user_id
       )
       SELECT inserted.id, inserted.content, inserted.created_at, inserted.updated_at, inserted.user_id, u.username
       FROM inserted
       JOIN app_users u ON u.id = inserted.user_id`,
      [account.id, request.params.slug, content],
    );
    const comment = result.rows[0];
    if (!comment) return reply.code(404).send({ message: "Релиз не найден." });
    const newAchievements = await awardNewAchievements(account.id);
    return reply.code(201).send({ data: { comment: mapComment(comment, account.id), newAchievements } });
  });

  app.delete<{ Params: { slug: string; commentId: string } }>("/releases/:slug/comments/:commentId", async (request, reply) => {
    const account = await requireAccount(request as AccountRequest, reply);
    if (!account) return;
    await pool.query(
      `DELETE FROM release_comments c
       USING releases r
       WHERE c.id = $1 AND c.user_id = $2 AND c.release_id = r.id AND r.slug = $3`,
      [request.params.commentId, account.id, request.params.slug],
    );
    return reply.code(204).send();
  });
};
