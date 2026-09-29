import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { app } from 'electron'
import { withReleaseInfo, type RawTorrentSource } from '@shared/torrent'
import { openLibraryAt } from './db'
import { importLegacySnapshot } from './migrate'
import { upsertGenres, upsertMovie, upsertMovieListRows } from './movies'
import { rankMovies, recordTrendingSwarm } from './ranked-lists'
import {
  getShowWatchlist,
  rankShows,
  readShowListFacts,
  recordShowSwarm,
  setShowInWatchlist,
  upsertShowDetails,
  upsertShowListRows
} from './shows'
import { TORRENT_SEARCH_FRESH_MS, readTorrentSearch, writeTorrentSearch } from './torrents'
import { MY_LIST, getWatchProgress, getWatchlist } from './watch'

const DAY_MS = 24 * 60 * 60 * 1000

function torrent(title: string, hash: string): RawTorrentSource {
  return {
    title,
    providerName: 'YTS',
    size: '1.4 GB',
    seeders: 12,
    leechers: 1,
    magnetUri: `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}`,
    torrentFileUrl: null,
    detailsUrl: null,
    uploadDate: null
  }
}

function run(): void {
  const dir = mkdtempSync(join(tmpdir(), 'pb-library-'))
  const db = openLibraryAt(join(dir, 'library.sqlite'))
  try {
    assert.equal(db.pragma('journal_mode', { simple: true }), 'wal')
    assert.deepEqual(
      (
        db.prepare('SELECT version FROM schema_version ORDER BY version').all() as {
          version: number
        }[]
      ).map((row) => row.version),
      [1, 2, 3, 4, 5, 6]
    )

    upsertMovie(db, {
      tmdbId: 550,
      title: 'Fight Club',
      releaseDate: '1999-10-15',
      imdbId: 'TT0137523',
      overview: 'An insomniac office worker and a soap maker form an underground fight club.',
      posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
      runtime: 139,
      rating: 8.4,
      genres: [
        { id: 18, name: 'Drama' },
        { id: 53, name: 'Thriller' }
      ],
      cast: [
        {
          id: 819,
          name: 'Edward Norton',
          character: 'The Narrator',
          profileUrl: 'https://image.tmdb.org/t/p/w185/norton.jpg'
        },
        { id: 287, name: 'Brad Pitt', character: 'Tyler Durden', profileUrl: null }
      ]
    })

    const movie = db
      .prepare('SELECT title, year, imdb_id, runtime, rating FROM movies WHERE tmdb_id = 550')
      .get() as {
      title: string
      year: number
      imdb_id: string
      runtime: number
      rating: number
    }
    assert.equal(movie.title, 'Fight Club')
    assert.equal(movie.year, 1999)
    assert.equal(movie.imdb_id, 'tt0137523')
    assert.equal(movie.runtime, 139)
    assert.equal(movie.rating, 8.4)

    const queued = db
      .prepare(
        `SELECT kind, size FROM media_assets WHERE tmdb_id = 550 ORDER BY kind, size`
      )
      .all() as { kind: string; size: string }[]
    assert.deepEqual(queued, [
      { kind: 'backdrop', size: 'w1280' },
      { kind: 'poster', size: 'w185' },
      { kind: 'poster', size: 'w500' },
      { kind: 'profile', size: 'w185' }
    ])

    const genres = db
      .prepare(
        `SELECT g.name FROM movie_genres mg
         JOIN genres g ON g.tmdb_id = mg.genre_id
         WHERE mg.movie_id = 550
         ORDER BY g.name`
      )
      .all() as { name: string }[]
    assert.deepEqual(
      genres.map((genre) => genre.name),
      ['Drama', 'Thriller']
    )

    const cast = db
      .prepare(
        `SELECT p.name, c.character, c.billing_order
         FROM movie_cast c
         JOIN people p ON p.tmdb_id = c.person_id
         WHERE c.movie_id = 550
         ORDER BY c.billing_order`
      )
      .all() as { name: string; character: string; billing_order: number }[]
    assert.deepEqual(cast, [
      { name: 'Edward Norton', character: 'The Narrator', billing_order: 0 },
      { name: 'Brad Pitt', character: 'Tyler Durden', billing_order: 1 }
    ])

    const now = 1_700_000_000_000
    const oldAt = now - TORRENT_SEARCH_FRESH_MS - DAY_MS
    const oldHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const freshHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const cacheKey = 'tt0137523::fight club 1999'
    const imported = importLegacySnapshot(db, {
      watchlist: [550, 680],
      progress: [
        {
          movieId: 550,
          position: 180,
          duration: 8340,
          updatedAt: now - DAY_MS,
          finished: false
        }
      ],
      torrentEntries: {
        [cacheKey]: {
          savedAt: oldAt,
          results: [torrent('Fight.Club.1999.720p.BluRay.x264', oldHash)],
          errors: [{ provider: 'Knaben', message: 'timed out' }]
        }
      }
    })
    assert.equal(imported, true)
    assert.equal(
      (db.prepare('SELECT name FROM lists WHERE name = ?').get(MY_LIST) as { name: string }).name,
      MY_LIST
    )
    assert.deepEqual(getWatchlist(db), [550, 680])
    assert.equal(getWatchProgress(db, 550)?.position, 180)
    assert.equal(
      importLegacySnapshot(db, { watchlist: [1], progress: [], torrentEntries: {} }),
      false
    )
    assert.deepEqual(getWatchlist(db), [550, 680])

    assert.equal(readTorrentSearch(db, cacheKey, now), null)
    const kept = db.prepare('SELECT info_hash, resolution, movie_id FROM torrents').all() as {
      info_hash: string
      resolution: string
      movie_id: number
    }[]
    assert.deepEqual(kept, [{ info_hash: oldHash, resolution: '720p', movie_id: 550 }])

    writeTorrentSearch(
      db,
      cacheKey,
      {
        ok: true,
        results: [withReleaseInfo(torrent('Fight.Club.1999.1080p.BluRay.x264', freshHash))],
        errors: []
      },
      now
    )
    const fresh = readTorrentSearch(db, cacheKey, now + DAY_MS)
    assert.equal(fresh?.ok, true)
    if (!fresh?.ok) return
    assert.equal(fresh.cached, true)
    assert.equal(fresh.cachedAtMs, now)
    assert.equal(fresh.results.length, 1)
    assert.equal(fresh.results[0]?.release.resolution, '1080p')
    assert.equal(readTorrentSearch(db, cacheKey, now + TORRENT_SEARCH_FRESH_MS + DAY_MS), null)

    const remaining = db.prepare('SELECT info_hash FROM torrents ORDER BY info_hash').all() as {
      info_hash: string
    }[]
    assert.deepEqual(
      remaining.map((row) => row.info_hash),
      [oldHash, freshHash]
    )

    upsertGenres(db, [
      { id: 18, name: 'Drama' },
      { id: 35, name: 'Comedy' }
    ])
    upsertMovieListRows(
      db,
      [
        {
          tmdbId: 550,
          title: 'Fight Club',
          releaseDate: '1999-10-15',
          overview: '',
          posterUrl: 'https://image.tmdb.org/t/p/w185/other.jpg',
          voteAverage: 8.4,
          voteCount: 30_000,
          popularity: 60,
          genreIds: [18, 53]
        },
        {
          tmdbId: 700,
          title: 'Quiet Drama',
          releaseDate: '2022-03-01',
          overview: 'A popular drama nobody has seeded.',
          posterUrl: null,
          voteAverage: 7.2,
          voteCount: 900,
          popularity: 300,
          genreIds: [18, 999]
        },
        {
          tmdbId: 800,
          title: 'Loud Comedy',
          releaseDate: '2023-01-10',
          overview: 'A comedy.',
          posterUrl: null,
          voteAverage: 6.8,
          voteCount: 1500,
          popularity: 200,
          genreIds: [35]
        }
      ],
      now
    )
    const kept550 = db
      .prepare('SELECT overview, poster_url, runtime, imdb_id FROM movies WHERE tmdb_id = 550')
      .get() as { overview: string; poster_url: string; runtime: number; imdb_id: string }
    assert.match(kept550.overview, /insomniac/)
    assert.equal(kept550.poster_url, 'https://image.tmdb.org/t/p/w500/poster.jpg')
    assert.equal(kept550.runtime, 139)
    assert.equal(kept550.imdb_id, 'tt0137523')
    assert.deepEqual(
      (
        db.prepare('SELECT genre_id FROM movie_genres WHERE movie_id = 700').all() as {
          genre_id: number
        }[]
      ).map((row) => row.genre_id),
      [18]
    )

    recordTrendingSwarm(db, [{ tmdbId: 800, seeders: 900, peers: 40, latestUploadUnix: 0 }], now)
    const drama = rankMovies(db, { genreId: 18, limit: 10, now })
    assert.deepEqual(
      drama.map((m) => m.id),
      [550, 700]
    )
    const all = rankMovies(db, { limit: 10, now })
    assert.deepEqual(new Set(all.map((m) => m.id)), new Set([550, 700, 800]))
    assert.ok(
      all.findIndex((m) => m.id === 800) < all.findIndex((m) => m.id === 700),
      'seeded comedy should outrank the unseeded drama'
    )
    const fightClub = all.find((m) => m.id === 550)
    assert.equal(fightClub?.runtime, 139)
    assert.equal(fightClub?.voteAverage, 8.4)
    assert.deepEqual(fightClub?.genres, ['Drama', 'Thriller'])
    const quiet = all.find((m) => m.id === 700)
    assert.equal(quiet?.runtime, null)
    assert.deepEqual(quiet?.genres, ['Drama'])
    assert.deepEqual(
      rankMovies(db, { limit: 10, now: now + 40 * DAY_MS }).map((m) => m.id),
      []
    )

    const showRow = {
      overview: 'A show.',
      posterUrl: null,
      voteAverage: 7.5,
      voteCount: 800,
      popularity: 150
    }
    upsertShowListRows(
      db,
      [
        {
          ...showRow,
          tmdbId: 1,
          name: 'Popular Soap',
          firstAirDate: '2010-01-01',
          popularity: 900
        },
        { ...showRow, tmdbId: 2, name: 'Seeded Drama', firstAirDate: '2019-05-01' },
        { ...showRow, tmdbId: 3, name: 'Searched Comedy', firstAirDate: '2018-02-01' }
      ],
      now
    )
    upsertShowDetails(db, {
      tmdbId: 3,
      name: 'Searched Comedy',
      firstAirDate: '2018-02-01',
      overview: 'Full overview.',
      posterUrl: 'https://image.tmdb.org/t/p/w342/comedy.jpg',
      imdbId: 'tt7654321',
      voteAverage: 7.5,
      voteCount: 800,
      popularity: 150
    })
    upsertShowListRows(
      db,
      [{ ...showRow, tmdbId: 3, name: 'Searched Comedy', firstAirDate: null }],
      now
    )
    assert.equal(
      (db.prepare('SELECT overview FROM shows WHERE tmdb_id = 3').get() as { overview: string })
        .overview,
      'Full overview.'
    )
    recordShowSwarm(
      db,
      [{ tmdbId: 2, seeders: 2500, peers: 90, latestUploadUnix: Math.floor(now / 1000) }],
      now
    )
    writeTorrentSearch(
      db,
      'tt7654321::searched comedy s02e03',
      {
        ok: true,
        results: [
          withReleaseInfo(
            torrent(
              'Searched.Comedy.S02E03.1080p.WEB.x264',
              'cccccccccccccccccccccccccccccccccccccccc'
            )
          )
        ],
        errors: []
      },
      now
    )
    const shows = rankShows(db, { limit: 10, now })
    assert.deepEqual(
      shows.map((s) => s.id),
      [2, 3, 1],
      'swarm and searched copies should outrank a popular show with no torrents'
    )
    assert.equal(shows[1]?.posterUrl, 'https://image.tmdb.org/t/p/w342/comedy.jpg')

    upsertShowListRows(
      db,
      [{ ...showRow, tmdbId: 1, name: 'Popular Soap', firstAirDate: null, genres: ['Soap'] }],
      now
    )
    upsertShowDetails(db, {
      tmdbId: 2,
      name: 'Seeded Drama',
      firstAirDate: '2019-05-01',
      overview: 'A show.',
      posterUrl: null,
      imdbId: null,
      voteAverage: 7.5,
      voteCount: 800,
      popularity: 150,
      facts: {
        genres: ['Drama', 'Crime'],
        seasonCount: 3,
        tmdbStatus: 'Ended',
        lastAirDate: '2023-06-01',
        lastEpisodeAirDate: '2023-06-01'
      }
    })
    const facts = readShowListFacts(db, [1, 2, 99])
    assert.deepEqual(facts.get(1)?.genres, ['Soap'])
    assert.equal(facts.get(1)?.factsAt, null)
    assert.deepEqual(facts.get(2)?.genres, ['Drama', 'Crime'])
    assert.equal(facts.get(2)?.seasonCount, 3)
    assert.equal(facts.get(2)?.tmdbStatus, 'Ended')
    assert.ok((facts.get(2)?.factsAt ?? 0) > 0)
    assert.equal(facts.has(99), false)
    assert.deepEqual(rankShows(db, { limit: 10, now }).find((s) => s.id === 2)?.genres, [
      'Drama',
      'Crime'
    ])

    assert.deepEqual(getShowWatchlist(db), [])
    setShowInWatchlist(db, 2, true, now)
    assert.deepEqual(setShowInWatchlist(db, 3, true, now + 1), [3, 2])
    assert.deepEqual(setShowInWatchlist(db, 2, false), [3])
    assert.deepEqual(getWatchlist(db), [550, 680], 'the movie watchlist is untouched')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

app.whenReady().then(() => {
  try {
    run()
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
