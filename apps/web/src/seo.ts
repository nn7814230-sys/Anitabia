import type { Release } from "./types";

type StructuredData = Record<string, unknown> | Array<Record<string, unknown>>;

type SeoOptions = {
  title: string;
  description: string;
  canonicalPath: string;
  image?: string | null;
  robots?: "index" | "noindex";
  structuredData?: StructuredData;
};

const fallbackDescription = "Anitabia — каталог аниме-релизов, трейлеров и легальных площадок для просмотра.";

function configuredSiteUrl(): string {
  const value = import.meta.env.VITE_SITE_URL?.trim();
  const origin = value || window.location.origin;
  return origin.replace(/\/$/, "");
}

function absoluteUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `${configuredSiteUrl()}${value.startsWith("/") ? value : `/${value}`}`;
}

function setMeta(attribute: "name" | "property", key: string, content?: string) {
  const selector = `meta[${attribute}="${key}"]`;
  const existing = document.head.querySelector<HTMLMetaElement>(selector);

  if (!content) {
    existing?.remove();
    return;
  }

  const meta = existing ?? document.createElement("meta");
  meta.setAttribute(attribute, key);
  meta.content = content;
  if (!existing) document.head.append(meta);
}

function setCanonical(path: string) {
  const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]') ?? document.createElement("link");
  canonical.rel = "canonical";
  canonical.href = absoluteUrl(path);
  if (!canonical.isConnected) document.head.append(canonical);
}

function setStructuredData(data?: StructuredData) {
  const id = "anitabia-structured-data";
  const existing = document.getElementById(id);

  if (!data) {
    existing?.remove();
    return;
  }

  const script = existing instanceof HTMLScriptElement ? existing : document.createElement("script");
  script.id = id;
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(data);
  if (!script.isConnected) document.head.append(script);
}

export function applySeo({
  title,
  description = fallbackDescription,
  canonicalPath,
  image,
  robots = "index",
  structuredData,
}: SeoOptions) {
  const canonicalUrl = absoluteUrl(canonicalPath);
  const imageUrl = image ? absoluteUrl(image) : undefined;

  document.title = title;
  setCanonical(canonicalPath);
  setMeta("name", "description", description);
  setMeta(
    "name",
    "robots",
    robots === "index"
      ? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
      : "noindex,follow",
  );

  setMeta("property", "og:site_name", "Anitabia");
  setMeta("property", "og:locale", "ru_RU");
  setMeta("property", "og:type", "website");
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:url", canonicalUrl);
  setMeta("property", "og:image", imageUrl);

  setMeta("name", "twitter:card", imageUrl ? "summary_large_image" : "summary");
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", description);
  setMeta("name", "twitter:image", imageUrl);

  setStructuredData(structuredData);
}

export function applyHomeSeo() {
  const url = absoluteUrl("/");
  applySeo({
    title: "Anitabia — каталог аниме-релизов",
    description: fallbackDescription,
    canonicalPath: "/",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Anitabia",
      url,
      inLanguage: "ru-RU",
      description: fallbackDescription,
    },
  });
}

export function applyReleaseSeo(release: Release, watchPage = false) {
  const releasePath = `/anime/${encodeURIComponent(release.slug)}`;
  const description = release.description.trim().slice(0, 220);
  const schemaType = release.releaseType === "movie" ? "Movie" : "TVSeries";
  const aggregateRating = release.rating === null
    ? undefined
    : {
        "@type": "AggregateRating",
        ratingValue: release.rating,
        bestRating: 10,
        worstRating: 0,
        ratingCount: 1,
      };

  applySeo({
    title: watchPage
      ? `Смотреть «${release.title}» — Anitabia`
      : `${release.title} — описание, серии и трейлер | Anitabia`,
    description,
    canonicalPath: releasePath,
    image: release.bannerUrl ?? release.posterUrl,
    robots: watchPage ? "noindex" : "index",
    structuredData: watchPage
      ? undefined
      : {
          "@context": "https://schema.org",
          "@type": schemaType,
          name: release.title,
          alternateName: release.originalTitle ?? undefined,
          description,
          url: absoluteUrl(releasePath),
          image: [release.posterUrl, release.bannerUrl].filter(Boolean),
          datePublished: String(release.releaseYear),
          genre: release.genres,
          contentRating: release.ageRating,
          numberOfEpisodes: release.episodesTotal ?? release.episodesReleased,
          aggregateRating,
          inLanguage: "ru-RU",
        },
  });
}

export function applyNotFoundSeo() {
  applySeo({
    title: "Страница не найдена — Anitabia",
    description: "Запрошенная страница не найдена. Вернитесь в каталог Anitabia.",
    canonicalPath: window.location.pathname,
    robots: "noindex",
  });
}
