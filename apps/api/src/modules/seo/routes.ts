import type { FastifyPluginAsync } from "fastify";

import { config } from "../../config.js";
import { listReleaseSitemapEntries } from "../releases/repository.js";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function absolute(path: string): string {
  return `${config.siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export const seoRoutes: FastifyPluginAsync = async (app) => {
  app.get("/robots.txt", async (_request, reply) => {
    const body = [
      "User-agent: Yandex",
      "Allow: /",
      "Disallow: /api/",
      "Disallow: /health$",
      "Disallow: /room/",
      "Disallow: /anime/*/watch$",
      "",
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      "Disallow: /health$",
      "Disallow: /room/",
      "Disallow: /anime/*/watch$",
      "",
      `Sitemap: ${absolute("/sitemap.xml")}`,
      "",
    ].join("\n");

    return reply.type("text/plain; charset=utf-8").send(body);
  });

  app.get("/sitemap.xml", async (_request, reply) => {
    const entries = await listReleaseSitemapEntries();
    const urls = [
      { loc: absolute("/"), lastmod: undefined as string | undefined },
      { loc: absolute("/privacy"), lastmod: undefined as string | undefined },
      { loc: absolute("/terms"), lastmod: undefined as string | undefined },
      ...entries.map((entry) => ({
        loc: absolute(`/anime/${encodeURIComponent(entry.slug)}`),
        lastmod: entry.updatedAt.toISOString(),
      })),
    ];

    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map(({ loc, lastmod }) => [
        "  <url>",
        `    <loc>${escapeXml(loc)}</loc>`,
        ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
        "  </url>",
      ].join("\n")),
      "</urlset>",
      "",
    ].join("\n");

    return reply.type("application/xml; charset=utf-8").send(body);
  });
};
