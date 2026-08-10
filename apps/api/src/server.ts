import { buildApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./database/client.js";
import { startKodikCalendarScheduler } from "./modules/calendar/service.js";
import { startAnimeCornerScheduler } from "./modules/releases/anime-corner.js";

const app = buildApp();
let stopCalendarScheduler: (() => void) | null = null;
let stopAnimeCornerScheduler: (() => void) | null = null;

async function start() {
  try {
    await pool.query("SELECT 1");
    await app.listen({ host: config.host, port: config.port });
    stopCalendarScheduler = startKodikCalendarScheduler();
    stopAnimeCornerScheduler = startAnimeCornerScheduler();
  } catch (error) {
    app.log.error(error, "Could not start API");
    process.exit(1);
  }
}

void start();

async function close() {
  stopCalendarScheduler?.();
  stopAnimeCornerScheduler?.();
  await app.close();
  await pool.end();
}

process.on("SIGINT", () => void close().finally(() => process.exit(0)));
process.on("SIGTERM", () => void close().finally(() => process.exit(0)));
