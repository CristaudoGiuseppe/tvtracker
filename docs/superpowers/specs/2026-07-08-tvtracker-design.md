# TVTracker — Personal TV Time Clone — Design Spec

**Date:** 2026-07-08
**Status:** Awaiting user review
**Context:** TV Time shuts down permanently on 2026-07-15. This app replaces it as a single-user, self-hosted tracker running on the user's Mac, importing the user's TV Time GDPR export.

## Goals

- Replicate the TV Time features the user actually uses: episode/movie tracking, watch-next queue, upcoming calendar, library management, discover/search, and personal stats.
- Import the user's TV Time GDPR export (watch history, followed shows, ratings) with original timestamps.
- Run entirely locally in Docker with permanent storage; zero cloud dependencies except TMDB metadata.

## Non-goals

- Social features (comments, friends, polls, community reactions) — meaningless single-user.
- Multi-user accounts / authentication (localhost, single user).
- TV Time branding or artwork — functionality and layout are cloned, assets are original.

## Architecture

- **Framework:** Next.js (App Router) + TypeScript + Tailwind CSS. One app serves UI and API routes.
- **Database:** SQLite via Drizzle ORM + better-sqlite3. Single file at `/data/tvtracker.db`.
- **Packaging:** Multi-stage Dockerfile + `docker-compose.yml`. Volume mount `./data:/data` gives permanent memory; backup = copy the folder. App at `http://localhost:3000`, reachable from LAN devices.
- **Metadata:** TMDB API (user's personal read-access token in `.env`, never committed). Italian localization (`it-IT`) with English fallback. Posters/stills hot-linked from TMDB CDN with attribution in the footer (TMDB terms).
- **Dev mode:** `npm run dev` works outside Docker with the same `./data` directory.

## Data model (SQLite tables)

Cached metadata (owned by TMDB sync):
- `shows` — tmdb_id (PK), tvdb_id, name, overview, poster_path, backdrop_path, status (airing/ended/…), genres, episode_run_time, last_synced_at.
- `seasons` — show_id, season_number, name, poster_path, episode_count.
- `episodes` — id (tmdb), show_id, season_number, episode_number, name, overview, still_path, air_date, runtime.
- `movies` — tmdb_id (PK), title, overview, poster_path, genres, runtime, release_date, last_synced_at.

User data (source of truth, never overwritten by sync):
- `library_shows` — show_id, status enum: `watching | up_to_date | finished | stopped | for_later`, is_favorite, added_at, archived.
- `library_movies` — movie_id, state enum: `watchlist | watched`, added_at.
- `watches` — id, kind (`episode | movie`), episode_id/movie_id, watched_at, rewatch_index (0 = first watch). Multiple rows per episode = rewatches.
- `ratings` — kind (`show | episode | movie`), target_id, rating (1–10), rated_at.
- `settings` — key/value (TMDB language, import history, etc.).

Derived (computed, not stored): per-show progress, "up to date" detection, watch-next episode, all stats.

## Screens

1. **Watch Next (home)** — one card per in-progress show: poster, next unwatched episode (S/E, title), one-tap check-in. Ordered by recency of last watch. Empty state prompts Explore.
2. **Upcoming** — chronological calendar of future air dates for followed shows; badges for season premieres.
3. **My Shows** — library grouped by the five statuses; drag or menu to change status; favorites pinned.
4. **Movies** — two tabs: Watchlist and Watched; one-tap mark watched.
5. **Explore** — TMDB trending/popular shows + movies, and debounced full search; add-to-library from cards.
6. **Show detail** — header with backdrop/metadata/rating; season tabs; episode checklist with per-episode check-in (custom date optional), mark-season and mark-series watched; movie detail analogous.
7. **Stats** — total time watched (episode runtimes), episodes/movies seen, shows completed, top genres, most-watched shows, per-month activity chart, streaks.

## TMDB sync

- On adding a show: fetch full show + all seasons/episodes, store.
- Daily refresh (on-demand check on app load, throttled to once/24h) for non-ended followed shows: updates air dates and newly announced episodes → powers Upcoming and new-episode badges.
- All TMDB calls go through one client module with: request throttling, response caching, and graceful degradation (stale data shown if TMDB is unreachable; UI never blocks).

## TV Time importer

Settings → Import: upload the GDPR export ZIP.

- **Parsing** (verified against the user's real export, 13,999 episode watches / 342 shows / 327 movie rows, on 2026-07-08):
  - `tracking-prod-records-v2.csv` — primary episode source. `s_id` (TVDB series id), `ep_id` (TVDB episode id), `series_name`, `season_number`, `episode_number`, `created_at` (watch timestamp). Keys prefixed `rewatch-episode-…` mark rewatches. Rows with empty episode fields = show-level follow state (`is_followed`, `is_for_later`, `is_archived`).
  - `tracking-prod-records.csv` (legacy) — **movie source**: `type=watch|follow|towatch` rows with `entity_type=movie`, `movie_name`, `release_date`, `runtime`, `watch_date`, `rewatch_count`. `towatch` = watchlist.
  - `followed_tv_show.csv` — supplements follow state and archived flag.
  - `ratings-3-prod-episode_votes.csv` / `ratings-v2-prod-votes.csv` — episode and movie votes; the vote value is encoded in `vote_key` and must be decoded during implementation (TV Time used emotion-style votes, not plain 1–10; import as best-effort and skip cleanly if undecodable).
- **Matching:** TVDB id → TMDB via `/find/{tvdb_id}?external_source=tvdb_id` (exact). Movies matched by TMDB search on `movie_name` + `release_date` year from the legacy file.
- **Flow:** parse → resolve → **dry-run preview** (n shows, n episodes, n unmatched) → user confirms → import. Original `created_at` timestamps preserved as `watched_at`.
- **Unmatched handling:** listed in a report with a manual search-and-match UI; never silently dropped.
- **Idempotent:** re-running the same ZIP creates no duplicates (natural keys: tvdb id + season + episode + timestamp).

The user's first export (account `hiimbepps@gmail.com`, 2 follows, 0 watches) is kept at `import/` as a test fixture. The real export from the user's main account is pending (deadline 2026-07-15).

## Error handling

- TMDB rate limit / network failure: retry with backoff, then serve cached data with a subtle "metadata stale" indicator.
- Import errors: per-row error collection, import continues, full report at the end. ZIP-level failures (wrong file, missing CSVs) produce a clear message naming what was expected.
- DB schema changes: Drizzle migrations run automatically on container start.

## Testing & verification

- **Importer:** unit tests against the real fixture CSVs + synthetic large fixtures (rewatches, unmatched shows, movies, weird names).
- **Core logic:** unit tests for watch-next computation, up-to-date detection, stats math.
- **End-to-end verification:** `docker compose up`, import real export, spot-check counts against `user_statistics.csv` totals from the export, click through all seven screens.

## Milestones

1. Scaffold + Docker + DB schema + TMDB client.
2. Library + show detail + check-ins (core tracking).
3. Importer (built/tested against real export).
4. Watch Next + Upcoming + My Shows/Movies screens.
5. Explore + Stats.
6. Polish pass + final end-to-end verification.
