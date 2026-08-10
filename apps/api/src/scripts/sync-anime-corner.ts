import { syncAnimeCornerRankings } from "../modules/releases/anime-corner.js";
import { pool } from "../database/client.js";

syncAnimeCornerRankings(process.argv.includes("--apply"))
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error: unknown) => {
    console.error("Anime Corner synchronization failed", error);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
