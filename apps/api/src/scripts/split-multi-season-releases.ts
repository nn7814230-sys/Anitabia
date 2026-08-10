import { pool } from "../database/client.js";

type SeasonOne = {
  slug: string;
  episodes: number;
};

// These releases were part of the original demonstration catalogue. Their
// episode count combined several seasons, while the Kodik import stores every
// following season as its own release. Keep the base card as season one only.
const firstSeasons: SeasonOne[] = [
  { slug: "that-time-i-got-reincarnated", episodes: 24 },
  { slug: "re-zero", episodes: 25 },
  { slug: "bungou-stray-dogs", episodes: 12 },
  { slug: "overlord", episodes: 13 },
  { slug: "mushoku-tensei", episodes: 23 },
  { slug: "fire-force", episodes: 24 },
  { slug: "blue-lock", episodes: 24 },
  { slug: "yuru-camp", episodes: 12 },
  { slug: "konosuba", episodes: 10 },
  { slug: "my-dress-up-darling", episodes: 12 },
];

function hasArgument(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function normalizeSeasons(): Promise<void> {
  const apply = hasArgument("apply");
  const client = await pool.connect();
  let trimmedEpisodes = 0;

  try {
    if (apply) await client.query("BEGIN");

    for (const season of firstSeasons) {
      const release = await client.query<{ id: string; title: string; episodes_released: number }>(
        `SELECT id, title, episodes_released
         FROM releases
         WHERE slug = $1
         FOR UPDATE`,
        [season.slug],
      );
      const item = release.rows[0];
      if (!item) throw new Error(`Release ${season.slug} was not found.`);

      const removable = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM episodes
         WHERE release_id = $1 AND number > $2`,
        [item.id, season.episodes],
      );
      trimmedEpisodes += Number(removable.rows[0]?.count ?? 0);

      if (apply) {
        await client.query(
          "DELETE FROM episodes WHERE release_id = $1 AND number > $2",
          [item.id, season.episodes],
        );
        await client.query(
          `UPDATE releases
           SET status = 'completed',
               episodes_total = $1,
               episodes_released = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [season.episodes, item.id],
        );
      }

      console.log(`${item.title}: ${item.episodes_released} -> ${season.episodes} episodes`);
    }

    if (apply) await client.query("COMMIT");
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", releases: firstSeasons.length, trimmedEpisodes }, null, 2));
  } catch (error) {
    if (apply) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

normalizeSeasons()
  .catch((error: unknown) => {
    console.error("Season split failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
