<p align="center">
  <img src="build/icon.png" width="128" alt="Popcorn Bucket" />
</p>

<h1 align="center">Popcorn Bucket</h1>

<p align="center">
  <strong>A desktop home for movies and TV shows — discover, stream, download, and pick up right where you left off.</strong>
</p>

<p align="center">
  <a href="https://github.com/joshmarom/popcorn-bucket/actions/workflows/build.yml"><img src="https://github.com/joshmarom/popcorn-bucket/actions/workflows/build.yml/badge.svg" alt="Build" /></a>
  <a href="https://github.com/joshmarom/popcorn-bucket/actions/workflows/deploy.yml"><img src="https://github.com/joshmarom/popcorn-bucket/actions/workflows/deploy.yml/badge.svg" alt="Deploy API" /></a>
  <a href="https://github.com/joshmarom/popcorn-bucket/releases/latest"><img src="https://img.shields.io/github/v/release/joshmarom/popcorn-bucket" alt="Latest release" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-informational" alt="Platforms: macOS | Windows | Linux" />
</p>

<p align="center">
  <a href="#-highlights">Highlights</a> •
  <a href="#️-installation">Installation</a> •
  <a href="#-usage">Usage</a> •
  <a href="#️-development">Development</a> •
  <a href="#️-architecture">Architecture</a> •
  <a href="#-contributing">Contributing</a>
</p>

---

> *Your media catalog, torrent swarm, and watch progress in one fast, native desktop shell — no browser tabs or manual indexer hunting required.*

## 🌟 Highlights

- **Movies & TV in one shell** — Browse trending catalogs, popular releases, upcoming titles, curated collections, genre rails, and streaming Top 10s (Netflix, Prime Video, Disney+, Apple TV+) with instant cross-catalog autocomplete.
- **Smart multi-indexer torrent aggregation** — The Popcorn API queries 8 providers in parallel (TorrentClaw, TorrentsCSV, Knaben, ThePirateBay, YTS, EZTV, UIndex, LimeTorrents), deduplicates by info-hash, parses release metadata (4K/1080p, HDR, codec, source, season packs), and ranks results by quality and swarm health.
- **Instant streaming & external playback** — Stream sequentially over WebTorrent inside the built-in Vidstack player, or hand off incompatible containers/codecs to `mpv` with bidirectional JSON IPC progress tracking.
- **Automatic subtitles** — Extracts embedded subtitle tracks or automatically fetches matching subtitles from OpenSubtitles in your preferred language.
- **Personal library & cloud sync** — Track *Continue Watching*, *My List* (movies), and *My Shows* locally in SQLite with seamless account synchronization via the Popcorn API.
- **Full download manager** — Configure concurrent download slots, bandwidth rate limits, pause/resume states, and untracked folder recovery from disk.
- **Crafted for desktop** — Built with Electron 44, React 19, and Tailwind CSS v4 featuring smooth view transitions, virtualized poster grids, and native installers for macOS, Windows, and Linux.

---

## ℹ️ Overview

Finding something to watch and playing it cleanly on a desktop shouldn't mean juggling metadata sites, ad-riddled torrent indexers, subtitle portals, and separate media players. **Popcorn Bucket** brings discovery, torrent resolution, streaming playback, and watch history into a single cohesive desktop application.

Catalog browsing and torrent searches work out of the box through the hosted **Popcorn API**, while WebTorrent streaming, disk downloads, and `mpv` playback run locally on your machine. A local SQLite database keeps your watch progress and library responsive offline and syncs with your account when signed in.

### ✍️ Author

Created and maintained by **[Josh Marom](https://github.com/joshmarom)**.

---

## ⬇️ Installation

### End Users (Prebuilt Installers)

Download the latest installer from **[popcorn.josh.co.il](https://popcorn.josh.co.il/)**, or grab the same files from the **[Releases](https://github.com/joshmarom/popcorn-bucket/releases/latest)** page:

| Platform | Artifact | Minimum Requirements |
| :--- | :--- | :--- |
| **macOS** | `popcorn-bucket-<version>.dmg` (Apple Silicon) | macOS 13.0 (Ventura) or newer |
| **Windows** | `popcorn-bucket-<version>-setup.exe` | Windows 10 / 11 (x64) |
| **Linux** | `.AppImage`, `.deb`, or `.snap` | 64-bit Linux distribution |

#### Optional: Install `mpv` for universal codec support

Popcorn Bucket plays MP4, MKV, WebM, and MOV in the built-in player. For containers it cannot open, such as AVI, TS, and archive releases, it hands playback to **[mpv](https://mpv.io/)** and tracks watch progress over IPC. The player window can also hand the current video to mpv:

```bash
# macOS (Homebrew)
brew install mpv

# Ubuntu / Debian
sudo apt install mpv

# Windows (WinGet)
winget install mpv
```

---

## 🚀 Usage

1. **Discover** — Launch Popcorn Bucket to browse Movie and TV discovery rails, filter by streaming service Top 10s, explore collections, or press search for instant autocomplete across movies, shows, and franchises.
2. **Play or Download** — Open any title and press **Play**. The strip attached under the button names the copy that will play (resolution, source, size, and seeders) and opens the full source list, where you can inspect seeders, codecs, and file sizes or pick a different release.
3. **Resume Anywhere** — Playback position is saved every few seconds (both in-app and in external `mpv` windows). Partially watched titles appear automatically in **Library → Continue Watching**.
4. **Tune Preferences** — Visit **Settings** to customize your preferred resolution, download directory (`~/Downloads/Popcorn Bucket` by default), active download concurrency, upload/download speed limits, and default subtitle language (`ISO 639-1`, e.g., `en`).

---

## 🛠️ Development

### Prerequisites

- **Node.js** `22.12+` (Node `24` recommended in CI)
- **npm** `11+`
- Build tools for native addons (`better-sqlite3`) on your platform

### Quick Start

Clone the repository, install dependencies, and start the Electron Vite development server with hot module replacement:

```bash
git clone https://github.com/joshmarom/popcorn-bucket.git
cd popcorn-bucket
npm install
npm run dev
```

> **Note:** No API keys are required to browse the catalog or search torrents in development — the app talks to the default Popcorn API (`https://popcorn.josh.co.il`). You can point it to a custom backend by setting `POPCORN_API_URL`.

### Environment Variables (Optional)

Copy [`.env.example`](.env.example) to `.env` if you want to supply local fallback credentials for direct main-process integrations:

```bash
cp .env.example .env
```

| Variable | Purpose |
| :--- | :--- |
| `POPCORN_API_URL` | Override the backend API origin (defaults to `https://popcorn.josh.co.il`) |
| `TMDB_READ_ACCESS_TOKEN` / `TMDB_API_KEY` | TMDB credentials for direct metadata queries |
| `OMDB_API_KEY` | Enriches missing poster, plot, rating, runtime, and cast metadata from OMDb |
| `TORRENTCLAW_API_KEY` | Unlocks authenticated magnet resolution on TorrentClaw |
| `OPENSUBTITLES_API_KEY` | Fetches external subtitles when a torrent has no embedded tracks |

### Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start the Electron app with Vite HMR for the renderer |
| `npm run start` | Preview the production build locally via `electron-vite preview` |
| `npm run build` | Run TypeScript typechecking (`node` + `web`) and bundle into `out/` |
| `npm test` | Run the Vitest unit test suite and the SQLite library verification check |
| `npm run test:library` | Run the standalone SQLite schema, migration, and cache round-trip check |
| `npm run typecheck` | Typecheck both Electron/Node (`tsconfig.node.json`) and React (`tsconfig.web.json`) |
| `npm run lint` | Lint the codebase with ESLint |
| `npm run format` | Format all files with Prettier |
| `npm run build:mac` | Build and package a macOS `.dmg` into `dist/` |
| `npm run build:win` | Build and package a Windows NSIS `.exe` installer into `dist/` |
| `npm run build:linux` | Build and package Linux `.AppImage`, `.deb`, and `.snap` artifacts into `dist/` |

### Running Tests

The test suite covers release title parsing, release quality ranking, movie scoring, torrent provider scraping, provider health circuit-breakers, playback readiness, and SQLite library migrations:

```bash
npm test
```

---

## 🏗️ Architecture

Popcorn Bucket is organized as a multi-process Electron application paired with a standalone Hono/PostgreSQL backend service in [`server/`](server/).

```text
popcorn-bucket/
├── src/
│   ├── main/          # Electron main process: WebTorrent, mpv IPC, SQLite library, settings, security
│   ├── preload/       # Context-isolated window.api bridge between main and renderer
│   ├── renderer/      # React 19 UI: discovery rails, detail pages, Vidstack player, Zustand stores
│   └── shared/        # Isomorphic schemas, release-title parser, ranking logic, and TypeScript types
├── server/            # Popcorn API: Hono HTTP server, Drizzle ORM (PostgreSQL), Better Auth, catalog harvester
├── docs/              # Deep-dive technical documentation (e.g., docs/torrent-search.md)
├── build/             # Icons, macOS entitlements, and NSIS installer scripts
└── scripts/           # Verification and build helper scripts
```

### Tech Stack

- **Desktop Shell:** Electron 44, `electron-vite`, `electron-builder`, `electron-updater`, `electron-store`
- **Frontend (`src/renderer`):** React 19, React Router v7, Tailwind CSS v4, Radix UI / shadcn/ui, Zustand, TanStack Virtual, Vidstack Player, Lucide Icons
- **Media & Storage (`src/main`):** WebTorrent, `better-sqlite3`, Cheerio, Zod, `mpv` JSON IPC controller
- **Backend (`server/`):** Node.js, Hono, PostgreSQL (`pg`), Drizzle ORM, Better Auth

The desktop asks the Popcorn API for torrent results (`POST /v1/torrents/search`). Streaming, disk downloads, and `mpv` stay on the machine. Maintainer notes live in **[`docs/PROJECT.md`](docs/PROJECT.md)**. For how the API's 8-provider pipeline deduplicates by info-hash, rate-limits hosts, and caches results, see **[`docs/torrent-search.md`](docs/torrent-search.md)**.

---

## 💭 Feedback and Contributing

Found a bug, have a feature request, or want to improve an indexer scraper?

1. Check existing **[Issues](https://github.com/joshmarom/popcorn-bucket/issues)** or open a new one with reproduction steps.
2. Fork the repository and create a feature branch (`git checkout -b feat/amazing-feature`).
3. Ensure typechecks, linter, and tests pass before opening a Pull Request:
   ```bash
   npm run lint && npm run typecheck && npm test
   ```

---

## 🙏 Credits & Attribution

- Movie and TV metadata is powered by **[TMDB](https://www.themoviedb.org/)** and **[OMDb](https://www.omdbapi.com/)**. *This product uses the TMDB API but is not endorsed or certified by TMDB.*
- Subtitle lookups are powered by **[OpenSubtitles](https://www.opensubtitles.com/)**.
- Streaming playback is built on **[WebTorrent](https://webtorrent.io/)**, **[Vidstack](https://vidstack.io/)**, and **[mpv](https://mpv.io/)**.
