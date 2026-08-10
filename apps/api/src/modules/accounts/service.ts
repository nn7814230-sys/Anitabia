import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import type { FastifyRequest } from "fastify";
import type { QueryResultRow } from "pg";

import { config } from "../../config.js";
import { pool } from "../../database/client.js";
import type { AccountUser } from "../../types.js";

const scryptAsync = promisify(scrypt);
const sessionCookieName = "anitabia_session";
const sessionLifetimeSeconds = config.sessionDays * 24 * 60 * 60;

type UserRow = QueryResultRow & {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  created_at: Date;
};

function mapUser(row: UserRow): AccountUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    createdAt: row.created_at.toISOString(),
  };
}

function sessionHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function sessionTokenFromRequest(request: FastifyRequest): string | null {
  const header = request.headers.cookie;
  if (!header) return null;

  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === sessionCookieName && value.length) return decodeCookieValue(value.join("="));
  }
  return null;
}

export function sessionCookie(token: string): string {
  const secure = config.siteUrl.startsWith("https://") ? "; Secure" : "";
  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionLifetimeSeconds}${secure}`;
}

export function expiredSessionCookie(): string {
  const secure = config.siteUrl.startsWith("https://") ? "; Secure" : "";
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export function normalizeUsername(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

export function validEmail(value: string): boolean {
  return value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

export function validUsername(value: string): boolean {
  return value.length >= 3 && value.length <= 32 && /^[\p{L}\p{N}_ -]+$/u.test(value);
}

export function validPassword(value: string): boolean {
  return value.length >= 8 && value.length <= 128;
}

export async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scryptAsync(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

export async function passwordMatches(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, expected] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;

  const derived = await scryptAsync(password, salt, 64) as Buffer;
  const expectedBuffer = Buffer.from(expected, "base64url");
  return expectedBuffer.length === derived.length && timingSafeEqual(expectedBuffer, derived);
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO user_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3::text || ' days')::interval)`,
    [userId, sessionHash(token), String(config.sessionDays)],
  );
  return token;
}

export async function deleteSession(token: string | null): Promise<void> {
  if (!token) return;
  await pool.query("DELETE FROM user_sessions WHERE token_hash = $1", [sessionHash(token)]);
}

export async function accountFromSession(token: string | null): Promise<AccountUser | null> {
  if (!token) return null;
  const result = await pool.query<UserRow>(
    `SELECT u.id, u.email, u.username, u.password_hash, u.created_at
     FROM user_sessions s
     JOIN app_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [sessionHash(token)],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function accountByEmail(email: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    "SELECT id, email, username, password_hash, created_at FROM app_users WHERE lower(email) = lower($1)",
    [email],
  );
  return result.rows[0] ?? null;
}

export async function createAccount(email: string, username: string, password: string): Promise<AccountUser> {
  const result = await pool.query<UserRow>(
    `INSERT INTO app_users (email, username, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, email, username, password_hash, created_at`,
    [email, username, await passwordHash(password)],
  );
  const user = result.rows[0];
  if (!user) throw new Error("Account was not created.");
  return mapUser(user);
}

export async function updateAccountUsername(userId: string, username: string): Promise<AccountUser | null> {
  const result = await pool.query<UserRow>(
    `UPDATE app_users
     SET username = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, email, username, password_hash, created_at`,
    [username, userId],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}
