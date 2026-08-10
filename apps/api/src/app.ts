import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";

import { accountRoutes } from "./modules/accounts/routes.js";
import { calendarRoutes } from "./modules/calendar/routes.js";
import { engagementRoutes } from "./modules/engagement/routes.js";
import { releaseRoutes } from "./modules/releases/routes.js";
import { roomRoutes } from "./modules/rooms/routes.js";
import { seoRoutes } from "./modules/seo/routes.js";

export function buildApp() {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true, credentials: true });
  app.register(websocket, { options: { maxPayload: 64 * 1024 } });
  app.get("/health", async () => ({ status: "ok" }));
  app.register(seoRoutes);
  app.register(calendarRoutes, { prefix: "/api/v1" });
  app.register(accountRoutes, { prefix: "/api/v1" });
  app.register(engagementRoutes, { prefix: "/api/v1" });
  app.register(releaseRoutes, { prefix: "/api/v1" });
  app.register(roomRoutes, { prefix: "/api/v1" });
  return app;
}
