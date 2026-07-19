import type { FastifyPluginAsync } from "fastify";
import { findReleaseBySlug, listReleases } from "./repository.js";
import type { ReleaseStatus } from "../../types.js";

const allowedStatuses = new Set<ReleaseStatus>(["ongoing", "completed", "announced"]);

function readLimit(value: unknown): number {
  const limit = Number(value ?? 18);
  if (!Number.isInteger(limit) || limit < 1) return 18;
  return Math.min(limit, 50);
}

export const releaseRoutes: FastifyPluginAsync = async (app) => {
  app.get("/releases", async (request) => {
    const query = request.query as Record<string, unknown>;
    const status = typeof query.status === "string" && allowedStatuses.has(query.status as ReleaseStatus)
      ? (query.status as ReleaseStatus)
      : undefined;

    const releases = await listReleases({
      search: typeof query.search === "string" ? query.search.trim().slice(0, 80) : undefined,
      genre: typeof query.genre === "string" ? query.genre.trim().slice(0, 40) : undefined,
      status,
      limit: readLimit(query.limit),
    });

    return { data: releases };
  });

  app.get<{ Params: { slug: string } }>("/releases/:slug", async (request, reply) => {
    const result = await findReleaseBySlug(request.params.slug);

    if (!result) {
      return reply.code(404).send({ message: "Релиз не найден" });
    }

    return { data: result };
  });
};
