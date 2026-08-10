import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";

import { AccountDialog, type AuthMode } from "./components/AccountDialog";
import { AchievementToasts, type AchievementToast } from "./components/AchievementToasts";
import { CommentsSection } from "./components/CommentsSection";
import { Header } from "./components/Header";
import { LegalPage } from "./components/LegalPage";
import { RoomPage } from "./components/RoomPage";
import { apiUrl, completeEpisode } from "./api";
import { demoReleases } from "./data";
import { numericPlayerValue, readKodikPlayerEvent } from "./playerApi";
import { applyHomeSeo, applyLegalSeo, applyNotFoundSeo, applyReleaseSeo } from "./seo";
import type { AccountUser, Achievement, CalendarEntry, Episode, ProfileData, Release, ReleaseListStatus, ReleaseStatus, WatchRoomData } from "./types";

type Route =
  | { name: "home" }
  | { name: "calendar" }
  | { name: "profile" }
  | { name: "privacy" }
  | { name: "terms" }
  | { name: "room"; code: string }
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

const catalogueGenres = [
  { value: "", label: "Все" },
  { value: "action", label: "Экшен" },
  { value: "adventure", label: "Приключения" },
  { value: "drama", label: "Драма" },
  { value: "fantasy", label: "Фэнтези" },
  { value: "sci_fi", label: "Фантастика" },
  { value: "supernatural", label: "Сверхъестественное" },
  { value: "comedy", label: "Комедия" },
  { value: "romance", label: "Романтика" },
  { value: "mystery", label: "Детектив" },
  { value: "psychological", label: "Психология" },
  { value: "thriller", label: "Триллер" },
  { value: "sports", label: "Спорт" },
  { value: "music", label: "Музыка" },
  { value: "horror", label: "Ужасы" },
  { value: "mecha", label: "Меха" },
  { value: "slice_of_life", label: "Повседневность" },
];

type CatalogueResponse = {
  data: Release[];
  meta?: { total: number; offset: number; limit: number; hasMore: boolean };
};

type AccountResponse = { data: AccountUser | null };

type ProfileResponse = { data: ProfileData };

function parseRoute(pathname: string): Route {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/") return { name: "home" };
  if (normalized === "/calendar") return { name: "calendar" };
  if (normalized === "/profile") return { name: "profile" };
  if (normalized === "/privacy") return { name: "privacy" };
  if (normalized === "/terms") return { name: "terms" };

  const roomMatch = normalized.match(/^\/room\/([a-z2-9]+)$/i);
  if (roomMatch) return { name: "room", code: roomMatch[1].toLocaleLowerCase("en-US") };

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
  user,
  isFavorite,
  listStatus,
  onToggleFavorite,
  onSetStatus,
  onCreateRoom,
  onAchievements,
  onProfile,
  onOpenAuth,
  onLogout,
}: {
  release: Release;
  onClose: () => void;
  onWatch: () => void;
  onNavigateHome: () => void;
  user: AccountUser | null;
  isFavorite: boolean;
  listStatus: ReleaseListStatus | null;
  onToggleFavorite: () => void;
  onSetStatus: (status: ReleaseListStatus) => void;
  onCreateRoom: () => void;
  onAchievements: (items: Achievement[]) => void;
  onProfile: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
}) {
  return (
    <section className="detail" aria-label={`Подробности: ${release.title}`}>
      <div className="detail-backdrop" style={{ backgroundImage: `url(${release.bannerUrl ?? release.posterUrl})` }} />
      <div className="detail-shade" />
      <Header onNavigateHome={onNavigateHome} user={user} onProfile={onProfile} onOpenAuth={onOpenAuth} onLogout={onLogout} />
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
            <div className="detail-actions">
              <button className="watch-button" onClick={onWatch}>▶ Открыть плеер</button>
              <button className="favorite-button room-create-button" type="button" onClick={onCreateRoom}>◉ Смотреть с друзьями</button>
              <button className={isFavorite ? "favorite-button is-active" : "favorite-button"} type="button" onClick={onToggleFavorite}>
                {isFavorite ? "★ В избранном" : "☆ В избранное"}
              </button>
            </div>
            <div className="list-statuses" aria-label="Статус просмотра">
              <span>Мой список:</span>
              {(["planned", "watching", "completed"] as const).map((status) => (
                <button className={listStatus === status ? "is-active" : ""} type="button" key={status} onClick={() => onSetStatus(status)}>
                  {status === "planned" ? "В планах" : status === "watching" ? "Смотрю" : "Просмотрено"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <CommentsSection release={release} user={user} onOpenAuth={onOpenAuth} onAchievements={onAchievements} />
      </div>
    </section>
  );
}

function WatchPage({
  release,
  onBack,
  onNavigateHome,
  user,
  onProfile,
  onOpenAuth,
  onLogout,
  onPlaybackOpen,
  onCreateRoom,
  onAchievements,
}: {
  release: Release;
  onBack: () => void;
  onNavigateHome: () => void;
  user: AccountUser | null;
  onProfile: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  onPlaybackOpen: (releaseSlug: string, episodeNumber: number) => void;
  onCreateRoom: (episodeNumber: number) => void;
  onAchievements: (items: Achievement[]) => void;
}) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentEpisode, setCurrentEpisode] = useState(1);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const completedRef = useRef(new Set<number>());

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

  useEffect(() => {
    onPlaybackOpen(release.slug, currentEpisode);
  }, [currentEpisode, onPlaybackOpen, release.slug]);

  const markCompleted = useCallback(async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (isCompleting || completedRef.current.has(currentEpisode)) return;
    setIsCompleting(true);
    setCompletionMessage(null);
    try {
      const achievements = await completeEpisode(release.slug, currentEpisode);
      completedRef.current.add(currentEpisode);
      setCompletionMessage(`${currentEpisode} серия отмечена просмотренной`);
      onAchievements(achievements);
    } catch (error: unknown) {
      setCompletionMessage(error instanceof Error ? error.message : "Не удалось сохранить просмотр.");
    } finally {
      setIsCompleting(false);
    }
  }, [currentEpisode, isCompleting, onAchievements, onOpenAuth, release.slug, user]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const playerEvent = readKodikPlayerEvent(event, iframeRef.current);
      if (!playerEvent) return;
      if (playerEvent.name === "kodik_player_current_episode") {
        const episodeNumber = Math.floor(numericPlayerValue(playerEvent.value, "episode", "number") ?? currentEpisode);
        if (episodeNumber > 0) {
          setCurrentEpisode(episodeNumber);
        }
      }
      if (playerEvent.name === "kodik_player_video_ended") void markCompleted();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [currentEpisode, markCompleted, onPlaybackOpen, release.slug]);

  const kodikEpisode = episodes.find((episode) => episode.embedUrl) ?? null;
  const nativeEpisode = episodes.find((episode) => episode.videoUrl) ?? null;
  const kodikEmbedUrl = kodikEpisode?.embedUrl ?? null;
  const nativeVideoUrl = nativeEpisode?.videoUrl ?? null;
  const hasOfficialDestination = Boolean(release.officialUrl);

  return (
    <main className="watch-page">
      <Header variant="solid" onNavigateHome={onNavigateHome} user={user} onProfile={onProfile} onOpenAuth={onOpenAuth} onLogout={onLogout} />
      <div className="watch-layout">
        <section className="player-panel" aria-label="Видеоплеер">
          <button className="watch-back" onClick={onBack}>← К релизу</button>
          <div className="video-stage">
            {kodikEmbedUrl ? (
              <iframe
                ref={iframeRef}
                src={kodikEmbedUrl}
                title={`Kodik: ${release.title}`}
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : release.trailerUrl ? (
              <iframe
                src={release.trailerUrl}
                title={`Официальный трейлер: ${release.title}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : nativeVideoUrl ? (
              <video controls autoPlay src={nativeVideoUrl} poster={release.bannerUrl ?? release.posterUrl} onEnded={() => void markCompleted()}>
                Ваш браузер не поддерживает HTML5-видео.
              </video>
            ) : isLoading ? (
              <div className="licensed-notice">
                <p>Загружаем плеер…</p>
              </div>
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
              <p className="section-kicker">{kodikEmbedUrl ? "Сезон и серия выбираются в плеере" : release.trailerUrl ? "Легальный видеоматериал" : "Видео"}</p>
              <h1>{release.title}</h1>
            </div>
            <span>{kodikEmbedUrl ? "Kodik" : release.trailerUrl ? "YouTube" : nativeEpisode?.durationSeconds ? `${Math.round(nativeEpisode.durationSeconds / 60)} мин` : "—"}</span>
          </div>
          <div className="watch-actions">
            <button className="favorite-button" type="button" onClick={() => onCreateRoom(currentEpisode)}>◉ Смотреть с друзьями</button>
            <button className="favorite-button" type="button" onClick={() => void markCompleted()} disabled={isCompleting}>{isCompleting ? "Сохраняем…" : `✓ ${currentEpisode} серия просмотрена`}</button>
            {completionMessage ? <span>{completionMessage}</span> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function CalendarPage({
  onNavigateHome,
  user,
  onProfile,
  onOpenAuth,
  onLogout,
}: {
  onNavigateHome: () => void;
  user: AccountUser | null;
  onProfile: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
}) {
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    document.title = "Календарь выхода аниме — Anitabia";
    const controller = new AbortController();
    fetch(`${apiUrl}/calendar?limit=200`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Calendar unavailable");
        return response.json() as Promise<{ data: CalendarEntry[]; meta?: { syncedAt?: string | null } }>;
      })
      .then((payload) => {
        setEntries(payload.data);
        setSyncedAt(payload.meta?.syncedAt ?? null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setEntries([]);
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, []);

  const groups = useMemo(() => {
    const result = new Map<string, CalendarEntry[]>();
    for (const entry of entries) {
      const date = entry.nextEpisodeAt ? new Date(entry.nextEpisodeAt) : null;
      const key = date && Number.isFinite(date.getTime())
        ? date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })
        : "Дата уточняется";
      result.set(key, [...(result.get(key) ?? []), entry]);
    }
    return [...result.entries()];
  }, [entries]);

  return (
    <main className="calendar-page">
      <Header variant="solid" onNavigateHome={onNavigateHome} user={user} onProfile={onProfile} onOpenAuth={onOpenAuth} onLogout={onLogout} />
      <section className="calendar-content">
        <div className="calendar-heading">
          <div>
            <p className="section-kicker">Расписание новых серий</p>
            <h1>Календарь выхода аниме</h1>
            <p>Время показано в вашем часовом поясе.</p>
          </div>
          {syncedAt ? <small>Обновлено {new Date(syncedAt).toLocaleString("ru-RU")}</small> : null}
        </div>
        {groups.length ? groups.map(([date, items]) => (
          <section className="calendar-day" key={date}>
            <h2>{date}</h2>
            <div className="calendar-grid">
              {items.map((entry) => (
                <article className="calendar-card" key={entry.shikimoriId}>
                  {entry.posterUrl ? <img src={entry.posterUrl} alt="" loading="lazy" /> : <div className="calendar-poster-placeholder">◌</div>}
                  <div>
                    <p>{entry.nextEpisodeAt ? new Date(entry.nextEpisodeAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "Время уточняется"}</p>
                    <h3>{entry.animeRussian ?? entry.animeName}</h3>
                    {entry.animeRussian ? <small>{entry.animeName}</small> : null}
                    <strong>{entry.nextEpisode ? `${entry.nextEpisode} серия` : "Новая серия"}{entry.episodesTotal ? ` из ${entry.episodesTotal}` : ""}</strong>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )) : (
          <div className="empty-state"><span>◌</span><h3>{isLoading ? "Загружаем календарь…" : "Расписание пока пусто"}</h3><p>{isLoading ? "Получаем даты выхода серий." : "Попробуйте открыть страницу позднее."}</p></div>
        )}
      </section>
    </main>
  );
}

function ProfilePage({
  user,
  profile,
  isLoading,
  onNavigateHome,
  onOpen,
  onSaveUsername,
  onLogout,
}: {
  user: AccountUser;
  profile: ProfileData | null;
  isLoading: boolean;
  onNavigateHome: () => void;
  onOpen: (release: Release) => void;
  onSaveUsername: (username: string) => void;
  onLogout: () => void;
}) {
  const [username, setUsername] = useState(user.username);

  useEffect(() => setUsername(user.username), [user.id, user.username]);

  return (
    <main className="profile-page">
      <Header variant="solid" onNavigateHome={onNavigateHome} user={user} onProfile={() => undefined} onLogout={onLogout} />
      <section className="profile-content">
        <div className="profile-heading">
          <div>
            <p className="section-kicker">Ваш профиль</p>
            <h1>{user.username}</h1>
            <p>{user.email}</p>
          </div>
          <button className="logout-button profile-logout" type="button" onClick={onLogout}>Выйти из аккаунта</button>
        </div>

        <form className="profile-settings" onSubmit={(event) => { event.preventDefault(); onSaveUsername(username); }}>
          <label>
            <span>Имя в профиле</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={32} required />
          </label>
          <button className="favorite-button" type="submit">Сохранить</button>
        </form>

        <section className="profile-stats" aria-label="Статистика просмотра">
          <article><strong>{profile?.stats.completedEpisodes ?? 0}</strong><span>серий просмотрено</span></article>
          <article><strong>{profile?.stats.completedTitles ?? 0}</strong><span>тайтлов завершено</span></article>
          <article><strong>{profile?.stats.comments ?? 0}</strong><span>комментариев</span></article>
        </section>

        <section className="profile-shelf achievements-section">
          <div className="shelf-heading">
            <div><h2>Достижения</h2><p>Открываются за просмотр и участие в обсуждениях.</p></div>
            <span>{profile?.achievements.filter((item) => item.awardedAt).length ?? 0}/{profile?.achievements.length ?? 5}</span>
          </div>
          <div className="achievements-grid">
            {profile?.achievements.map((achievement) => (
              <article className={achievement.awardedAt ? "achievement-card is-unlocked" : "achievement-card"} key={achievement.id}>
                <img src={achievement.iconUrl} alt="" />
                <div><h3>{achievement.title}</h3><p>{achievement.description}</p>{achievement.awardedAt ? <time dateTime={achievement.awardedAt}>Получено {new Date(achievement.awardedAt).toLocaleDateString("ru-RU")}</time> : <small>Пока закрыто</small>}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="profile-shelf">
          <div className="shelf-heading">
            <div><h2>Избранное</h2><p>Тайтлы, к которым хочется вернуться.</p></div>
            <span>{profile?.favorites.length ?? 0}</span>
          </div>
          {profile?.favorites.length ? (
            <div className="release-grid profile-grid">
              {profile.favorites.map((release) => <Card key={release.id} release={release} onOpen={onOpen} />)}
            </div>
          ) : <div className="profile-empty">Добавляйте тайтлы в избранное со страницы релиза.</div>}
        </section>

        <section className="profile-shelf">
          <div className="shelf-heading">
            <div><h2>Продолжить просмотр</h2><p>Недавно открытые плееры.</p></div>
            <span>{profile?.history.length ?? 0}</span>
          </div>
          {profile?.history.length ? (
            <div className="release-grid profile-grid">
              {profile.history.map((item) => <Card key={item.id} release={item} onOpen={onOpen} />)}
            </div>
          ) : <div className="profile-empty">Откройте плеер — тайтл появится здесь.</div>}
        </section>
        {isLoading ? <p className="profile-loading">Загружаем профиль…</p> : null}
      </section>
    </main>
  );
}

function RouteMessage({ title, text, onHome, user, onProfile, onOpenAuth, onLogout }: {
  title: string;
  text: string;
  onHome: () => void;
  user?: AccountUser | null;
  onProfile?: () => void;
  onOpenAuth?: () => void;
  onLogout?: () => void;
}) {
  return (
    <main>
      <Header variant="solid" onNavigateHome={onHome} user={user} onProfile={onProfile} onOpenAuth={onOpenAuth} onLogout={onLogout} />
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
  const [genre, setGenre] = useState("");
  const [status, setStatus] = useState<ReleaseStatus | "all">("all");
  const [catalogReleases, setCatalogReleases] = useState<Release[]>([]);
  const [ongoingReleases, setOngoingReleases] = useState<Release[]>([]);
  const [popularReleases, setPopularReleases] = useState<Release[]>([]);
  const [popularSourceLabel, setPopularSourceLabel] = useState("По голосованию Anime Corner");
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [isCatalogLoadingMore, setIsCatalogLoadingMore] = useState(false);
  const [isApiAvailable, setIsApiAvailable] = useState(false);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [isRouteMissing, setIsRouteMissing] = useState(false);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [achievementToasts, setAchievementToasts] = useState<AchievementToast[]>([]);
  const catalogueRequestRef = useRef(0);
  const accountId = account?.id ?? null;

  const routeSlug = route.name === "release" || route.name === "watch" ? route.slug : null;
  const routeRelease = routeSlug ? releases.find((release) => release.slug === routeSlug) ?? null : null;

  const navigate = (path: string, replace = false) => {
    if (replace) window.history.replaceState({}, "", path);
    else window.history.pushState({}, "", path);
    setRoute(parseRoute(path));
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const loadProfile = useCallback(async () => {
    if (!accountId) {
      setProfile(null);
      return;
    }
    setIsProfileLoading(true);
    try {
      const response = await fetch(`${apiUrl}/profile`, { credentials: "include" });
      if (!response.ok) throw new Error("Profile unavailable");
      const payload = await response.json() as ProfileResponse;
      setProfile(payload.data);
      setAccount(payload.data.user);
    } catch {
      setProfile(null);
    } finally {
      setIsProfileLoading(false);
    }
  }, [accountId]);

  const showAchievements = useCallback((items: Achievement[]) => {
    if (!items.length) return;
    const notifications = items.map((item, index) => ({
      ...item,
      notificationId: `${item.id}-${Date.now()}-${index}`,
    }));
    setAchievementToasts((current) => [...current, ...notifications].slice(-4));
    for (const notification of notifications) {
      window.setTimeout(() => {
        setAchievementToasts((current) => current.filter((item) => item.notificationId !== notification.notificationId));
      }, 7_000);
    }
    void loadProfile();
  }, [loadProfile]);

  const openAuth = useCallback((mode: AuthMode = "login") => {
    setAuthError(null);
    setAuthMode(mode);
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${apiUrl}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => undefined);
    setAccount(null);
    setProfile(null);
    if (route.name === "profile") navigate("/");
  }, [route.name]);

  const submitAuth = useCallback(async ({ email, username, password }: { email: string; username: string; password: string }) => {
    if (!authMode) return;
    setIsAuthSubmitting(true);
    setAuthError(null);
    try {
      const response = await fetch(`${apiUrl}/auth/${authMode === "register" ? "register" : "login"}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(authMode === "register" ? { email, username, password } : { email, password }),
      });
      const payload = await response.json().catch(() => ({ message: "Не удалось выполнить вход." })) as { data?: AccountUser; message?: string };
      if (!response.ok || !payload.data) throw new Error(payload.message ?? "Не удалось выполнить вход.");
      setAccount(payload.data);
      setProfile(null);
      setAuthMode(null);
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : "Не удалось выполнить вход.");
    } finally {
      setIsAuthSubmitting(false);
    }
  }, [authMode]);

  const toggleFavorite = useCallback(async (release: Release) => {
    if (!account) {
      openAuth();
      return;
    }
    const exists = Boolean(profile?.favorites.some((item) => item.id === release.id));
    const response = await fetch(`${apiUrl}/profile/favorites/${encodeURIComponent(release.slug)}`, {
      method: exists ? "DELETE" : "PUT",
      credentials: "include",
    });
    if (!response.ok) return;
    setProfile((current) => current ? {
      ...current,
      favorites: exists ? current.favorites.filter((item) => item.id !== release.id) : [release, ...current.favorites],
    } : current);
  }, [account, openAuth, profile?.favorites]);

  const recordPlayback = useCallback((releaseSlug: string, episodeNumber: number) => {
    if (!accountId) return;
    void fetch(`${apiUrl}/profile/history`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ releaseSlug, episodeNumber }),
    }).then(() => loadProfile()).catch(() => undefined);
  }, [accountId, loadProfile]);

  const setReleaseStatus = useCallback(async (release: Release, status: ReleaseListStatus) => {
    if (!account) {
      openAuth();
      return;
    }
    const response = await fetch(`${apiUrl}/profile/list/${encodeURIComponent(release.slug)}`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = await response.json().catch(() => null) as { data?: { newAchievements?: Achievement[] } } | null;
    if (!response.ok) return;
    setProfile((current) => current ? {
      ...current,
      releaseStatuses: [
        { releaseId: release.id, status },
        ...current.releaseStatuses.filter((item) => item.releaseId !== release.id),
      ],
    } : current);
    showAchievements(payload?.data?.newAchievements ?? []);
    if (!payload?.data?.newAchievements?.length) void loadProfile();
  }, [account, loadProfile, openAuth, showAchievements]);

  const createWatchRoom = useCallback(async (release: Release, episodeNumber = 1) => {
    if (!account) {
      openAuth();
      return;
    }
    const response = await fetch(`${apiUrl}/rooms`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ releaseSlug: release.slug, episodeNumber }),
    });
    const payload = await response.json().catch(() => null) as { data?: WatchRoomData } | null;
    if (response.ok && payload?.data) navigate(`/room/${payload.data.code}`);
  }, [account, openAuth]);

  const saveUsername = useCallback(async (username: string) => {
    const response = await fetch(`${apiUrl}/profile`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const payload = await response.json().catch(() => null) as { data?: AccountUser } | null;
    const updatedUser = payload?.data;
    if (response.ok && updatedUser) {
      setAccount(updatedUser);
      setProfile((current) => current ? { ...current, user: updatedUser } : current);
    }
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/auth/me`, { credentials: "include", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<AccountResponse> : null)
      .then((payload) => setAccount(payload?.data ?? null))
      .catch(() => setAccount(null));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!account) return;
    void loadProfile();
  }, [accountId, loadProfile]);

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
    const controller = new AbortController();

    fetch(`${apiUrl}/releases/popular`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Popular releases unavailable");
        return response.json() as Promise<{
          data: Release[];
          meta?: { source?: { label?: string } };
        }>;
      })
      .then((payload) => {
        setPopularReleases(payload.data);
        if (payload.meta?.source?.label) setPopularSourceLabel(payload.meta.source.label);
        setIsApiAvailable(true);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPopularReleases([]);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${apiUrl}/releases?status=ongoing&limit=200`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Ongoing releases unavailable");
        return response.json() as Promise<{ data: Release[] }>;
      })
      .then((payload) => {
        setOngoingReleases(payload.data);
        setIsApiAvailable(true);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setOngoingReleases([]);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = catalogueRequestRef.current + 1;
    catalogueRequestRef.current = requestId;
    const params = new URLSearchParams({ limit: "24", offset: "0" });
    const normalizedSearch = search.trim();
    if (normalizedSearch) params.set("search", normalizedSearch);
    if (genre) params.set("genre", genre);
    if (status !== "all") params.set("status", status);

    setIsCatalogLoading(true);
    setIsCatalogLoadingMore(false);

    fetch(`${apiUrl}/releases?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Catalogue unavailable");
        return response.json() as Promise<CatalogueResponse>;
      })
      .then((payload) => {
        if (catalogueRequestRef.current !== requestId) return;
        setCatalogReleases(payload.data);
        setCatalogTotal(payload.meta?.total ?? payload.data.length);
        setIsApiAvailable(true);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (catalogueRequestRef.current !== requestId) return;
        setCatalogReleases([]);
        setCatalogTotal(0);
      })
      .finally(() => {
        if (catalogueRequestRef.current === requestId) setIsCatalogLoading(false);
      });

    return () => controller.abort();
  }, [genre, search, status]);

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
    if (route.name === "privacy" || route.name === "terms") {
      applyLegalSeo(route.name);
      return;
    }
    if (route.name === "not-found" || isRouteMissing) applyNotFoundSeo();
  }, [isRouteMissing, route, routeRelease]);

  const loadMoreCatalogue = () => {
    if (isCatalogLoadingMore || isCatalogLoading || catalogReleases.length >= catalogTotal) return;

    const requestId = catalogueRequestRef.current;
    const params = new URLSearchParams({ limit: "24", offset: String(catalogReleases.length) });
    const normalizedSearch = search.trim();
    if (normalizedSearch) params.set("search", normalizedSearch);
    if (genre) params.set("genre", genre);
    if (status !== "all") params.set("status", status);

    setIsCatalogLoadingMore(true);
    fetch(`${apiUrl}/releases?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Catalogue unavailable");
        return response.json() as Promise<CatalogueResponse>;
      })
      .then((payload) => {
        if (catalogueRequestRef.current !== requestId) return;
        setCatalogReleases((current) => [...current, ...payload.data.filter((item) => !current.some((known) => known.id === item.id))]);
        setCatalogTotal(payload.meta?.total ?? catalogReleases.length + payload.data.length);
      })
      .catch(() => undefined)
      .finally(() => {
        if (catalogueRequestRef.current === requestId) setIsCatalogLoadingMore(false);
      });
  };

  const newestEpisodes = useMemo(() => {
    const currentSeries = ongoingReleases.filter((release) => (
      release.releaseType === "series" && release.episodesReleased > 0
    ));
    const fallback = releases.filter((release) => release.status === "ongoing" && release.releaseType === "series");

    return [...(currentSeries.length ? currentSeries : fallback)]
      .sort((left, right) => right.releaseYear - left.releaseYear || right.episodesReleased - left.episodesReleased || (right.rating ?? 0) - (left.rating ?? 0))
      .slice(0, 12);
  }, [ongoingReleases, releases]);

  const popularFallback = useMemo(() => [...releases]
    .sort((left, right) => (right.rating ?? 0) - (left.rating ?? 0) || right.releaseYear - left.releaseYear)
    .slice(0, 12), [releases]);

  const featuredReleases = useMemo(() => [...releases]
    .sort((left, right) => (right.rating ?? 0) - (left.rating ?? 0) || right.releaseYear - left.releaseYear)
    .slice(0, 12), [releases]);
  const featured = featuredReleases[featuredIndex % Math.max(featuredReleases.length, 1)] ?? demoReleases[0];
  const goHome = () => navigate("/");
  const goProfile = () => account ? navigate("/profile") : openAuth();
  const withAccountDialog = (content: ReactNode) => (
    <>
      {content}
      <AchievementToasts items={achievementToasts} onDismiss={(id) => setAchievementToasts((current) => current.filter((item) => item.notificationId !== id))} />
      {authMode ? (
        <AccountDialog
          mode={authMode}
          isSubmitting={isAuthSubmitting}
          error={authError}
          onClose={() => setAuthMode(null)}
          onModeChange={(mode) => { setAuthError(null); setAuthMode(mode); }}
          onSubmit={submitAuth}
        />
      ) : null}
    </>
  );

  useEffect(() => {
    setFeaturedIndex((index) => index % Math.max(featuredReleases.length, 1));
    if (featuredReleases.length < 2) return;

    const interval = window.setInterval(() => {
      setFeaturedIndex((index) => (index + 1) % featuredReleases.length);
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [featuredReleases.length]);

  if (route.name === "not-found" || isRouteMissing) {
    return withAccountDialog(
      <RouteMessage title="Страница не найдена" text="Такого релиза или раздела пока нет." onHome={goHome} user={account} onProfile={goProfile} onOpenAuth={openAuth} onLogout={logout} />,
    );
  }

  if ((route.name === "release" || route.name === "watch") && !routeRelease) {
    return withAccountDialog(
      <RouteMessage
        title={isRouteLoading ? "Загружаем релиз…" : "Релиз недоступен"}
        text={isRouteLoading ? "Получаем данные из каталога." : "Проверьте подключение к API или вернитесь в каталог."}
        onHome={goHome}
        user={account}
        onProfile={goProfile}
        onOpenAuth={openAuth}
        onLogout={logout}
      />
    );
  }

  if (route.name === "calendar") {
    return withAccountDialog(
      <CalendarPage
        onNavigateHome={goHome}
        user={account}
        onProfile={goProfile}
        onOpenAuth={openAuth}
        onLogout={logout}
      />,
    );
  }

  if (route.name === "privacy" || route.name === "terms") {
    return withAccountDialog(
      <LegalPage
        document={route.name}
        user={account}
        onNavigateHome={goHome}
        onProfile={goProfile}
        onOpenAuth={openAuth}
        onLogout={logout}
      />,
    );
  }

  if (route.name === "room") {
    if (!account) {
      return withAccountDialog(
        <RouteMessage title="Войдите для совместного просмотра" text="Комнаты доступны зарегистрированным пользователям. После входа вы вернётесь к комнате по этой же ссылке." onHome={goHome} user={account} onProfile={goProfile} onOpenAuth={openAuth} onLogout={logout} />,
      );
    }
    return withAccountDialog(
      <RoomPage
        code={route.code}
        user={account}
        onNavigateHome={goHome}
        onProfile={goProfile}
        onLogout={logout}
        onAchievements={showAchievements}
      />,
    );
  }

  if (route.name === "profile") {
    if (!account) {
      return withAccountDialog(
        <RouteMessage title="Войдите в аккаунт" text="Профиль хранит избранное и историю просмотра." onHome={goHome} user={account} onProfile={goProfile} onOpenAuth={openAuth} onLogout={logout} />,
      );
    }
    return withAccountDialog(
      <ProfilePage
        user={account}
        profile={profile}
        isLoading={isProfileLoading}
        onNavigateHome={goHome}
        onOpen={(release) => navigate(`/anime/${encodeURIComponent(release.slug)}`)}
        onSaveUsername={saveUsername}
        onLogout={logout}
      />,
    );
  }

  if (route.name === "watch" && routeRelease) {
    return withAccountDialog(
      <WatchPage
        release={routeRelease}
        onBack={() => navigate(`/anime/${encodeURIComponent(routeRelease.slug)}`)}
        onNavigateHome={goHome}
        user={account}
        onProfile={goProfile}
        onOpenAuth={openAuth}
        onLogout={logout}
        onPlaybackOpen={recordPlayback}
        onCreateRoom={(episodeNumber) => void createWatchRoom(routeRelease, episodeNumber)}
        onAchievements={showAchievements}
      />
    );
  }

  if (route.name === "release" && routeRelease) {
    return withAccountDialog(
      <ReleaseDetail
        release={routeRelease}
        onClose={goHome}
        onNavigateHome={goHome}
        onWatch={() => navigate(`/anime/${encodeURIComponent(routeRelease.slug)}/watch`)}
        user={account}
        isFavorite={Boolean(profile?.favorites.some((item) => item.id === routeRelease.id))}
        listStatus={profile?.releaseStatuses.find((item) => item.releaseId === routeRelease.id)?.status ?? null}
        onToggleFavorite={() => void toggleFavorite(routeRelease)}
        onSetStatus={(status) => void setReleaseStatus(routeRelease, status)}
        onCreateRoom={() => void createWatchRoom(routeRelease)}
        onAchievements={showAchievements}
        onProfile={goProfile}
        onOpenAuth={openAuth}
        onLogout={logout}
      />
    );
  }

  return withAccountDialog(
    <main>
      <Header user={account} onProfile={goProfile} onOpenAuth={openAuth} onLogout={logout} />
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
          description="Актуальные онгоинги с доступными сериями"
          releases={newestEpisodes}
          onOpen={(item) => navigate(`/anime/${encodeURIComponent(item.slug)}`)}
        />
        <ReleaseShelf
          title="Сейчас популярно"
          description={popularSourceLabel}
          releases={popularReleases.length ? popularReleases : popularFallback}
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
          {catalogueGenres.map((item) => (
            <button className={genre === item.value ? "genre active" : "genre"} onClick={() => setGenre(item.value)} key={item.value}>{item.label}</button>
          ))}
        </div>
        {catalogReleases.length ? (
          <>
            <div className="release-grid">
              {catalogReleases.map((release) => (
                <Card
                  key={release.id}
                  release={release}
                  onOpen={(item) => navigate(`/anime/${encodeURIComponent(item.slug)}`)}
                />
              ))}
            </div>
            {catalogReleases.length < catalogTotal ? (
              <div className="load-more">
                <button type="button" onClick={loadMoreCatalogue} disabled={isCatalogLoadingMore}>
                  {isCatalogLoadingMore ? "Загружаем…" : "Показать ещё"}
                </button>
                <p>Показано {catalogReleases.length} из {catalogTotal}</p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="empty-state"><span>◌</span><h3>{isCatalogLoading ? "Загружаем каталог…" : "Ничего не нашли"}</h3><p>{isCatalogLoading ? "Получаем тайтлы из каталога." : "Попробуйте убрать фильтр или изменить запрос."}</p></div>
        )}
      </section>
      <footer id="about">
        <div className="footer-inner">
          <a className="brand" href="#top">ani<span>tabia</span></a>
          <p>Проект для тех, кто любит хорошие истории.</p>
          <nav className="footer-legal" aria-label="Юридические документы">
            <a href="/privacy">Политика конфиденциальности</a>
            <a href="/terms">Условия использования</a>
          </nav>
          <small>© 2026 Anitabia.</small>
        </div>
      </footer>
    </main>
  );
}
