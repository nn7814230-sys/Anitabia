import { createHmac } from "node:crypto";

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { QueryResultRow } from "pg";

import { config } from "../../config.js";
import { pool } from "../../database/client.js";
import type { AccountUser } from "../../types.js";
import { accountFromSession, sessionTokenFromRequest } from "../accounts/service.js";
import {
  connectRoom,
  createRoom,
  disconnectRoom,
  findRoom,
  handleRoomMessage,
  publicRoom,
  roomHasUser,
} from "./service.js";

type AccountRequest = FastifyRequest & { account: AccountUser };

function bodyValue(body: unknown, key: string): unknown {
  return body && typeof body === "object" ? (body as Record<string, unknown>)[key] : undefined;
}

export const roomRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preValidation", async (request, reply) => {
    const account = await accountFromSession(sessionTokenFromRequest(request));
    if (!account) return reply.code(401).send({ message: "Для комнат требуется вход в аккаунт." });
    (request as AccountRequest).account = account;
  });

  app.post("/rooms", async (request, reply) => {
    const releaseSlugValue = bodyValue(request.body, "releaseSlug");
    const episodeNumberValue = Number(bodyValue(request.body, "episodeNumber") ?? 1);
    const releaseSlug = typeof releaseSlugValue === "string" ? releaseSlugValue.trim() : "";
    const episodeNumber = Number.isInteger(episodeNumberValue) && episodeNumberValue > 0 ? episodeNumberValue : 1;
    const result = await pool.query<QueryResultRow & {
      slug: string;
      title: string;
      poster_url: string;
      episodes_total: number | null;
      episodes_released: number;
      status: "ongoing" | "completed" | "announced";
    }>(
      "SELECT slug, title, poster_url, episodes_total, episodes_released, status FROM releases WHERE slug = $1",
      [releaseSlug],
    );
    const release = result.rows[0];
    if (!release) return reply.code(404).send({ message: "Релиз не найден." });
    const availableEpisodes = release.episodes_released > 0
      ? release.episodes_released
      : release.status === "completed" ? Math.max(release.episodes_total ?? 0, 1) : 0;
    if (episodeNumber > availableEpisodes) return reply.code(400).send({ message: "Эта серия ещё не доступна." });

    const room = createRoom({
      host: (request as AccountRequest).account,
      releaseSlug: release.slug,
      releaseTitle: release.title,
      posterUrl: release.poster_url,
      episodeNumber,
    });
    return reply.code(201).send({ data: { ...publicRoom(room), url: `${config.siteUrl}/room/${room.code}` } });
  });

  app.get<{ Params: { code: string } }>("/rooms/:code", async (request, reply) => {
    const room = findRoom(request.params.code);
    if (!room) return reply.code(404).send({ message: "Комната не найдена или уже закрыта." });
    return { data: publicRoom(room) };
  });

  app.get<{ Params: { code: string } }>("/rooms/:code/voice-config", async (request, reply) => {
    const room = findRoom(request.params.code);
    if (!room) return reply.code(404).send({ message: "Комната не найдена или уже закрыта." });
    const account = (request as AccountRequest).account;
    if (!roomHasUser(room, account.id)) {
      return reply.code(403).send({ message: "Сначала подключитесь к комнате." });
    }
    if (!config.turnSecret) {
      request.log.error("TURN_SECRET is not configured");
      return reply.code(503).send({ message: "Голосовой чат временно недоступен." });
    }

    const expiresAtSeconds = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
    const username = `${expiresAtSeconds}:${account.id}`;
    const credential = createHmac("sha1", config.turnSecret).update(username).digest("base64");
    const authority = `${config.turnHost}:${config.turnPort}`;
    return {
      data: {
        iceServers: [
          { urls: [`stun:${authority}`] },
          {
            urls: [`turn:${authority}?transport=udp`, `turn:${authority}?transport=tcp`],
            username,
            credential,
          },
        ],
        expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
      },
    };
  });

  app.get<{ Params: { code: string } }>("/rooms/:code/socket", { websocket: true }, (socket, request) => {
    const room = findRoom(request.params.code);
    if (!room) {
      socket.close(1008, "Комната не найдена");
      return;
    }
    const connectionId = connectRoom(room, (request as AccountRequest).account, socket);
    socket.on("message", (message) => handleRoomMessage(room, connectionId, message.toString()));
    socket.on("close", () => disconnectRoom(room, connectionId));
    socket.on("error", () => disconnectRoom(room, connectionId));
  });
};
