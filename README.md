<p align="center">
  <img src="build/icon.png" width="128" alt="Popcorn Bucket" />
</p>

<h1 align="center">Popcorn Bucket</h1>

<p align="center">
  A desktop home for movies and TV shows: discover, stream, download, and pick up where you left off.
</p>

<p align="center">
  <a href="https://github.com/joshmarom/popcorn-bucket/actions/workflows/build.yml"><img src="https://github.com/joshmarom/popcorn-bucket/actions/workflows/build.yml/badge.svg" alt="Build" /></a>
  <a href="https://github.com/joshmarom/popcorn-bucket/releases/latest"><img src="https://img.shields.io/github/v/release/joshmarom/popcorn-bucket" alt="Latest release" /></a>
</p>

## Features

- **Movies and TV, one shell.** Trending, streaming Top 10s, genre rails, and collections, with search that follows you between sections.
- **Stream or download.** Torrent sources ranked by quality and swarm health, played in-app over WebTorrent or handed to mpv.
- **Library.** Continue watching, My list, and My shows, synced to your account.
- **Subtitles.** Fetched from OpenSubtitles when a release ships without them.
- **Native feel.** View-transition motion, a dark interface built for posters, and installers for macOS, Windows 10/11, and Linux.

## Quick start

Requires Node.js 22.12+.

```bash
npm install
npm run dev
```

The catalog is served by the Popcorn API, so no keys are needed to browse. Optional keys for TMDB, OMDb, TorrentClaw, and OpenSubtitles go in **Settings**, or in `.env` (see [`.env.example`](.env.example)).

## Scripts

| Command                               | What it does                              |
| ------------------------------------- | ----------------------------------------- |
| `npm run dev`                         | Run the app with hot reload               |
| `npm run build`                       | Typecheck and compile into `out/`         |
| `npm test`                            | Unit tests and the library database check |
| `npm run lint`                        | ESLint                                    |
| `npm run build:mac` / `win` / `linux` | Package installers into `dist/`           |

## Under the hood

Electron 44, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, SQLite for the local library, and WebTorrent. The API in [`server/`](server/) runs on Hono, Postgres, and Better Auth.

```
src/main       Electron main process: torrents, playback, library, settings
src/renderer   React UI
src/shared     Types and logic shared by both
server         Popcorn API: catalog, search, accounts
```

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.
