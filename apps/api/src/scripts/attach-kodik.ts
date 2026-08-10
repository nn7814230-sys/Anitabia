import { pool } from "../database/client.js";
import { kodikEmbedUrl } from "../modules/playback/kodik.js";

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing --${name} argument.`);
  }

  return value;
}

async function attach() {
  const slug = argument("release");
  const playerUrl = kodikEmbedUrl(argument("url"));
  const number = Number(argument("episode"));

  if (!playerUrl) {
    throw new Error("--url must be an HTTPS player URL on a Kodik domain.");
  }

  if (!Number.isInteger(number) || number < 1) {
    throw new Error("--episode must be a positive integer.");
  }

  const result = await pool.query<{ title: string | null }>(
    `UPDATE episodes
     SET kodik_url = $1
     FROM releases
     WHERE episodes.release_id = releases.id
       AND releases.slug = $2
       AND episodes.number = $3
     RETURNING episodes.title`,
    [playerUrl, slug, number],
  );

  if (!result.rowCount) {
    throw new Error(`Episode ${number} was not found for release "${slug}".`);
  }

  console.log(`Kodik player attached to ${slug}, episode ${number}.`);
}

attach()
  .catch((error: unknown) => {
    console.error("Could not attach Kodik player", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
