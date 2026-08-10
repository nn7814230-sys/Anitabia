import type { FastifyPluginAsync } from "fastify";

import { listCalendarEntries } from "./service.js";

function readLimit(value: unknown): number {
  const limit = Number(value ?? 50);
  if (!Number.isInteger(limit) || limit < 1) return 50;
  return Math.min(limit, 200);
}

export const calendarRoutes: FastifyPluginAsync = async (app) => {
  app.get("/calendar", async (request) => {
    const query = request.query as Record<string, unknown>;
    const result = await listCalendarEntries(readLimit(query.limit));
    return { data: result.entries, meta: { syncedAt: result.syncedAt } };
  });
};
