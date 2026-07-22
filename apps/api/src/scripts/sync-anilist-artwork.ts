import { pool } from "../database/client.js";

type Artwork = {
  coverImage: { large: string | null } | null;
  bannerImage: string | null;
};

type ArtworkResponse = {
  data?: { Media?: Artwork | null };
};

const anilistEndpoint = "https://graphql.anilist.co";
// Keep comfortably below AniList's public API limit, including retries.
const requestIntervalMs = 2_500;
const defaultRateLimitWaitMs = 60_000;
let nextRequestAt = 0;
const artworkQuery = `
  query ($search: String!) {
    Media(search: $search, type: ANIME) {
      coverImage { large }
      bannerImage
    }
  }
`;

function pause(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForRequestSlot() {
  const waitMs = Math.max(0, nextRequestAt - Date.now());
  if (waitMs > 0) await pause(waitMs);
  nextRequestAt = Date.now() + requestIntervalMs;
}

function getRateLimitWaitMs(response: Response) {
  const retryAfter = response.headers.get("retry-after");

  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1_000) + 500;

    const retryAt = Date.parse(retryAfter);
    if (!Number.isNaN(retryAt)) return Math.max(1_000, retryAt - Date.now() + 500);
  }

  const reset = Number(response.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) {
    const resetAt = reset > 10_000_000_000 ? reset : reset * 1_000;
    return Math.max(1_000, resetAt - Date.now() + 500);
  }

  return defaultRateLimitWaitMs;
}

async function findArtwork(search: string): Promise<Artwork | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await waitForRequestSlot();
      const response = await fetch(anilistEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ query: artworkQuery, variables: { search } }),
      });

      if (response.status === 429) {
        const waitMs = getRateLimitWaitMs(response);
        console.warn(`AniList rate limit reached. Waiting ${Math.ceil(waitMs / 1_000)} seconds before retrying.`);
        await pause(waitMs);
        continue;
      }

      if (!response.ok) throw new Error(`AniList returned ${response.status}`);
      const payload = await response.json() as ArtworkResponse;
      return payload.data?.Media ?? null;
    } catch (error) {
      if (attempt === 3) {
        console.warn(`Artwork was not found for ${search}:`, error instanceof Error ? error.message : error);
        return null;
      }
      await pause(2_000 * (attempt + 1));
    }
  }

  return null;
}

async function syncArtwork() {
  const pending = await pool.query<{ slug: string; original_title: string | null; title: string }>(
    `SELECT slug, original_title, title
     FROM releases
     WHERE poster_url LIKE 'data:image/svg+xml%'
     ORDER BY created_at`,
  );

  if (!pending.rowCount) {
    console.log("AniList artwork is already synchronized.");
    return;
  }

  console.log(`Synchronizing AniList artwork for ${pending.rowCount} releases…`);
  let synchronized = 0;

  for (const release of pending.rows) {
    const artwork = await findArtwork(release.original_title ?? release.title);
    const coverUrl = artwork?.coverImage?.large;

    if (coverUrl) {
      await pool.query(
        `UPDATE releases
         SET poster_url = $1,
             banner_url = COALESCE($2, banner_url),
             updated_at = NOW()
         WHERE slug = $3`,
        [coverUrl, artwork?.bannerImage ?? null, release.slug],
      );
      synchronized += 1;
    }

  }

  console.log(`Synchronized ${synchronized} AniList covers.`);
}

syncArtwork()
  .catch((error: unknown) => {
    console.error("AniList artwork sync failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
