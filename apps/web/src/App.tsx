import { useEffect, useMemo, useState } from "react";
import { Header } from "./components/Header";
import { demoReleases } from "./data";
import type { Episode, Release, ReleaseStatus } from "./types";

const apiUrl = import.meta.env.VITE_API_URL ?? "/api/v1";

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

function episodeText(release: Release) {
  return release.episodesTotal
    ? `${release.episodesReleased}/${release.episodesTotal} эп.`
    : `${release.episodesReleased} эп.`;
}

function Card({ release, onOpen }: { release: Release; onOpen: (release: Release) => void }) {
  return (
    <article className="release-card">
      <button className="poster-button" onClick={() => onOpen(release)} aria-label={`Открыть ${release.title}`}>
        <img className="poster" src={release.posterUrl} alt="" loading="lazy" />
        <span className="poster-gradient" />
        <span className="age-badge">{release.ageRating}</span>
        <span className="rating-badge">★ {release.rating?.toFixed(1) ?? "—"}</span>
        <span className="play-badge" aria-hidden="true">▶</span>
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

function ReleaseDetail({ release, onClose, onWatch, onNavigateHome }: { release: Release; onClose: () => void; onWatch: () => void; onNavigateHome: () => void }) {
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
            <h2>{release.title}</h2>
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

function WatchPage({ release, onBack, onNavigateHome }: { release: Release; onBack: () => void; onNavigateHome: () => void }) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeEpisode, setActiveEpisode] = useState<number | "trailer">(release.trailerUrl ? "trailer" : 1);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${apiUrl}/releases/${release.slug}`, { signal: controller.signal })
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
            <span>{isTrailer ? "YouTube" : selectedEpisode?.durationSeconds ? `${Math.round(selectedEpisode.durationSeconds / 60)} мин` : "—"}</span>
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
              <span className="episode-number">{episode.number}</span><span><strong>{episode.title ?? `Серия ${episode.number}`}</strong><small>{episode.videoUrl ? "Доступно" : "У официального партнёра"}</small></span>
            </button>
          ))}
          {!isLoading && episodes.length === 0 ? <p className="playlist-loading">Список появится после запуска API и импорта каталога.</p> : null}
        </aside>
      </div>
    </main>
  );
}

export default function App() {
  const [releases, setReleases] = useState<Release[]>(demoReleases);
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("Все");
  const [status, setStatus] = useState<ReleaseStatus | "all">("all");
  const [selected, setSelected] = useState<Release | null>(null);
  const [watching, setWatching] = useState<Release | null>(null);
  const [isApiAvailable, setIsApiAvailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${apiUrl}/releases?limit=50`, { signal: controller.signal })
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

  const featured = releases[0] ?? demoReleases[0];

  if (watching) return <WatchPage release={watching} onBack={() => setWatching(null)} onNavigateHome={() => setWatching(null)} />;

  if (selected) return (
    <ReleaseDetail
      release={selected}
      onClose={() => setSelected(null)}
      onNavigateHome={() => setSelected(null)}
      onWatch={() => {
        setWatching(selected);
        setSelected(null);
      }}
    />
  );

  return (
    <main>
      <Header />

      <section className="hero" id="top" style={{ backgroundImage: `url(${featured.bannerUrl ?? featured.posterUrl})` }}>
        <div className="hero-overlay" />
        <div className="hero-content">
          <p className="eyebrow"><span className="live-indicator" /> Новые серии каждую неделю</p>
          <h1>Аниме, которое<br /><em>хочется смотреть</em></h1>
          <p className="hero-description">Собрали свежие релизы, любимую классику и истории, в которые легко нырнуть с головой.</p>
          <a className="hero-button" href="#catalog">Перейти к каталогу <span>↓</span></a>
        </div>
        <div className="hero-featured" aria-label="Рекомендуемый релиз">
          <span>Сейчас смотрят</span>
          <strong>{featured.title}</strong>
          <small>{episodeText(featured)} · ★ {featured.rating?.toFixed(1)}</small>
        </div>
      </section>

      <section className="catalog-section" id="catalog">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Подборка для вас</p>
            <h2 id="new">Каталог релизов</h2>
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
          <div className="release-grid">
            {filtered.map((release) => <Card key={release.id} release={release} onOpen={setSelected} />)}
          </div>
        ) : (
          <div className="empty-state"><span>◌</span><h3>Ничего не нашли</h3><p>Попробуйте убрать фильтр или изменить запрос.</p></div>
        )}
      </section>

      <footer id="about">
        <a className="brand" href="#top">ani<span>tabia</span></a>
        <p>Проект для тех, кто любит хорошие истории.</p>
        <small>© 2026 Anitabia. Демонстрационный интерфейс.</small>
      </footer>
    </main>
  );
}
