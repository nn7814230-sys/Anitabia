import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";

import { Header } from "./components/Header";
import { demoReleases } from "./data";
import { applyHomeSeo, applyNotFoundSeo, applyReleaseSeo } from "./seo";
import type { Episode, Release, ReleaseStatus } from "./types";

const apiUrl = import.meta.env.VITE_API_URL ?? "/api/v1";

type Route =
  | { name: "home" }
  | { name: "release"; slug: string }
  | { name: "watch"; slug: string }
  | { name: "not-found" };

const statusLabel: Record<ReleaseStatus, string> = {
  ongoing: "Онгоинг",
  completed: "Завершён",
  announced: "Анонс",
};

const typeLabel: Record<Release["releaseType"], string> = {
  series: "Сериал",
  movie: "Фильм",
  ova: "OVA",
  ona: "ONA",
};

function parseRoute(pathname: string): Route {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/") return { name: "home" };

  const match = normalized.match(/^\/anime\/([^/]+)(\/watch)?$/);
  if (!match) return { name: "not-found" };

  try {
    const slug = decodeURIComponent(match[1]);
    return match[2] ? { name: "watch", slug } : { name: "release", slug };
  } catch {
    return { name: "not-found" };
  }
}

function episodeText(release: Release) {
  return release.episodesTotal
    ? `${release.episodesReleased}/${release.episodesTotal} эп.`
    : `${release.episodesReleased} эп.`;
}

function Card({ release, onOpen }: { release: Release; onOpen: (release: Release) => void }) {
  return (
    <article className="release-card">
      <button className="poster-button" onClick={() => onOpen(release)} aria-label={`Открыть ${release.title}`}>
        <img className="poster" src={release.posterUrl} alt="" loading="lazy" draggable={false} />
        <span className="poster-gradient" />
        <span className="age-badge">{release.ageRating}</span>
        <span className="rating-badge">★ {release.rating?.toFixed(1) ?? "—"}</span>
      </button>
      <div className="card-copy">
        <div className="card-line">
          <span className={`status-dot ${release.status}`} />
          <span>{statusLabel[release.status]}</span>
          <span className="muted">{episodeText(release)}</span>
        </div>
        <h3>{release.title}</h3>
        <p>{release.originalTitle}</p>
      </div>
    </article>
  );
}

function ReleaseRail({ children, label }: { children: ReactNode; label: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, pointerId: 0, startX: 0, startScrollLeft: 0, moved: false });
  const suppressClickRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const scrollRail = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * Math.max(rail.clientWidth * 0.82, 260), behavior: "smooth" });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const rail = event.currentTarget;
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: rail.scrollLeft,
      moved: false,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    const offset = event.clientX - drag.startX;
    if (Math.abs(offset) > 4 && !drag.moved) {
      drag.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
    }

    if (drag.moved) {
      event.preventDefault();
      event.currentTarget.scrollLeft = drag.startScrollLeft - offset;
    }
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current.active = false;
    setIsDragging(false);

    if (drag.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
  };

  return (
    <div className="rail-wrap">
      <div
        className={isDragging ? "release-rail is-dragging" : "release-rail"}
        ref={railRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          event.preventDefault();
          event.stopPropagation();
          suppressClickRef.current = false;
        }}
        onDragStart={(event) => event.preventDefault()}
        aria-label={`${label}: прокрутка`}
      >
        {children}
      </div>
      <div className="rail-controls" aria-label={`Управление галереей «${label}»`}>
        <button type="button" onClick={() => scrollRail(-1)} aria-label="Прокрутить влево">←</button>
        <button type="button" onClick={() => scrollRail(1)} aria-label="Прокрутить вправо">→</button>
      </div>
    </div>
  );
}

function ReleaseShelf({
  id,
  title,
  description,
  releases,
  onOpen,
}: {
  id?: string;
  title: string;
  description: string;
  releases: Release[];
  onOpen: (release: Release) => void;
}) {
  if (!releases.length) return null;

  return (
    <section className="release-shelf" id={id} aria-label={title}>
      <div className="shelf-heading">
        <div>
          <h2>{title} <span aria-hidden="true">›</span></h2>
          <p>{description}</p>
        </div>
        <a href="#catalog">Весь каталог</a>
      </div>
      <ReleaseRail label={title}>
        {releases.map((release) => (
          <article className="rail-card" key={release.id}>
            <button className="rail-poster" onClick={() => onOpen(release)} aria-label={`Открыть ${release.title}`}>
              <img className="poster" src={release.posterUrl} alt="" loading="lazy" draggable={false} />
              <span className="poster-gradient" />
              <span className="rail-mark" aria-hidden="true">a</span>
              <span className="age-badge">{release.ageRating}</span>
              <span className="rating-badge">★ {release.rating?.toFixed(1) ?? "—"}</span>
            </button>
            <div className="rail-copy">
              <p>{episodeText(release)} · {statusLabel[release.status]}</p>
              <h3>{release.title}</h3>
            </div>
          </article>
        ))}
      </ReleaseRail>
    </section>
  );
}

function ReleaseDetail({
  release,
  onClose,
  onWatch,
  onNavigateHome,
}: {
  release: Release;
  onClose: () => void;
  onWatch: () => void;
  onNavigateHome: () => void;
}) {
  return (
    <section className="detail" aria-label={`Подробности: ${release.title}`}>
      <div className="detail-backdrop" style={{ backgroundImage: `url(${release.bannerUrl ?? release.posterUrl})` }} />
      <div className="detail-shade" />
      <Header onNavigateHome={onNavigateHome} />
      <div className="detail-content">
        <button className="back-button" onClick={onClose}>← К каталогу</button>
        <div className="detail-grid">
          <img className="detail-poster" src={release.posterUrl} alt={`Постер: ${release.title}`} />
          <div className="detail-copy">
            <div className="eyebrow"><span className={`status-dot ${release.status}`} /> {statusLabel[release.status]} · {release.releaseYear}</div>
            <h1>{release.title}</h1>
            <p className="original-title">{release.originalTitle}</p>
            <p className="description">{release.description}</p>
            <div className="metadata">
              <span>{typeLabel[release.releaseType]}</span>
              <span>{episodeText(release)}</span>
              <span>★ {release.rating?.toFixed(1) ?? "Нет оценки"}</span>
              <span>{release.ageRating}</span>
            </div>
            <div className="chip-row">
              {release.genres.map((genre) => <span className="chip" key={genre}>{genre}</span>)}
            </div>
            <button className="watch-button" onClick={onWatch}>▶ Открыть плеер</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function WatchPage({
  release,
  onBack,
  onNavigateHome,
}: {
  release: Release;
  onBack: () => void;
  onNavigateHome: () => void;
}) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeEpisode, setActiveEpisode] = useState<number | "trailer">(release.trailerUrl ? "trailer" : 1);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);

    fetch(`${apiUrl}/releases/${encodeURIComponent(release.slug)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Episode list unavailable");
        return response.json() as Promise<{ data: { episodes: Episode[] } }>;
      })
      .then((payload) => setEpisodes(payload.data.episodes))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setEpisodes([]);
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [release.slug]);

  const selectedEpisode = typeof activeEpisode === "number"
    ? episodes.find((episode) => episode.number === activeEpisode) ?? null
    : null;
  const isTrailer = activeEpisode === "trailer";
  const nativeVideoUrl = selectedEpisode?.videoUrl ?? null;
  const cloudflareEmbedUrl = selectedEpisode?.embedUrl ?? null;
  const hasOfficialDestination = Boolean(release.officialUrl);

  return (
    <main className="watch-page">
      <Header variant="solid" onNavigateHome={onNavigateHome} />
      <div className="watch-layout">
        <section className="player-panel" aria-label="Видеоплеер">
          <button className="watch-back" onClick={onBack}>← К релизу</button>
          <div className="video-stage">
            {isTrailer && release.trailerUrl ? (
              <iframe
                src={release.trailerUrl}
                title={`Официальный трейлер: ${release.title}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : cloudflareEmbedUrl ? (
              <iframe
                src={cloudflareEmbedUrl}
                title={`Cloudflare Stream: ${release.title}, серия ${activeEpisode}`}
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : nativeVideoUrl ? (
              <video controls autoPlay src={nativeVideoUrl} poster={release.bannerUrl ?? release.posterUrl}>
                Ваш браузер не поддерживает HTML5-видео.
              </video>
            ) : (
              <div className="licensed-notice">
                <span className="locked-icon">▣</span>
                <h1>Видео не добавлено</h1>
                <p>Полные эпизоды можно показывать здесь только после загрузки вашего MP4-файла или подключения лицензированного провайдера.</p>
                {hasOfficialDestination ? (
                  <a className="official-link" href={release.officialUrl ?? undefined} target="_blank" rel="noreferrer">Смотреть у официального партнёра ↗</a>
                ) : null}
              </div>
            )}
          </div>
          <div className="player-info">
            <div>
              <p className="section-kicker">{isTrailer ? "Легальный видеоматериал" : "Эпизод"}</p>
              <h1>{isTrailer ? `Трейлер — ${release.title}` : selectedEpisode?.title ?? `Серия ${activeEpisode}`}</h1>
            </div>
            <span>{isTrailer ? "YouTube" : selectedEpisode?.videoProvider === "cloudflare_stream" ? "Cloudflare Stream" : selectedEpisode?.durationSeconds ? `${Math.round(selectedEpisode.durationSeconds / 60)} мин` : "—"}</span>
          </div>
        </section>
        <aside className="playlist" aria-label="Список эпизодов">
          <div className="playlist-heading"><h2>Эпизоды</h2><span>{release.episodesTotal ?? release.episodesReleased}</span></div>
          {release.trailerUrl ? (
            <button className={activeEpisode === "trailer" ? "episode active" : "episode"} onClick={() => setActiveEpisode("trailer")}>
              <span className="episode-number">▶</span><span><strong>Официальный трейлер</strong><small>Видео от правообладателя</small></span>
            </button>
          ) : null}
          {isLoading ? <p className="playlist-loading">Загружаем список серий…</p> : null}
          {episodes.map((episode) => (
            <button className={activeEpisode === episode.number ? "episode active" : "episode"} onClick={() => setActiveEpisode(episode.number)} key={episode.id}>
              <span className="episode-number">{episode.number}</span><span><strong>{episode.title ?? `Серия ${episode.number}`}</strong><small>{episode.videoProvider === "cloudflare_stream" ? "Cloudflare Stream" : episode.videoUrl ? "Доступно" : "У официального партнёра"}</small></span>
            </button>
          ))}
          {!isLoading && episodes.length === 0 ? <p className="playlist-loading">Список появится после запуска API и импорта каталога.</p> : null}
        </aside>
      </div>
    </main>
  );
}

function RouteMessage({ title, text, onHome }: { title: string; text: string; onHome: () => void }) {
  return (
    <main>
      <Header variant="solid" onNavigateHome={onHome} />
      <section className="catalog-section" style={{ minHeight: "70vh", paddingTop: "10rem" }}>
        <div className="empty-state">
          <span>◌</span>
          <h1>{title}</h1>
          <p>{text}</p>
          <button className="watch-button" onClick={onHome}>Вернуться в каталог</button>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [releases, setReleases] = useState<Release[]>(demoReleases);
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("Все");
  const [status, setStatus] = useState<ReleaseStatus | "all">("all");
  const [catalogLimit, setCatalogLimit] = useState(24);
  const [isApiAvailable, setIsApiAvailable] = useState(false);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [isRouteMissing, setIsRouteMissing] = useState(false);
  const [featuredIndex, setFeaturedIndex] = useState(0);

  const routeSlug = route.name === "release" || route.name === "watch" ? route.slug : null;
  const routeRelease = routeSlug ? releases.find((release) => release.slug === routeSlug) ?? null : null;

  const navigate = (path: string, replace = false) => {
    if (replace) window.history.replaceState({}, "", path);
    else window.history.pushState({}, "", path);
    setRoute(parseRoute(path));
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/releases?limit=200`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("API unavailable");
        return response.json() as Promise<{ data: Release[] }>;
      })
      .then((payload) => {
        if (payload.data.length) setReleases(payload.data);
        setIsApiAvailable(true);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setIsApiAvailable(false);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!routeSlug || routeRelease) {
      setIsRouteLoading(false);
      setIsRouteMissing(false);
      return;
    }

    const controller = new AbortController();
    setIsRouteLoading(true);
    setIsRouteMissing(false);

    fetch(`${apiUrl}/releases/${encodeURIComponent(routeSlug)}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("Release unavailable");
        return response.json() as Promise<{ data: { release: Release } }>;
      })
      .then((payload) => {
        if (!payload) {
          setIsRouteMissing(true);
          return;
        }
        setReleases((current) => [payload.data.release, ...current.filter((item) => item.slug !== payload.data.release.slug)]);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setIsRouteMissing(true);
      })
      .finally(() => setIsRouteLoading(false));

    return () => controller.abort();
  }, [routeRelease, routeSlug]);

  useEffect(() => {
    if (route.name === "home") {
      applyHomeSeo();
      return;
    }
    if ((route.name === "release" || route.name === "watch") && routeRelease) {
      applyReleaseSeo(routeRelease, route.name === "watch");
      return;
    }
    if (route.name === "not-found" || isRouteMissing) applyNotFoundSeo();
  }, [isRouteMissing, route, routeRelease]);

  const genres = useMemo(() => ["Все", ...new Set(releases.flatMap((release) => release.genres))], [releases]);
  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("ru");
    return releases.filter((release) => {
      const matchSearch = !normalizedSearch || [release.title, release.originalTitle ?? "", release.description]
        .join(" ")
        .toLocaleLowerCase("ru")
        .includes(normalizedSearch);
      const matchGenre = genre === "Все" || release.genres.includes(genre);
      const matchStatus = status === "all" || release.status === status;
      return matchSearch && matchGenre && matchStatus;
    });
  }, [genre, releases, search, status]);

  const visibleReleases = useMemo(() => filtered.slice(0, catalogLimit), [catalogLimit, filtered]);

  useEffect(() => {
    setCatalogLimit(24);
  }, [genre, search, status]);

  const newestEpisodes = useMemo(() => {
    const ongoing = releases.filter((release) => release.status === "ongoing");
    return [...(ongoing.length ? ongoing : releases)]
      .sort((left, right) => right.releaseYear - left.releaseYear || right.episodesReleased - left.episodesReleased || (right.rating ?? 0) - (left.rating ?? 0))
      .slice(0, 12);
  }, [releases]);

  const popularReleases = useMemo(() => [...releases]
    .sort((left, right) => (right.rating ?? 0) - (left.rating ?? 0) || right.releaseYear - left.releaseYear)
    .slice(0, 12), [releases]);

  const featuredReleases = useMemo(() => [...releases]
    .sort((left, right) => (right.rating ?? 0) - (left.rating ?? 0) || right.releaseYear - left.releaseYear)
    .slice(0, 12), [releases]);
  const featured = featuredReleases[featuredIndex % Math.max(featuredReleases.length, 1)] ?? demoReleases[0];
  const goHome = () => navigate("/");

  useEffect(() => {
    setFeaturedIndex((index) => index % Math.max(featuredReleases.length, 1));
    if (featuredReleases.length < 2) return;

    const interval = window.setInterval(() => {
      setFeaturedIndex((index) => (index + 1) % featuredReleases.length);
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [featuredReleases.length]);

  if (route.name === "not-found" || isRouteMissing) {
    return <RouteMessage title="Страница не найдена" text="Такого релиза или раздела пока нет." onHome={goHome} />;
  }

  if ((route.name === "release" || route.name === "watch") && !routeRelease) {
    return (
      <RouteMessage
        title={isRouteLoading ? "Загружаем релиз…" : "Релиз недоступен"}
        text={isRouteLoading ? "Получаем данные из каталога." : "Проверьте подключение к API или вернитесь в каталог."}
        onHome={goHome}
      />
    );
  }

  if (route.name === "watch" && routeRelease) {
    return (
      <WatchPage
        release={routeRelease}
        onBack={() => navigate(`/anime/${encodeURIComponent(routeRelease.slug)}`)}
        onNavigateHome={goHome}
      />
    );
  }

  if (route.name === "release" && routeRelease) {
    return (
      <ReleaseDetail
        release={routeRelease}
        onClose={goHome}
        onNavigateHome={goHome}
        onWatch={() => navigate(`/anime/${encodeURIComponent(routeRelease.slug)}/watch`)}
      />
    );
  }

  return (
    <main>
      <Header />
      <section className="hero" id="top">
        <div
          className="hero-art"
          key={featured.id}
          style={{ backgroundImage: `url(${featured.bannerUrl ?? featured.posterUrl})` }}
          aria-hidden="true"
        />
        <div className="hero-overlay" />
        <div className="hero-inner">
          <div className="hero-content">
            <p className="eyebrow"><span className="live-indicator" /> Новые серии каждую неделю</p>
            <h1>Аниме, которое<br /><em>хочется смотреть</em></h1>
            <p className="hero-description">Собрали свежие релизы, любимую классику и истории, в которые легко нырнуть с головой.</p>
            <a className="hero-button" href="#catalog">Перейти к каталогу <span>↓</span></a>
          </div>
          <div className="hero-featured" aria-label="Рекомендуемый релиз">
            <strong>{featured.title}</strong>
            <small>{episodeText(featured)} · ★ {featured.rating?.toFixed(1)}</small>
          </div>
        </div>
      </section>
      <div className="home-shelves">
        <ReleaseShelf
          id="new"
          title="Новые эпизоды"
          description="Самые свежие продолжения и новые поступления в каталоге"
          releases={newestEpisodes}
          onOpen={(item) => navigate(`/anime/${encodeURIComponent(item.slug)}`)}
        />
        <ReleaseShelf
          title="Сейчас популярно"
          description="Релизы с самыми высокими оценками сообщества"
          releases={popularReleases}
          onOpen={(item) => navigate(`/anime/${encodeURIComponent(item.slug)}`)}
        />
      </div>
      <section className="catalog-section" id="catalog">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Подборка для вас</p>
            <h2>Все релизы</h2>
          </div>
          <span className="api-state">{isApiAvailable ? "● API подключён" : "○ Демо-данные"}</span>
        </div>
        <div className="filters">
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по названию" />
          </label>
          <div className="status-filters" aria-label="Статус релиза">
            {(["all", "ongoing", "completed"] as const).map((value) => (
              <button className={status === value ? "filter active" : "filter"} onClick={() => setStatus(value)} key={value}>
                {value === "all" ? "Все" : statusLabel[value]}
              </button>
            ))}
          </div>
        </div>
        <div className="genre-row" aria-label="Жанры">
          {genres.map((item) => (
            <button className={genre === item ? "genre active" : "genre"} onClick={() => setGenre(item)} key={item}>{item}</button>
          ))}
        </div>
        {filtered.length ? (
          <>
            <div className="release-grid">
              {visibleReleases.map((release) => (
                <Card
                  key={release.id}
                  release={release}
                  onOpen={(item) => navigate(`/anime/${encodeURIComponent(item.slug)}`)}
                />
              ))}
            </div>
            {visibleReleases.length < filtered.length ? (
              <div className="load-more">
                <button type="button" onClick={() => setCatalogLimit((limit) => limit + 24)}>Показать ещё</button>
                <p>Показано {visibleReleases.length} из {filtered.length}</p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="empty-state"><span>◌</span><h3>Ничего не нашли</h3><p>Попробуйте убрать фильтр или изменить запрос.</p></div>
        )}
      </section>
      <footer id="about">
        <div className="footer-inner">
          <a className="brand" href="#top">ani<span>tabia</span></a>
          <p>Проект для тех, кто любит хорошие истории.</p>
          <small>© 2026 Anitabia. Демонстрационный интерфейс.</small>
        </div>
      </footer>
    </main>
  );
}
