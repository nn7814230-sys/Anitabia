import { randomBytes, randomUUID } from "node:crypto";

import type { WebSocket } from "ws";

import type { AccountUser } from "../../types.js";

export type RoomPlayback = {
  episodeNumber: number;
  position: number;
  playing: boolean;
  updatedAt: number;
};

export type RoomChatMessage = {
  id: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
};

type Connection = {
  id: string;
  socket: WebSocket;
  user: AccountUser;
  lastChatAt: number;
  voiceEnabled: boolean;
  voiceMuted: boolean;
};

export type WatchRoom = {
  code: string;
  hostId: string;
  hostUsername: string;
  coHostId: string | null;
  releaseSlug: string;
  releaseTitle: string;
  posterUrl: string;
  playback: RoomPlayback;
  messages: RoomChatMessage[];
  connections: Map<string, Connection>;
  hostDisconnectTimer: ReturnType<typeof setTimeout> | null;
  createdAt: number;
  lastActiveAt: number;
};

const rooms = new Map<string, WatchRoom>();
const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
const absoluteLifetimeMs = 12 * 60 * 60 * 1000;
const emptyLifetimeMs = 30 * 60 * 1000;
const hostReconnectGraceMs = 15_000;

function roomCode(): string {
  const bytes = randomBytes(9);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function generateUniqueCode(): string {
  let code = roomCode();
  while (rooms.has(code)) code = roomCode();
  return code;
}

export function createRoom(input: {
  host: AccountUser;
  releaseSlug: string;
  releaseTitle: string;
  posterUrl: string;
  episodeNumber: number;
}): WatchRoom {
  const now = Date.now();
  const room: WatchRoom = {
    code: generateUniqueCode(),
    hostId: input.host.id,
    hostUsername: input.host.username,
    coHostId: null,
    releaseSlug: input.releaseSlug,
    releaseTitle: input.releaseTitle,
    posterUrl: input.posterUrl,
    playback: { episodeNumber: input.episodeNumber, position: 0, playing: false, updatedAt: now },
    messages: [],
    connections: new Map(),
    hostDisconnectTimer: null,
    createdAt: now,
    lastActiveAt: now,
  };
  rooms.set(room.code, room);
  return room;
}

export function findRoom(code: string): WatchRoom | null {
  return rooms.get(code.toLocaleLowerCase("en-US")) ?? null;
}

export function publicRoom(room: WatchRoom) {
  const uniqueUsers = new Map<string, {
    id: string;
    username: string;
    voiceEnabled: boolean;
    voiceMuted: boolean;
  }>();
  for (const connection of room.connections.values()) {
    const participant = uniqueUsers.get(connection.user.id) ?? {
      id: connection.user.id,
      username: connection.user.username,
      voiceEnabled: false,
      voiceMuted: false,
    };
    if (connection.voiceEnabled) {
      participant.voiceMuted = participant.voiceEnabled
        ? participant.voiceMuted && connection.voiceMuted
        : connection.voiceMuted;
      participant.voiceEnabled = true;
    }
    uniqueUsers.set(connection.user.id, participant);
  }
  const position = room.playback.playing
    ? room.playback.position + Math.max(0, Date.now() - room.playback.updatedAt) / 1000
    : room.playback.position;
  return {
    code: room.code,
    host: { id: room.hostId, username: room.hostUsername },
    coHostId: room.coHostId,
    release: { slug: room.releaseSlug, title: room.releaseTitle, posterUrl: room.posterUrl },
    playback: { ...room.playback, position },
    participants: [...uniqueUsers.values()],
    messages: room.messages,
    createdAt: new Date(room.createdAt).toISOString(),
  };
}

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

export function broadcastRoom(room: WatchRoom, payload: unknown, exceptConnectionId?: string): void {
  for (const connection of room.connections.values()) {
    if (connection.id !== exceptConnectionId) send(connection.socket, payload);
  }
}

export function connectRoom(room: WatchRoom, user: AccountUser, socket: WebSocket): string {
  const id = randomUUID();
  if ((user.id === room.hostId || user.id === room.coHostId) && room.hostDisconnectTimer) {
    clearTimeout(room.hostDisconnectTimer);
    room.hostDisconnectTimer = null;
  }
  room.connections.set(id, {
    id,
    socket,
    user,
    lastChatAt: 0,
    voiceEnabled: false,
    voiceMuted: false,
  });
  room.lastActiveAt = Date.now();
  send(socket, { type: "snapshot", data: publicRoom(room), viewer: { id: user.id, username: user.username } });
  broadcastRoom(room, { type: "presence", participants: publicRoom(room).participants });
  return id;
}

export function disconnectRoom(room: WatchRoom, connectionId: string): void {
  room.connections.delete(connectionId);
  room.lastActiveAt = Date.now();
  const controllerIsConnected = [...room.connections.values()].some(
    (connection) => connection.user.id === room.hostId || connection.user.id === room.coHostId,
  );
  if (!controllerIsConnected && room.playback.playing && !room.hostDisconnectTimer) {
    room.hostDisconnectTimer = setTimeout(() => {
      room.hostDisconnectTimer = null;
      const controllerReturned = [...room.connections.values()].some(
        (connection) => connection.user.id === room.hostId || connection.user.id === room.coHostId,
      );
      if (controllerReturned || !room.playback.playing) return;
      const now = Date.now();
      room.playback.position += Math.max(0, now - room.playback.updatedAt) / 1000;
      room.playback.playing = false;
      room.playback.updatedAt = now;
      broadcastRoom(room, { type: "player", action: "pause", ...room.playback, reason: "controller-disconnected" });
    }, hostReconnectGraceMs);
    room.hostDisconnectTimer.unref();
  }
  broadcastRoom(room, { type: "presence", participants: publicRoom(room).participants });
}

function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sendToUser(room: WatchRoom, userId: string, payload: unknown, voiceOnly = false): void {
  for (const connection of room.connections.values()) {
    if (connection.user.id === userId && (!voiceOnly || connection.voiceEnabled)) {
      send(connection.socket, payload);
    }
  }
}

function voiceSignal(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const signal = value as Record<string, unknown>;
  if ((signal.type === "offer" || signal.type === "answer") && typeof signal.sdp === "string") {
    if (!signal.sdp || signal.sdp.length > 48_000) return null;
    return { type: signal.type, sdp: signal.sdp };
  }
  if (signal.type !== "ice" || !signal.candidate || typeof signal.candidate !== "object") return null;
  const candidate = signal.candidate as Record<string, unknown>;
  if (typeof candidate.candidate !== "string" || candidate.candidate.length > 4_000) return null;
  const sdpMid = candidate.sdpMid === null || typeof candidate.sdpMid === "string" ? candidate.sdpMid : null;
  const sdpMLineIndex = candidate.sdpMLineIndex === null || Number.isInteger(candidate.sdpMLineIndex)
    ? candidate.sdpMLineIndex
    : null;
  return {
    type: "ice",
    candidate: { candidate: candidate.candidate, sdpMid, sdpMLineIndex },
  };
}

export function roomHasUser(room: WatchRoom, userId: string): boolean {
  return [...room.connections.values()].some((connection) => connection.user.id === userId);
}

export function handleRoomMessage(room: WatchRoom, connectionId: string, raw: string): void {
  const connection = room.connections.get(connectionId);
  if (!connection || raw.length > 64_000) return;
  let message: Record<string, unknown>;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    message = value as Record<string, unknown>;
  } catch {
    return;
  }

  room.lastActiveAt = Date.now();
  if (message.type === "heartbeat") {
    send(connection.socket, { type: "heartbeat", serverTime: room.lastActiveAt });
    return;
  }
  if (message.type === "chat") {
    const content = typeof message.content === "string" ? message.content.trim() : "";
    if (!content || content.length > 500 || Date.now() - connection.lastChatAt < 1_000) return;
    connection.lastChatAt = Date.now();
    const chatMessage: RoomChatMessage = {
      id: randomUUID(),
      userId: connection.user.id,
      username: connection.user.username,
      content,
      createdAt: new Date().toISOString(),
    };
    room.messages.push(chatMessage);
    if (room.messages.length > 100) room.messages.splice(0, room.messages.length - 100);
    broadcastRoom(room, { type: "chat", message: chatMessage });
    return;
  }

  if (message.type === "controller") {
    if (connection.user.id !== room.hostId) return;
    const targetUserId = typeof message.targetUserId === "string" ? message.targetUserId : "";
    const enabled = Boolean(message.enabled);
    if (!targetUserId || targetUserId === room.hostId) return;
    if (enabled && !roomHasUser(room, targetUserId)) return;
    if (enabled) room.coHostId = targetUserId;
    else if (room.coHostId === targetUserId) room.coHostId = null;
    broadcastRoom(room, {
      type: "controller",
      coHostId: room.coHostId,
      participants: publicRoom(room).participants,
    });
    return;
  }

  if (message.type === "voice-state") {
    connection.voiceEnabled = Boolean(message.enabled);
    connection.voiceMuted = connection.voiceEnabled && Boolean(message.muted);
    broadcastRoom(room, {
      type: "voice-state",
      userId: connection.user.id,
      participants: publicRoom(room).participants,
    });
    return;
  }

  if (message.type === "voice-signal") {
    if (!connection.voiceEnabled) return;
    const targetUserId = typeof message.targetUserId === "string" ? message.targetUserId : "";
    if (!targetUserId || targetUserId === connection.user.id) return;
    const targetHasVoice = [...room.connections.values()].some(
      (target) => target.user.id === targetUserId && target.voiceEnabled,
    );
    if (!targetHasVoice) return;
    const signal = voiceSignal(message.signal);
    if (!signal) return;
    sendToUser(room, targetUserId, {
      type: "voice-signal",
      from: { id: connection.user.id, username: connection.user.username },
      signal,
    }, true);
    return;
  }

  const canControl = connection.user.id === room.hostId || connection.user.id === room.coHostId;
  if (message.type !== "player" || !canControl) return;
  const action = message.action;
  if (action !== "play" && action !== "pause" && action !== "seek" && action !== "episode" && action !== "sync") return;
  if (action === "sync" && connection.user.id !== room.hostId) return;
  const now = Date.now();
  room.playback.position = Math.min(Math.max(finiteNumber(message.position, room.playback.position), 0), 24 * 60 * 60);
  room.playback.updatedAt = now;
  if (action === "play") room.playback.playing = true;
  if (action === "pause") room.playback.playing = false;
  if (action === "sync") {
    room.playback.playing = Boolean(message.playing);
    const episodeNumber = Math.floor(finiteNumber(message.episodeNumber, room.playback.episodeNumber));
    if (episodeNumber >= 1 && episodeNumber <= 10_000) room.playback.episodeNumber = episodeNumber;
  }
  if (action === "episode") {
    const episodeNumber = Math.floor(finiteNumber(message.episodeNumber, room.playback.episodeNumber));
    if (episodeNumber < 1 || episodeNumber > 10_000) return;
    room.playback.episodeNumber = episodeNumber;
    room.playback.position = 0;
    room.playback.playing = false;
  }
  broadcastRoom(room, { type: "player", action, ...room.playback, serverTime: now }, connectionId);
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const expired = now - room.createdAt > absoluteLifetimeMs;
    const abandoned = room.connections.size === 0 && now - room.lastActiveAt > emptyLifetimeMs;
    if (!expired && !abandoned) continue;
    if (room.hostDisconnectTimer) clearTimeout(room.hostDisconnectTimer);
    for (const connection of room.connections.values()) connection.socket.close(1001, "Комната закрыта");
    rooms.delete(code);
  }
}, 60_000);
cleanupTimer.unref();
