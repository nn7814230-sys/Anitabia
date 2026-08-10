import { config as loadEnvironment } from "dotenv";
import { fileURLToPath } from "node:url";

loadEnvironment({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is required.`);
  }
  return value;
}

function normalizedSiteUrl(value: string): string {
  const url = new URL(value);
  return url.toString().replace(/\/$/, "");
}

function normalizedKodikApiUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("KODIK_API_URL must use HTTPS.");
  }
  return url.toString().replace(/\/$/, "");
}

function normalizedCalendarUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("KODIK_CALENDAR_URL must use HTTPS.");
  }
  return url.toString();
}

function normalizedTurnHost(value: string): string {
  const host = value.trim();
  if (!host || host.includes("://") || host.includes("/") || /\s/.test(host)) {
    throw new Error("TURN_HOST must be a hostname or IP address without a protocol or path.");
  }
  return host;
}

function normalizedTurnPort(value: string | undefined): number {
  const port = Number(value ?? 3478);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("TURN_PORT must be an integer between 1 and 65535.");
  }
  return port;
}

export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  siteUrl: normalizedSiteUrl(process.env.SITE_URL ?? "http://localhost:5173"),
  kodikApiToken: process.env.KODIK_API_TOKEN?.trim() || null,
  kodikApiUrl: normalizedKodikApiUrl(process.env.KODIK_API_URL ?? "https://kodik-api.com"),
  kodikCalendarUrl: normalizedCalendarUrl(
    process.env.KODIK_CALENDAR_URL ?? "https://dumps.kodikres.com/calendar.json",
  ),
  turnSecret: process.env.TURN_SECRET?.trim() || null,
  turnHost: normalizedTurnHost(process.env.TURN_HOST ?? "anitabia.ru"),
  turnPort: normalizedTurnPort(process.env.TURN_PORT),
  sessionDays: Math.max(1, Math.min(90, Number(process.env.AUTH_SESSION_DAYS ?? 30) || 30)),
};
