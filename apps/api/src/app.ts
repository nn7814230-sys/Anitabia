import cors from "@fastify/cors";
import Fastify from "fastify";
import { releaseRoutes } from "./modules/releases/routes.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });
  app.get("/health", async () => ({ status: "ok" }));
  app.register(releaseRoutes, { prefix: "/api/v1" });

  return app;
}
