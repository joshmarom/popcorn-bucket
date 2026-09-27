# Popcorn Bucket

Electron + React app for browsing movie metadata from [The Movie Database (TMDB)](https://www.themoviedb.org/). Stage 1 focuses on search and detail views (no playback).

## Prerequisites

- Node.js **20.19+** or **22.12+** (required by electron-vite)
- A TMDB account and API credentials from [Settings → API](https://www.themoviedb.org/settings/api)

## Quick start

```bash
npm install
npm run dev
```

## Connect your TMDB credentials

1. Run the app (`npm run dev`).
2. Open **Settings**.
3. Paste your **API Read Access Token** (recommended; used as `Authorization: Bearer …` on v3 endpoints) and/or your **API Key (v3)** (used as the `api_key` query parameter when no token is set).
4. Click **Save**.

Credentials are stored locally via `electron-store` (not committed to git).

Optional: copy `.env.example` to `.env` and set `TMDB_READ_ACCESS_TOKEN` and/or `TMDB_API_KEY`. These environment variables are used **only when** the matching Settings field is empty.

If you add an **OMDb** API key (Settings or `OMDB_API_KEY`), the main process uses it when TMDB is missing something OMDb can supply (for example poster, overview/plot, release year or date, runtime, IMDb-style score, genres, or principal cast). It resolves the title’s IMDb id, calls OMDb with `plot=short` on list rows and `plot=full` on the detail page when enrichment runs. Requests are throttled and cached under the app user data directory.

## Scripts

| Command             | Description                    |
| ------------------- | ------------------------------ |
| `npm run dev`       | Dev mode (Vite + Electron)     |
| `npm run build`     | Typecheck + production bundles |
| `npm run typecheck` | TypeScript only                |
| `npm run lint`      | ESLint                         |

## UI (shadcn/ui)

The renderer uses [Tailwind CSS v4](https://tailwindcss.com/) with [`@tailwindcss/vite`](https://tailwindcss.com/docs/installation/using-vite) and [shadcn/ui](https://ui.shadcn.com/) (New York style, Radix primitives). Global styles live in [`src/renderer/src/globals.css`](src/renderer/src/globals.css); the document defaults to the `.dark` theme in [`src/renderer/index.html`](src/renderer/index.html).

## Navigation (React Router)

The renderer uses [React Router](https://reactrouter.com/) with a [**hash router**](https://reactrouter.com/en/main/router-components/hash-router) so URLs work when the app is loaded from the `file://` protocol in production builds. Routes:

| Path          | Screen                                  |
| ------------- | --------------------------------------- |
| `#/`          | Home: **In theaters now** + search      |
| `#/movie/:id` | Movie detail                            |
| `#/settings`  | TMDB credentials (header **gear** icon) |

Search text is kept in the query string as `#/?q=…` (see [`HomePage`](src/renderer/src/pages/home-page.tsx) and `useSearchParams`).

Add more primitives from the repository root (paths resolve via root [`tsconfig.json`](tsconfig.json)):

```bash
npx shadcn@latest add dialog --yes
```

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. See [TMDB API terms](https://www.themoviedb.org/documentation/api/terms-of-use).

## Roadmap

TV catalog, watchlists, optional providers (OMDb, Trakt), and playback/sources are planned for later stages.
