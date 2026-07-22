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
  cloudflare_stream_uid TEXT,
  published_at TIMESTAMPTZ,
  UNIQUE (release_id, number)
);

ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cloudflare_stream_uid TEXT;

CREATE INDEX IF NOT EXISTS releases_status_idx ON releases(status);
CREATE INDEX IF NOT EXISTS releases_title_idx ON releases USING GIN (to_tsvector('simple', title));
CREATE INDEX IF NOT EXISTS episodes_release_number_idx ON episodes(release_id, number);
