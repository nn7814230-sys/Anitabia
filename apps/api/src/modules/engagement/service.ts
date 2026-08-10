import type { PoolClient, QueryResultRow } from "pg";

import { pool } from "../../database/client.js";

export type Achievement = {
  id: string;
  title: string;
  description: string;
  iconUrl: string;
  awardedAt: string | null;
};

export type ProfileStats = {
  completedEpisodes: number;
  completedTitles: number;
  comments: number;
  longComments: number;
};

type AchievementRow = QueryResultRow & {
  id: string;
  title: string;
  description: string;
  icon_url: string;
  awarded_at: Date | null;
};

type QueryClient = Pick<PoolClient, "query">;

function mapAchievement(row: AchievementRow): Achievement {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    iconUrl: row.icon_url,
    awardedAt: row.awarded_at?.toISOString() ?? null,
  };
}

export async function awardNewAchievements(userId: string, client: QueryClient = pool): Promise<Achievement[]> {
  const result = await client.query<AchievementRow>(
    `WITH stats AS (
       SELECT
         (SELECT COUNT(*)::int FROM user_episode_completions WHERE user_id = $1) AS completed_episodes,
         (SELECT COUNT(*)::int FROM release_comments WHERE user_id = $1) AS comments,
         (SELECT COUNT(*)::int FROM release_comments WHERE user_id = $1 AND char_length(content) > 100) AS long_comments,
         (SELECT COUNT(*)::int FROM user_release_statuses WHERE user_id = $1 AND status = 'completed') AS completed_titles,
         EXISTS (
           SELECT 1
           FROM user_release_statuses urs
           JOIN release_genres rg ON rg.release_id = urs.release_id
           JOIN genres g ON g.id = rg.genre_id
           WHERE urs.user_id = $1 AND urs.status = 'completed'
             AND (g.slug = 'drama' OR lower(g.name) IN ('драма', 'трагедия'))
         ) AS completed_drama
     ), eligible AS (
       SELECT 'first-step'::text AS id FROM stats WHERE completed_episodes >= 1
       UNION ALL SELECT 'couch-expert' FROM stats WHERE long_comments >= 5
       UNION ALL SELECT 'title-eater' FROM stats WHERE completed_titles >= 10
       UNION ALL SELECT 'kamikaze' FROM stats WHERE completed_drama
       UNION ALL SELECT 'episode-century' FROM stats WHERE completed_episodes >= 100
     ), awarded AS (
       INSERT INTO user_achievements (user_id, achievement_id)
       SELECT $1, id FROM eligible
       ON CONFLICT DO NOTHING
       RETURNING achievement_id, awarded_at
     )
     SELECT a.id, a.title, a.description, a.icon_url, awarded.awarded_at
     FROM awarded
     JOIN achievements a ON a.id = awarded.achievement_id
     ORDER BY a.sort_order`,
    [userId],
  );
  return result.rows.map(mapAchievement);
}

export async function profileEngagement(userId: string): Promise<{
  achievements: Achievement[];
  stats: ProfileStats;
  releaseStatuses: Array<{ releaseId: string; status: "planned" | "watching" | "completed" }>;
}> {
  await awardNewAchievements(userId);

  const [achievementsResult, statsResult, statusesResult] = await Promise.all([
    pool.query<AchievementRow>(
      `SELECT a.id, a.title, a.description, a.icon_url, ua.awarded_at
       FROM achievements a
       LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1
       ORDER BY a.sort_order`,
      [userId],
    ),
    pool.query<QueryResultRow & { completed_episodes: number; completed_titles: number; comments: number; long_comments: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM user_episode_completions WHERE user_id = $1) AS completed_episodes,
         (SELECT COUNT(*)::int FROM user_release_statuses WHERE user_id = $1 AND status = 'completed') AS completed_titles,
         (SELECT COUNT(*)::int FROM release_comments WHERE user_id = $1) AS comments,
         (SELECT COUNT(*)::int FROM release_comments WHERE user_id = $1 AND char_length(content) > 100) AS long_comments`,
      [userId],
    ),
    pool.query<QueryResultRow & { release_id: string; status: "planned" | "watching" | "completed" }>(
      `SELECT release_id, status
       FROM user_release_statuses
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId],
    ),
  ]);

  const stats = statsResult.rows[0];
  return {
    achievements: achievementsResult.rows.map(mapAchievement),
    stats: {
      completedEpisodes: stats?.completed_episodes ?? 0,
      completedTitles: stats?.completed_titles ?? 0,
      comments: stats?.comments ?? 0,
      longComments: stats?.long_comments ?? 0,
    },
    releaseStatuses: statusesResult.rows.map((row) => ({ releaseId: row.release_id, status: row.status })),
  };
}
