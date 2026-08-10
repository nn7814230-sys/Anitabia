import type { FastifyPluginAsync } from "fastify";

import { findReleaseBySlug, listPopularReleases, listReleases } from "./repository.js";
import type { ReleaseStatus } from "../../types.js";

const allowedStatuses = new Set<ReleaseStatus>(["ongoing", "completed", "announced"]);

function readLimit(value: unknown): number {
  const limit = Number(value ?? 24);
  if (!Number.isInteger(limit) || limit < 1) return 24;
  return Math.min(limit, 200);
}

function readOffset(value: unknown): number {
  const offset = Number(value ?? 0);
  if (!Number.isInteger(offset) || offset < 0) return 0;
  return Math.min(offset, 1_000_000);
}

export const releaseRoutes: FastifyPluginAsync = async (app) => {
  app.get("/releases/popular", async () => {
    const result = await listPopularReleases();
    return { data: result.releases, meta: { source: result.source } };
  });

  app.get("/releases", async (request) => {
    const query = request.query as Record<string, unknown>;
    const status = typeof query.status === "string" && allowedStatuses.has(query.status as ReleaseStatus)
      ? (query.status as ReleaseStatus)
      : undefined;

    const limit = readLimit(query.limit);
    const offset = readOffset(query.offset);
    const result = await listReleases({
      search: typeof query.search === "string" ? query.search.trim().slice(0, 80) : undefined,
      genre: typeof query.genre === "string" ? query.genre.trim().slice(0, 40) : undefined,
      status,
      limit,
      offset,
    });

    return {
      data: result.releases,
      meta: {
        total: result.total,
        offset,
        limit,
        hasMore: offset + result.releases.length < result.total,
      },
    };
  });

  app.get<{ Params: { slug: string } }>("/releases/:slug", async (request, reply) => {
    const result = await findReleaseBySlug(request.params.slug);

    if (!result) {
      return reply.code(404).send({ message: "Релиз не найден" });
    }

    return { data: result };
  });
};
