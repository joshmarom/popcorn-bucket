import { join } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'

export type LibraryDb = Database.Database

const SCHEMA_V1 = `
CREATE TABLE movies (
  tmdb_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  year INTEGER,
  imdb_id TEXT,
  overview TEXT NOT NULL,
  poster_url TEXT,
  backdrop_url TEXT,
  runtime INTEGER,
  rating REAL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE people (
  tmdb_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  profile_url TEXT
);

CREATE TABLE movie_cast (
  movie_id INTEGER NOT NULL REFERENCES movies(tmdb_id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(tmdb_id) ON DELETE CASCADE,
  character TEXT,
  billing_order INTEGER NOT NULL,
  PRIMARY KEY (movie_id, person_id)
);

CREATE TABLE genres (
  tmdb_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE movie_genres (
  movie_id INTEGER NOT NULL REFERENCES movies(tmdb_id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(tmdb_id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, genre_id)
);

CREATE TABLE lists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE list_items (
  list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('movie', 'person', 'genre')),
  item_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (list_id, kind, item_id)
);

CREATE TABLE watch_progress (
  movie_id INTEGER PRIMARY KEY,
  position REAL NOT NULL,
  duration REAL NOT NULL,
  finished INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE torrents (
  info_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  title TEXT NOT NULL,
  magnet TEXT,
  size TEXT,
  seeders INTEGER NOT NULL,
  leechers INTEGER NOT NULL,
  torrent_file_url TEXT,
  details_url TEXT,
  upload_date TEXT,
  resolution TEXT,
  source TEXT,
  codec TEXT,
  hdr INTEGER NOT NULL,
  release_year INTEGER,
  season INTEGER,
  episode INTEGER,
  season_pack INTEGER NOT NULL,
  movie_id INTEGER,
  fetched_at INTEGER NOT NULL
);

CREATE TABLE torrent_searches (
  cache_key TEXT PRIMARY KEY,
  fetched_at INTEGER NOT NULL,
  errors_json TEXT NOT NULL
);

CREATE TABLE torrent_search_hits (
  cache_key TEXT NOT NULL REFERENCES torrent_searches(cache_key) ON DELETE CASCADE,
  info_hash TEXT NOT NULL REFERENCES torrents(info_hash),
  position INTEGER NOT NULL,
  PRIMARY KEY (cache_key, info_hash)
);

CREATE TABLE library_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_list_items_order ON list_items(list_id, kind, position);
CREATE INDEX idx_torrents_movie ON torrents(movie_id);
CREATE INDEX idx_torrent_hits_order ON torrent_search_hits(cache_key, position);
`

const SCHEMA_V2 = `
ALTER TABLE movies ADD COLUMN release_date TEXT;
ALTER TABLE movies ADD COLUMN tmdb_popularity REAL;
ALTER TABLE movies ADD COLUMN vote_count INTEGER;
ALTER TABLE movies ADD COLUMN list_seen_at INTEGER;

CREATE TABLE movie_swarm (
  tmdb_id INTEGER PRIMARY KEY REFERENCES movies(tmdb_id) ON DELETE CASCADE,
  seeders INTEGER NOT NULL,
  peers INTEGER NOT NULL,
  latest_upload_unix INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);

CREATE INDEX idx_movies_list_seen ON movies(list_seen_at);
CREATE INDEX idx_movie_swarm_seen ON movie_swarm(seen_at);
CREATE INDEX idx_movie_genres_genre ON movie_genres(genre_id);
`

const SCHEMA_V3 = `
CREATE TABLE shows (
  tmdb_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  first_air_date TEXT,
  year INTEGER,
  imdb_id TEXT,
  overview TEXT NOT NULL,
  poster_url TEXT,
  rating REAL,
  vote_count INTEGER,
  tmdb_popularity REAL,
  list_seen_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE show_swarm (
  tmdb_id INTEGER PRIMARY KEY REFERENCES shows(tmdb_id) ON DELETE CASCADE,
  seeders INTEGER NOT NULL,
  peers INTEGER NOT NULL,
  latest_upload_unix INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);

CREATE INDEX idx_shows_imdb ON shows(imdb_id);
CREATE INDEX idx_shows_list_seen ON shows(list_seen_at);
CREATE INDEX idx_show_swarm_seen ON show_swarm(seen_at);
`

/** TorrentClaw quality / episode details (`{ quality?, tvEpisode? }`). */
const SCHEMA_V4 = `
ALTER TABLE torrents ADD COLUMN extras_json TEXT;
`

const MIGRATIONS = [SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4]

let singleton: LibraryDb | null = null

function appliedVersion(db: LibraryDb): number {
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_version').get() as {
    version: number | null
  }
  return row.version ?? 0
}

function migrate(db: LibraryDb): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)')
  const current = appliedVersion(db)
  MIGRATIONS.forEach((sql, index) => {
    const version = index + 1
    if (version <= current) return
    const apply = db.transaction(() => {
      db.exec(sql)
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version)
    })
    apply()
  })
}

/** Opens a library file, turns on WAL, and applies migrations. */
export function openLibraryAt(dbPath: string): LibraryDb {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

export function getLibrary(): LibraryDb {
  if (!singleton) {
    singleton = openLibraryAt(join(app.getPath('userData'), 'library.sqlite'))
  }
  return singleton
}

export function readLibraryMeta(db: LibraryDb, key: string): string | null {
  const row = db.prepare('SELECT value FROM library_meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function writeLibraryMeta(db: LibraryDb, key: string, value: string): void {
  db.prepare(
    `INSERT INTO library_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value)
}

export function closeLibrary(): void {
  singleton?.close()
  singleton = null
}
