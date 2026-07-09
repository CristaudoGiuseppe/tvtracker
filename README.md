# TVTracker

**A self-hosted TV & movie tracker you actually own.** Built as a personal replacement for [TV Time](https://en.wikipedia.org/wiki/TV_Time) when the service shut down in July 2026 — including a lossless importer for the official TV Time GDPR export (validated against a real 8-year account: ~14,000 episode check-ins across 350+ shows).

Runs entirely on your own machine in Docker. Your entire library lives in one SQLite file on a mounted volume — backup is copying a folder. The only external dependency is [TMDB](https://www.themoviedb.org/) for metadata, posters, and search (free personal API key).

> 🇮🇹 UI in italiano · [Guida rapida in italiano](#guida-rapida-italiano)
> 🤖 Working on this repo with an AI coding agent? Start with [AGENTS.md](AGENTS.md).

## Features

- **Watch Next** — one card per in-progress show with its next unwatched episode and a one-tap check-in that advances in place
- **Show & movie detail** — season-by-season episode checklists, bulk "mark season/series watched", rewatch tracking, 1–10 ratings, favorites, a season chip grid for at-a-glance progress across every season
- **My Shows** — library grouped TV Time-style: Watching · Da iniziare · Up to date · For later · Finished · Stopped, with filters/sort and a persistent saved view
- **Movies** — watchlist and watched tabs
- **Upcoming** — air-date calendar for your followed shows, with season-premiere badges (metadata auto-refreshes daily)
- **Explore** — TMDB trending rails + debounced full search, add anything in one tap — including add-with-intent (start watching now, or save for later) straight from Explore or the detail page
- **Dove guardarla** — watch providers with platform logos (JustWatch data via TMDB)
- **Stats** — total time watched, top shows, top genres, 24-month activity chart, streaks
- **TV Time import** — upload the GDPR ZIP, preview before committing, manual search-and-match for anything TMDB can't resolve automatically, idempotent re-runs (never duplicates), and nothing is ever silently dropped
- **Data freedom** — one-click JSON export of everything; the SQLite file is yours

## Quick start

Prerequisites: Docker (Desktop or Engine+Compose) and a free [TMDB API key](https://www.themoviedb.org/settings/api) (v3 key + v4 Read Access Token).

```bash
cp .env.example .env      # then set TMDB_API_KEY and TMDB_READ_TOKEN
docker compose up -d --build
open http://localhost:3100
```

Then go to **Settings → Import** to bring in a TV Time export, or **Explore** to start from scratch.

Notes:

- Set `TVTRACKER_PORT` in `.env` to publish on a different host port (container always listens on 3000 internally; default host port is 3100).
- Leave `DATA_DIR=./data` in `.env` — it only affects `npm run dev`. In Docker, `docker-compose.yml` pins `DATA_DIR=/data` regardless.

## Where your data lives

The SQLite database is written to `./data/tvtracker.db` on your host (bind-mounted at `/data` in the container). That directory **is** your library — it survives container restarts, rebuilds, and reinstalls. As long as `./data` exists, your data is safe.

### Backup

```bash
docker compose stop
cp -r data data-backup-$(date +%Y%m%d)
docker compose start
```

(SQLite runs in WAL mode, so even a live copy is low-risk — stopping first is just the safest option.)

### Restore

```bash
docker compose down
rm -rf data && cp -r data-backup-YYYYMMDD data
docker compose up -d
```

### Update

```bash
git pull && docker compose build && docker compose up -d
```

`./data` is untouched by rebuilds; schema migrations run automatically at startup.

### Uninstall

`docker compose down` stops and removes the container. Delete `./data` only if you want to permanently erase your library.

## Importing from TV Time

1. Get your GDPR export ZIP (while the service existed: `gdpr.tvtime.com/gdpr/self-service`).
2. **Settings → Import**: drop the ZIP.
3. Review the **preview**: how many shows, episodes, movies, and watchlist entries were recognized, plus a list of anything unmatched.
4. Fix unmatched titles inline (search TMDB, pick the right one, "Ri-analizza") — or import now and fix later; unmatched items are reported, never dropped.
5. Confirm. Original watch timestamps are preserved. Re-importing the same ZIP is safe (duplicates are skipped).

Import details, for the curious: shows are matched exactly via their TVDB IDs through TMDB's `/find` endpoint; movies (name-only in the export) are matched by title + release year; rewatches are preserved with their own check-in rows.

## Architecture

One Next.js 15 (App Router) app serves both the UI and the API. All domain logic lives in plain, unit-tested TypeScript modules over SQLite. No external services except TMDB.

```
src/
├── db/            # Drizzle schema + getDb() (better-sqlite3, WAL, auto-migrations)
├── lib/
│   ├── tmdb.ts    # the ONLY module that talks to TMDB (throttle ≤40req/10s, cache, retry, it-IT fallback)
│   ├── library.ts # the ONLY module that mutates user data (check-ins, statuses, ratings)
│   ├── watch-next.ts, stats.ts, sync.ts   # read-side computation
│   └── importer/  # parse.ts (CSV/ZIP) → match.ts (TVDB→TMDB) → run.ts (dry-run + idempotent import)
├── app/           # screens (server components) + thin /api routes (validation + delegation only)
└── components/    # design system (ui.tsx) + screen components
```

- **Stack:** Next.js 15 · TypeScript · Tailwind CSS 4 · Drizzle ORM + better-sqlite3 · Vitest (195 tests)
- **Design:** dark cinematic theme, posters-as-interface, optimistic UI with revert-on-failure
- **Single user, no auth** — it's yours, on localhost

## Local development (no Docker)

```bash
npm install
npm run dev        # http://localhost:3000, uses .env (DATA_DIR=./data)
npx vitest run     # full test suite
npx tsx scripts/seed-dev.ts   # seed a show for a non-empty dev UI
```

Requires Node.js 22+.

## Permissions note

The container runs as the non-root `node` user (uid 1000). Docker Desktop (macOS/Windows) maps bind-mount permissions loosely, so it works out of the box. On native Linux, if `./data` writes fail: `sudo chown -R 1000:1000 ./data` once.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. TVTracker clones TV Time's *functionality*, not its assets — all artwork and branding here are original.

---

## Guida rapida (italiano)

1. Copia `.env.example` in `.env` e inserisci le tue chiavi TMDB (`TMDB_API_KEY`, `TMDB_READ_TOKEN`). Lascia `DATA_DIR=./data` invariato.
2. Avvia: `docker compose up -d --build`
3. Apri [http://localhost:3100](http://localhost:3100) (imposta `TVTRACKER_PORT` in `.env` per cambiare porta).
4. **Impostazioni → Importa** per l'export di TV Time, oppure **Esplora** per aggiungere serie e film.

**Backup**: copia la cartella `data` (è tutta la tua libreria). **Ripristino**: sostituisci `data` con il backup e riavvia. **Aggiornamento**: `git pull && docker compose build && docker compose up -d`. **Sviluppo**: `npm install && npm run dev`.
