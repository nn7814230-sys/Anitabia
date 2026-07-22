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

function cloudflareCustomerCode(value = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE): string | null {
  const code = value?.trim().replace(/^customer-/, "");
  if (!code) return null;

  if (!/^[a-z0-9-]+$/i.test(code)) {
    throw new Error("CLOUDFLARE_STREAM_CUSTOMER_CODE has an invalid format.");
  }

  return code;
}

export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  siteUrl: normalizedSiteUrl(process.env.SITE_URL ?? "http://localhost:5173"),
  cloudflareStreamCustomerCode: cloudflareCustomerCode(),
};
