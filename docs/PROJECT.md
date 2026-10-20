# Popcorn Bucket — Project Guide

Living reference for maintainers and agents. Update it when architecture, playback, or release builds change.

Secrets (API keys, database URLs, signing certificates) stay in `.env`, the server environment, and GitHub Actions. This doc names where they live, not their values.

## What this is

A desktop app for discovering movies and TV shows, resolving a torrent, and playing or downloading it. Catalog browsing and torrent search go through the hosted Popcorn API at `https://popcorn.josh.co.il`. WebTorrent streaming, disk downloads, `mpv`, and the local library run on the machine.

Three surfaces:

| Surface | Where | Role |
| --- | --- | --- |
| Desktop | `src/` | Electron app: discovery, detail pages, playback, downloads, SQLite library |
| API | `server/` | Hono server: catalog, auth, subtitles, torrent search, the public site |
| Website | `website/` | Download page served by the API at `https://popcorn.josh.co.il/` |

There is no VidCore or other embedded web player. Playback is the in-app Vidstack player or `mpv`. Packaged builds do not open developer tools; `npm run dev` still does.

## Playback on a title

The movie poster column is **My list**, then one Play control. Play is the top half. The strip underneath names the copy that will play (resolution, source, size, seeders) or the current status (searching, buffering, on disk, failed). The strip opens the Sources list. An error on that strip can be dismissed.

The app ranks releases and offers the best copy for the preferred resolution (`1080p` by default). TV episode play searches the episode and the season pack, then ranks those rows in the renderer.

## Torrent search

The desktop does not query indexers. `torrent:search` in `src/main/ipc-handlers.ts` POSTs to `/v1/torrents/search`. The handler is `registerTorrentRoutes` in `server/src/torrent-routes.ts`.

That route resolves the query, reads the 5-day cache unless `forceRefresh` is set, and on a miss calls `searchTorrentSources` from `src/main/torrent/orchestrator.ts`. The eight providers, dedupe, rate limits, and SQLite cache tables are documented in [`torrent-search.md`](torrent-search.md). The server imports that code; it is not a second implementation. Results are re-sorted with `scoreTorrentSource` before they are returned.

Provider health is persisted in the same SQLite library the server process uses, and exposed at `GET /v1/torrents/providers/health`.

## What stays on the machine

- Streaming and downloads: WebTorrent in the Electron main process.
- Containers the built-in player cannot open (AVI, TS, archives): handoff to `mpv`, with progress over JSON IPC.
- Watch progress, My List, and My Shows: local SQLite, synced to the account when signed in.
- Settings: preferred resolution, download directory (`~/Downloads/Popcorn Bucket` by default), concurrency, rate limits, subtitle language.

## Repository layout

```text
src/
  main/        Electron main: WebTorrent, mpv, SQLite, settings. Torrent providers live here and are called by the API.
  preload/     context-isolated window.api
  renderer/    React 19 UI
  shared/      schemas, release-title parser, ranking
server/        Popcorn API (Hono, PostgreSQL, Drizzle, Better Auth)
website/       download page
docs/          this guide and torrent-search.md
build/         icons, entitlements, NSIS script
```

## Installers

Published from `.github/workflows/release.yml`:

| Platform | Build | Artifact |
| --- | --- | --- |
| macOS | `npm run build:mac -- --arm64` on the release workflow | `popcorn-bucket-<version>.dmg` (Apple Silicon, macOS 13+) |
| Windows | `npm run build:win` | `popcorn-bucket-<version>-setup.exe` (Windows 10/11 x64) |

Linux AppImage, deb, and snap targets exist in `electron-builder.cjs` (`npm run build:linux`) and are not uploaded by that workflow. The site lists whatever `GET /v1/site/downloads` finds on the latest GitHub release.

## Development

Node 22.12+ (CI uses Node 24) and npm 11+. No API keys are required to browse or search against the default API.

```bash
npm install
npm run dev
```

`POPCORN_API_URL` overrides the API origin. See [`.env.example`](../.env.example) for optional TMDB, OMDb, TorrentClaw, and OpenSubtitles keys used when a process calls those services directly.

| Command | What it does |
| --- | --- |
| `npm run dev` | Electron with Vite HMR |
| `npm test` | Vitest plus the SQLite library check |
| `npm run typecheck` | `tsconfig.node.json` and `tsconfig.web.json` |
| `npm run lint` | ESLint |
| `npm run build` | Typecheck and bundle into `out/` |

Before a pull request: `npm run lint && npm run typecheck && npm test`.
