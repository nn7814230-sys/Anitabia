CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  original_title TEXT,
  description TEXT NOT NULL,
  poster_url TEXT NOT NULL,
  banner_url TEXT,
  trailer_url TEXT,
  official_url TEXT,
  release_year SMALLINT NOT NULL CHECK (release_year BETWEEN 1900 AND 2200),
  release_type TEXT NOT NULL CHECK (release_type IN ('series', 'movie', 'ova', 'ona')),
  status TEXT NOT NULL CHECK (status IN ('ongoing', 'completed', 'announced')),
  episodes_total SMALLINT,
  episodes_released SMALLINT NOT NULL DEFAULT 0,
  rating NUMERIC(3, 1),
  age_rating TEXT NOT NULL DEFAULT '16+',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE releases ADD COLUMN IF NOT EXISTS trailer_url TEXT;
ALTER TABLE releases ADD COLUMN IF NOT EXISTS official_url TEXT;
ALTER TABLE releases ADD COLUMN IF NOT EXISTS shikimori_id INTEGER;

CREATE INDEX IF NOT EXISTS releases_shikimori_id_idx ON releases(shikimori_id);

CREATE TABLE IF NOT EXISTS release_aliases (
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  PRIMARY KEY (release_id, normalized_alias)
);

CREATE INDEX IF NOT EXISTS release_aliases_normalized_idx ON release_aliases(normalized_alias);

CREATE TABLE IF NOT EXISTS genres (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS release_genres (
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (release_id, genre_id)
);

CREATE TABLE IF NOT EXISTS episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  number SMALLINT NOT NULL CHECK (number > 0),
  title TEXT,
  duration_seconds INTEGER,
  video_url TEXT,
  kodik_url TEXT,
  published_at TIMESTAMPTZ,
  UNIQUE (release_id, number)
);

ALTER TABLE episodes ADD COLUMN IF NOT EXISTS kodik_url TEXT;
ALTER TABLE episodes DROP COLUMN IF EXISTS cloudflare_stream_uid;

CREATE INDEX IF NOT EXISTS releases_status_idx ON releases(status);
CREATE INDEX IF NOT EXISTS releases_title_idx ON releases USING GIN (to_tsvector('simple', title));
CREATE INDEX IF NOT EXISTS episodes_release_number_idx ON episodes(release_id, number);

CREATE TABLE IF NOT EXISTS release_calendar (
  shikimori_id INTEGER PRIMARY KEY,
  anime_name TEXT NOT NULL,
  anime_russian TEXT,
  poster_url TEXT,
  next_episode SMALLINT,
  next_episode_at TIMESTAMPTZ,
  duration_minutes SMALLINT,
  anime_kind TEXT,
  score NUMERIC(3, 1),
  status TEXT,
  episodes_total SMALLINT,
  episodes_aired SMALLINT,
  aired_on DATE,
  released_on DATE,
  source_synced_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS release_calendar_next_episode_idx
  ON release_calendar(next_episode_at ASC NULLS LAST);

CREATE TABLE IF NOT EXISTS calendar_syncs (
  source TEXT PRIMARY KEY,
  synced_at TIMESTAMPTZ NOT NULL,
  entries_count INTEGER NOT NULL,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS anime_corner_rankings (
  rank SMALLINT PRIMARY KEY CHECK (rank > 0),
  source_title TEXT NOT NULL,
  vote_percent NUMERIC(5, 2),
  release_id UUID REFERENCES releases(id) ON DELETE SET NULL,
  article_url TEXT NOT NULL,
  article_title TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS anime_corner_rankings_release_idx ON anime_corner_rankings(release_id);

CREATE TABLE IF NOT EXISTS anime_corner_syncs (
  source TEXT PRIMARY KEY,
  article_url TEXT NOT NULL,
  article_title TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL,
  rankings_count INTEGER NOT NULL,
  matched_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(email) BETWEEN 3 AND 255),
  CHECK (char_length(username) BETWEEN 3 AND 32)
);

CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_lower_uidx ON app_users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_lower_uidx ON app_users (lower(username));

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_sessions_user_expiry_idx ON user_sessions (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS user_favorites (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, release_id)
);

CREATE INDEX IF NOT EXISTS user_favorites_created_idx ON user_favorites (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_watch_history (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  episode_number SMALLINT CHECK (episode_number IS NULL OR episode_number > 0),
  last_watched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, release_id)
);

CREATE INDEX IF NOT EXISTS user_watch_history_recent_idx ON user_watch_history (user_id, last_watched_at DESC);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon_url TEXT NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS user_achievements_awarded_idx
  ON user_achievements (user_id, awarded_at DESC);

CREATE TABLE IF NOT EXISTS user_episode_completions (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  episode_number SMALLINT NOT NULL CHECK (episode_number > 0),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, release_id, episode_number)
);

CREATE INDEX IF NOT EXISTS user_episode_completions_recent_idx
  ON user_episode_completions (user_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS user_release_statuses (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('planned', 'watching', 'completed')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, release_id)
);

CREATE INDEX IF NOT EXISTS user_release_statuses_status_idx
  ON user_release_statuses (user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS release_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS release_comments_release_created_idx
  ON release_comments (release_id, created_at DESC);
CREATE INDEX IF NOT EXISTS release_comments_user_created_idx
  ON release_comments (user_id, created_at DESC);

INSERT INTO achievements (id, title, description, icon_url, sort_order) VALUES
  ('first-step', 'Первый шаг', 'Посмотреть первую серию любого аниме.', '/achievements/first-step.svg', 10),
  ('couch-expert', 'Диванный эксперт', 'Оставить 5 развёрнутых комментариев длиннее 100 символов.', '/achievements/couch-expert.svg', 20),
  ('title-eater', 'Пожиратель тайтлов', 'Завершить просмотр 10 аниме.', '/achievements/title-eater.svg', 30),
  ('kamikaze', 'Камикадзе', 'Досмотреть до конца аниме в жанре «Драма».', '/achievements/kamikaze.svg', 40),
  ('episode-century', 'Сотая серия', 'Посмотреть 100 серий.', '/achievements/episode-century.svg', 50)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  icon_url = EXCLUDED.icon_url,
  sort_order = EXCLUDED.sort_order;
