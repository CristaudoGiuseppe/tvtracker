# TVTracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-user, self-hosted TV Time clone (episode/movie tracking, watch-next, upcoming calendar, explore, stats) in Docker with SQLite persistence, importing the user's real TV Time GDPR export.

**Architecture:** One Next.js (App Router) app serves UI and API route handlers. Domain logic lives in `src/lib/*` as pure, unit-tested modules over a Drizzle/better-sqlite3 database at `DATA_DIR/tvtracker.db`. TMDB is the only external service, wrapped in one throttled client module. The importer is a parse → match → dry-run → commit pipeline tested against the real export fixtures in `import/`.

**Tech Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Drizzle ORM + better-sqlite3 · Vitest · adm-zip · csv-parse · Docker/compose.

## Global Constraints

- UI directive (from spec): **user-first and as beautiful as possible** — visual quality is a first-class requirement. Screen tasks MUST load the `frontend-design` skill before writing UI code and follow the design language defined in Task 8.
- Single user, no auth. App must work fully offline except TMDB calls; TMDB failures must never block the UI (serve cached data).
- All user data mutations go through `src/lib/library.ts` / `src/lib/importer/*` — route handlers contain no business logic.
- `DATA_DIR` env var (default `./data`) holds the SQLite db. `.env` holds `TMDB_READ_TOKEN` (already present, verified). Never commit `.env`, `data/`, `import/`.
- TMDB locale: `it-IT` with English fallback; TMDB attribution in the app footer.
- Timestamps stored as UTC ISO-8601 strings (`YYYY-MM-DD HH:MM:SS` accepted from import verbatim).
- Test runner: `npx vitest run` (all), commits after every green task. Repo: `/Users/criss/Documents/PROGETTI/tvtracker`.
- Test fixtures: real export at `import/extracted-main/` (13,999 episode watches, 342 shows, 327 movie rows) and tiny fixture at `import/extracted/`. Tests must copy the handful of rows they need into `tests/fixtures/` (committed) rather than reading `import/` (git-ignored).

## File Structure

```
tvtracker/
├── package.json / tsconfig.json / next.config.ts / postcss.config.mjs / drizzle.config.ts / vitest.config.ts
├── Dockerfile / docker-compose.yml / .env.example
├── src/
│   ├── db/schema.ts          # Drizzle tables (single source of schema truth)
│   ├── db/index.ts           # getDb() singleton, runs migrations, honors DATA_DIR
│   ├── lib/tmdb.ts           # TMDB client: throttle, cache, it-IT fallback
│   ├── lib/library.ts        # domain ops: add/status/check-in/uncheck/rate
│   ├── lib/watch-next.ts     # next-episode + up-to-date computation
│   ├── lib/stats.ts          # stats aggregation
│   ├── lib/sync.ts           # daily refresh of non-ended followed shows
│   ├── lib/importer/parse.ts # CSV/ZIP → ParsedExport
│   ├── lib/importer/match.ts # ParsedExport → matched TMDB ids + unmatched
│   ├── lib/importer/run.ts   # dry-run report + idempotent commit
│   ├── app/                  # routes: / /upcoming /shows /movies /explore /show/[id] /movie/[id] /stats /settings
│   ├── app/api/…             # thin route handlers over lib/
│   └── components/           # ui primitives + feature components
└── tests/                    # vitest unit tests + fixtures/
```

---

### Task 1: Scaffold, database schema, migrations

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx` (placeholder), `drizzle.config.ts`, `vitest.config.ts`, `.env.example`
- Create: `src/db/schema.ts`, `src/db/index.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces: `getDb(): BetterSQLite3Database<typeof schema>` from `src/db/index.ts` — opens `${process.env.DATA_DIR ?? './data'}/tvtracker.db` (or `:memory:` when `DATA_DIR=':memory:'`), runs migrations idempotently, caches the instance. Exports all tables from `src/db/schema.ts`.

- [ ] **Step 1: Scaffold Next.js**

Run: `cd /Users/criss/Documents/PROGETTI/tvtracker && npx create-next-app@latest . --ts --tailwind --app --src-dir --no-eslint --use-npm --yes` (accept overwrite of existing dir contents is NOT needed — create-next-app refuses non-empty dirs; scaffold in `/tmp` and move files in, preserving `.git`, `docs/`, `import/`, `.env`, `.gitignore` entries). Then `npm i drizzle-orm better-sqlite3 adm-zip csv-parse && npm i -D drizzle-kit vitest @types/better-sqlite3 @types/adm-zip`.

- [ ] **Step 2: Write failing db test**

```ts
// tests/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../src/db';
import { shows, libraryShows, watches } from '../src/db/schema';

describe('db', () => {
  beforeEach(() => resetDbForTests());
  it('creates schema and accepts a show + follow + watch', () => {
    const db = getDb();
    db.insert(shows).values({ tmdbId: 1396, tvdbId: 81189, name: 'Breaking Bad', episodeRunTime: 47 }).run();
    db.insert(libraryShows).values({ showId: 1396, status: 'watching', addedAt: '2020-01-01 00:00:00' }).run();
    db.insert(watches).values({ kind: 'episode', episodeId: 62085, showId: 1396, watchedAt: '2020-01-02 21:00:00', rewatchIndex: 0 }).run();
    expect(db.select().from(watches).all()).toHaveLength(1);
  });
});
```

`resetDbForTests()` sets `DATA_DIR=':memory:'` and clears the singleton.

- [ ] **Step 3: Run test, expect FAIL** — `npx vitest run tests/db.test.ts` → module not found.

- [ ] **Step 4: Implement schema**

```ts
// src/db/schema.ts
import { sqliteTable, integer, text, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const shows = sqliteTable('shows', {
  tmdbId: integer('tmdb_id').primaryKey(),
  tvdbId: integer('tvdb_id'),
  name: text('name').notNull(),
  overview: text('overview'),
  posterPath: text('poster_path'),
  backdropPath: text('backdrop_path'),
  status: text('status'),                      // 'Returning Series' | 'Ended' | 'Canceled' | …(TMDB verbatim)
  genres: text('genres'),                      // JSON string[]
  episodeRunTime: integer('episode_run_time'), // minutes, fallback 40
  lastSyncedAt: text('last_synced_at'),
});

export const seasons = sqliteTable('seasons', {
  showId: integer('show_id').notNull().references(() => shows.tmdbId),
  seasonNumber: integer('season_number').notNull(),
  name: text('name'),
  posterPath: text('poster_path'),
  episodeCount: integer('episode_count'),
  airDate: text('air_date'),
}, t => [primaryKey({ columns: [t.showId, t.seasonNumber] })]);

export const episodes = sqliteTable('episodes', {
  tmdbId: integer('tmdb_id').primaryKey(),
  showId: integer('show_id').notNull().references(() => shows.tmdbId),
  seasonNumber: integer('season_number').notNull(),
  episodeNumber: integer('episode_number').notNull(),
  name: text('name'),
  overview: text('overview'),
  stillPath: text('still_path'),
  airDate: text('air_date'),                   // 'YYYY-MM-DD' or null
  runtime: integer('runtime'),                 // minutes or null
}, t => [uniqueIndex('ep_show_se').on(t.showId, t.seasonNumber, t.episodeNumber)]);

export const movies = sqliteTable('movies', {
  tmdbId: integer('tmdb_id').primaryKey(),
  title: text('title').notNull(),
  overview: text('overview'),
  posterPath: text('poster_path'),
  backdropPath: text('backdrop_path'),
  genres: text('genres'),
  runtime: integer('runtime'),                 // minutes
  releaseDate: text('release_date'),
  lastSyncedAt: text('last_synced_at'),
});

export const libraryShows = sqliteTable('library_shows', {
  showId: integer('show_id').primaryKey().references(() => shows.tmdbId),
  status: text('status').notNull(),            // 'watching' | 'finished' | 'stopped' | 'for_later'
  isFavorite: integer('is_favorite').notNull().default(0),
  archived: integer('archived').notNull().default(0),
  addedAt: text('added_at').notNull(),
});

export const libraryMovies = sqliteTable('library_movies', {
  movieId: integer('movie_id').primaryKey().references(() => movies.tmdbId),
  state: text('state').notNull(),              // 'watchlist' | 'watched'
  addedAt: text('added_at').notNull(),
});

export const watches = sqliteTable('watches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(),                // 'episode' | 'movie'
  episodeId: integer('episode_id'),            // tmdb episode id (kind=episode)
  showId: integer('show_id'),                  // denormalized for fast per-show queries
  movieId: integer('movie_id'),                // tmdb movie id (kind=movie)
  watchedAt: text('watched_at').notNull(),
  rewatchIndex: integer('rewatch_index').notNull().default(0),
}, t => [
  uniqueIndex('watch_unique').on(t.kind, t.episodeId, t.movieId, t.rewatchIndex),
  index('watch_show').on(t.showId),
]);

export const ratings = sqliteTable('ratings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(),                // 'show' | 'episode' | 'movie'
  targetId: integer('target_id').notNull(),
  rating: integer('rating').notNull(),         // 1-10
  ratedAt: text('rated_at').notNull(),
}, t => [uniqueIndex('rating_unique').on(t.kind, t.targetId)]);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
```

```ts
// src/db/index.ts
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from './schema';

let instance: BetterSQLite3Database<typeof schema> | null = null;

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (instance) return instance;
  const dataDir = process.env.DATA_DIR ?? './data';
  let sqlite: Database.Database;
  if (dataDir === ':memory:') sqlite = new Database(':memory:');
  else { mkdirSync(dataDir, { recursive: true }); sqlite = new Database(join(dataDir, 'tvtracker.db')); }
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  instance = drizzle(sqlite, { schema });
  migrate(sqlite);
  return instance;
}

export function resetDbForTests(): void { process.env.DATA_DIR = ':memory:'; instance = null; }

function migrate(sqlite: Database.Database): void {
  // Generated SQL checked in via drizzle-kit; executed idempotently.
  // Run `npx drizzle-kit generate` after any schema.ts change and re-export
  // the statements from src/db/migrations.ts (string[] of CREATE ... IF NOT EXISTS).
  for (const stmt of require('./migrations').statements) sqlite.exec(stmt);
}
```

Use `npx drizzle-kit generate` output converted to `IF NOT EXISTS` form in `src/db/migrations.ts` (a `statements: string[]` export). Keep it dead simple — no migration framework runtime.

- [ ] **Step 5: Run test, expect PASS** — `npx vitest run tests/db.test.ts`
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: scaffold app + sqlite schema"`

---

### Task 2: TMDB client

**Files:**
- Create: `src/lib/tmdb.ts`
- Test: `tests/tmdb.test.ts`

**Interfaces:**
- Produces (all return parsed JSON, throw `TmdbError` on non-retryable failure):
  - `tmdbGet(path: string, params?: Record<string,string>): Promise<any>` — core fetch: bearer `TMDB_READ_TOKEN`, base `https://api.themoviedb.org/3`, default `language=it-IT`, throttled ≤ 40 req/10s, in-memory TTL cache (10 min), 3 retries with backoff on 429/5xx.
  - `findByTvdbId(tvdbId: number): Promise<{ tvId: number|null }>` — `/find/{id}?external_source=tvdb_id`, first `tv_results[0]?.id`.
  - `getShowFull(tmdbId: number): Promise<TmdbShowFull>` — `/tv/{id}` plus every season's episodes via `/tv/{id}/season/{n}` (sequential, cached). Falls back to `language=en-US` for empty `overview`.
  - `getMovie(tmdbId: number): Promise<TmdbMovie>` — `/movie/{id}`.
  - `searchShows(query: string): Promise<TmdbSearchResult[]>`, `searchMovies(query: string, year?: number): Promise<TmdbSearchResult[]>`
  - `trendingShows(): Promise<TmdbSearchResult[]>`, `trendingMovies(): Promise<TmdbSearchResult[]>` — `/trending/{tv|movie}/week`.
  - Types exported: `TmdbShowFull { id, name, overview, poster_path, backdrop_path, status, genres: {name}[], episode_run_time: number[], seasons: { season_number, name, poster_path, episode_count, air_date, episodes: { id, season_number, episode_number, name, overview, still_path, air_date, runtime }[] }[] }`, `TmdbMovie`, `TmdbSearchResult { id, kind: 'tv'|'movie', name, poster_path, first_air_date? , release_date?, vote_average, overview }`.

- [ ] **Step 1: Write failing tests** — mock `globalThis.fetch` with `vi.stubGlobal`; cases: (a) bearer header + language param sent; (b) 429 then 200 → retried result; (c) same URL twice → one fetch (cache); (d) `findByTvdbId` returns `tv_results[0].id`; (e) `getShowFull` merges season episodes; (f) empty `overview` triggers en-US refetch.
- [ ] **Step 2: Run, expect FAIL** — `npx vitest run tests/tmdb.test.ts`
- [ ] **Step 3: Implement `src/lib/tmdb.ts`** — token-bucket throttle (simple timestamp queue), `Map`-based TTL cache keyed by full URL, retry loop with `await new Promise(r => setTimeout(r, 500 * 2**attempt))`.
- [ ] **Step 4: Run, expect PASS.** Also run the live smoke script once: `npx tsx scripts/tmdb-smoke.ts` (create it: calls `findByTvdbId(81189)` → Breaking Bad tmdb 1396, prints name) to validate the real token.
- [ ] **Step 5: Commit** — `git commit -am "feat: tmdb client with throttle, cache, fallback"`

---

### Task 3: Library domain operations

**Files:**
- Create: `src/lib/library.ts`
- Test: `tests/library.test.ts` (mock `src/lib/tmdb` with `vi.mock`)

**Interfaces:**
- Consumes: `getDb()`, `getShowFull`, `getMovie`.
- Produces:
  - `addShow(tmdbId: number, status?: LibStatus): Promise<void>` — fetches `getShowFull`, upserts `shows`/`seasons`/`episodes`, inserts `library_shows` (default `'watching'`). Idempotent.
  - `setShowStatus(tmdbId: number, status: LibStatus): void`, `toggleFavorite(tmdbId: number): void`, `removeShow(tmdbId: number): void` (deletes library row + watches, keeps cached metadata)
  - `checkInEpisode(episodeTmdbId: number, watchedAt?: string): void` — inserts watch; if already watched, increments `rewatchIndex` (new row).
  - `uncheckEpisode(episodeTmdbId: number): void` — removes the highest-rewatchIndex row.
  - `markSeasonWatched(showId: number, seasonNumber: number): void`, `markShowWatched(showId: number): void` — bulk check-in of aired, unwatched episodes; sets status `finished` for markShowWatched.
  - `addMovie(tmdbId: number, state: 'watchlist'|'watched', watchedAt?: string): Promise<void>`, `setMovieState(...)`, `checkInMovie(tmdbId, watchedAt?)`
  - `rate(kind: 'show'|'episode'|'movie', targetId: number, rating: 1..10): void` (upsert)
  - `type LibStatus = 'watching'|'finished'|'stopped'|'for_later'`
  - `nowUtc(): string` helper — single place producing `YYYY-MM-DD HH:MM:SS`.

- [ ] **Step 1: Write failing tests** — in-memory db; mocked tmdb returns a 2-season fixture show (one future-dated episode). Cases: addShow caches all episodes; double addShow is idempotent; checkIn twice → rewatchIndex 1; uncheck removes rewatch first; markSeasonWatched skips unaired + already-watched; markShowWatched sets status finished; rate upserts.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Bulk inserts inside `db.transaction`. "Aired" = `airDate !== null && airDate <= today (UTC date string)`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat: library domain ops"`

---

### Task 4: Watch-next & progress computation

**Files:**
- Create: `src/lib/watch-next.ts`
- Test: `tests/watch-next.test.ts`

**Interfaces:**
- Consumes: `getDb()`.
- Produces:
  - `getShowProgress(showId: number): { airedCount: number; watchedCount: number; nextEpisode: EpisodeRow | null; upToDate: boolean }` — next = lowest `(seasonNumber, episodeNumber)` aired-and-unwatched, **excluding season 0**; `upToDate = airedCount>0 && watchedCount>=airedCount` (season 0 excluded from both counts; distinct episodes, rewatches count once).
  - `getWatchNextList(): { show: ShowRow; lib: LibraryShowRow; next: EpisodeRow; lastWatchedAt: string|null }[]` — shows with status `'watching'`, not archived, having a next episode; ordered by `lastWatchedAt` desc nulls-last.
  - `getUpcoming(daysAhead=90): { show: ShowRow; episode: EpisodeRow; isSeasonPremiere: boolean }[]` — future-aired episodes of non-archived library shows, ordered by airDate; `isSeasonPremiere = episodeNumber===1`.
  - `getLibraryGrouped(): Record<'watching'|'up_to_date'|'for_later'|'finished'|'stopped', Array<{show, lib, progress}>>` — display grouping: stored `watching` splits into `watching`/`up_to_date` via `upToDate`.

- [ ] **Step 1: Write failing tests** — seed shows/episodes/watches directly. Cases: next skips specials and unaired; rewatches don't inflate watchedCount; up_to_date grouping; upcoming ordering + premiere flag; watch-next ordering by recency.
- [ ] **Step 2: FAIL → Step 3: implement (plain Drizzle queries + in-memory grouping; no SQL cleverness) → Step 4: PASS → Step 5: Commit** `git commit -am "feat: watch-next, progress, upcoming"`

---

### Task 5: Stats

**Files:**
- Create: `src/lib/stats.ts`
- Test: `tests/stats.test.ts`

**Interfaces:**
- Produces: `getStats(): Stats` where

```ts
type Stats = {
  totalMinutes: number;            // Σ episode watches × (episode.runtime ?? show.episodeRunTime ?? 40) + Σ movie watches × movie.runtime; rewatches count
  episodesWatched: number;         // watch rows kind=episode
  moviesWatched: number;
  showsFinished: number;           // library status finished
  topShows: { show: ShowRow; minutes: number; episodes: number }[];   // top 10 by minutes
  topGenres: { genre: string; count: number }[];                      // from watched shows'/movies' genres, top 8
  byMonth: { month: string; episodes: number; movies: number }[];     // 'YYYY-MM', last 24 months, gaps filled with zeros
  firstWatchAt: string | null;
  streakDays: number;              // longest run of consecutive days with ≥1 watch
}
```

- [ ] **Step 1: failing tests** (runtime fallback chain; rewatch counted; month gap-fill; streak across month boundary) → **Step 2: FAIL** → **Step 3: implement** → **Step 4: PASS** → **Step 5: Commit** `git commit -am "feat: stats"`

---

### Task 6: TV Time importer (parse → match → run)

**Files:**
- Create: `src/lib/importer/parse.ts`, `src/lib/importer/match.ts`, `src/lib/importer/run.ts`
- Create: `tests/fixtures/tvtime/` — copy ~30 representative real rows per CSV (incl. a rewatch row, a movie watch, a towatch row, a follow row) from `import/extracted-main/` + the full tiny-account files from `import/extracted/`
- Test: `tests/importer-parse.test.ts`, `tests/importer-match.test.ts`, `tests/importer-run.test.ts`

**Interfaces:**
- `parseExport(zipOrDir: string): ParsedExport` where

```ts
type ParsedExport = {
  episodeWatches: { tvdbSeriesId: number; seriesName: string; season: number; episode: number; watchedAt: string; isRewatch: boolean }[];
  showFollows:    { tvdbSeriesId: number; seriesName: string; isForLater: boolean; isArchived: boolean; followedAt: string }[];
  movieWatches:   { movieName: string; releaseYear: number|null; runtimeMin: number|null; watchedAt: string; rewatchCount: number }[];
  movieWatchlist: { movieName: string; releaseYear: number|null; addedAt: string }[];
  warnings: string[];   // per-row parse problems; never throw on a bad row
}
```

  Sources: `tracking-prod-records-v2.csv` (episode rows = non-empty `episode_number`; rewatch = `key` starts with `'rewatch'`; follow rows = empty episode fields → `is_followed/is_for_later/is_archived`), `tracking-prod-records.csv` (`entity_type==='movie'`: `type==='watch'` → movieWatches (`watch_date` else `created_at`; `runtime` is **seconds** → minutes; `rewatch_count`), `type==='towatch'` → watchlist), `followed_tv_show.csv` (merge `archived`). Dedup follows by tvdbSeriesId (v2 wins).
- `matchExport(parsed: ParsedExport): Promise<MatchedExport>` —

```ts
type MatchedExport = {
  shows: { tvdbSeriesId: number; seriesName: string; tmdbId: number|null }[];   // null = unmatched
  movies: { movieName: string; releaseYear: number|null; tmdbId: number|null }[];
  unmatchedShows: string[]; unmatchedMovies: string[];
}
```

  Shows: `findByTvdbId` (exact). Movies: `searchMovies(name, year)` → first result whose title matches case-insensitively OR sole result; else null. Distinct shows/movies only (Map by key), sequential with the throttled client.
- `dryRun(parsed, matched): ImportPreview` — `{ shows: n, episodes: n, movies: n, watchlist: n, follows: n, unmatchedShows: string[], unmatchedMovies: string[] }`
- `runImport(parsed, matched, onProgress?: (msg: string) => void): Promise<ImportReport>` — for each matched show: `addShow(tmdbId, statusFromFollow)` then insert episode watches by `(showId, season, episode)` lookup (unmatched episode numbers → report), preserving `watchedAt` and assigning `rewatchIndex` per duplicate order; movies via `addMovie`. Wrap per-show in try/catch; collect errors; **idempotent**: skip watch rows whose `(kind, episodeId, watchedAt)` already exists. Returns `ImportReport { imported: {...same shape as preview}, skippedDuplicates: number, errors: string[], unmatched: {shows, movies} }`. Status mapping: follow+for_later → `for_later`, archived → `stopped`, else `watching`.
- `resolveManualMatch(tvdbSeriesId: number, tmdbId: number): void` — persists override in `settings` key `import.override.tvdb.{id}`; `matchExport` consults overrides first.

- [ ] **Step 1: failing parse tests** — against `tests/fixtures/tvtime/`: counts, rewatch flag, seconds→minutes, towatch split, warning (not throw) on malformed row, works on the tiny-account fixture (2 follows, 0 watches).
- [ ] **Step 2: FAIL → implement parse.ts (csv-parse/sync, adm-zip when given a .zip path) → PASS → commit** `git commit -am "feat: importer parse"`
- [ ] **Step 3: failing match tests** (mock tmdb: known id → id; unknown → null; movie exact-title rule; override wins) **→ implement match.ts → PASS → commit** `git commit -am "feat: importer matching"`
- [ ] **Step 4: failing run tests** (in-memory db + mocked tmdb; import twice → same row counts (idempotent); rewatch rows get increasing rewatchIndex; unmatched reported not dropped; status mapping) **→ implement run.ts → PASS → commit** `git commit -am "feat: importer run + idempotency"`
- [ ] **Step 5: Real-data validation script** — create `scripts/import-real.ts`: `parseExport('import/extracted-main')` → `matchExport` → print `dryRun` preview. Run with `npx tsx scripts/import-real.ts`. Expected: ~13,999 episode watches / 342 shows parsed; unmatched list small (<10). Record actual numbers in the commit message. Commit `git commit -am "chore: real-export dry-run validation"`

> Ratings import: TV Time's vote files encode votes inside `vote_key` with no documented value scheme (emotion-style votes). Step 5's script must also print the distribution of `vote_key` suffixes from `ratings-3-prod-episode_votes.csv`; if a clean 1–10 or small-enum pattern emerges, add a `parse→import` pass for ratings mirroring the movie flow (same tests); if not, log `warnings: ['ratings not importable']` and move on. Decision is made by evidence, not skipped silently.

---

### Task 7: API route handlers

**Files:**
- Create: `src/app/api/library/shows/route.ts` (POST add {tmdbId,status}), `src/app/api/library/shows/[id]/route.ts` (PATCH status/favorite, DELETE), `src/app/api/checkin/route.ts` (POST {episodeId}|{movieId}, DELETE uncheck), `src/app/api/season-watched/route.ts` (POST {showId,seasonNumber}), `src/app/api/rate/route.ts` (POST), `src/app/api/search/route.ts` (GET ?q= → merged shows+movies), `src/app/api/import/route.ts` (POST multipart zip → returns preview + serverside session id; PUT {sessionId, confirm:true} → runs import, streams progress as text), `src/app/api/sync/route.ts` (POST → lib/sync)
- Create: `src/lib/sync.ts` — `refreshStaleShows(): Promise<number>`: for library shows whose `shows.status` ≠ 'Ended'/'Canceled' and `lastSyncedAt` > 24h old, re-run metadata upsert (same upsert helper as `addShow`, exported from library.ts); returns count. Called fire-and-forget from the home page server component; concurrency-guarded by a `settings` timestamp key.
- Test: `tests/api.test.ts` — call route handlers directly (`await POST(new Request(...))`) with mocked lib; assert status codes and that handlers delegate (no logic in routes).

- [ ] Step 1: failing tests → Step 2: FAIL → Step 3: implement thin handlers (zod-free manual validation: return 400 on missing fields) → Step 4: PASS → Step 5: Commit `git commit -am "feat: api routes + daily sync"`

---

### Task 8: Design system & app shell  *(load `frontend-design` skill first)*

**Files:**
- Create: `src/app/globals.css` (design tokens), `src/app/layout.tsx` (shell), `src/components/ui.tsx` (Button, Card, Poster, ProgressBar, StatusBadge, EmptyState, Skeleton), `src/components/nav.tsx`, `src/app/icon.svg`

**Design language (binding for all screen tasks):**
- Dark cinematic default: near-black `#0b0e14` canvas, elevated cards `#141926`, one saturated accent (warm amber `#f5a623` family) used sparingly for actions/check-ins; generous poster imagery — posters ARE the interface.
- Typography: `Inter` (self-hosted via `next/font`) — display weight for titles, tabular numerals for stats.
- Sidebar nav (desktop) / bottom tab bar (<768px): Watch Next · Upcoming · My Shows · Movies · Explore · Stats · Settings. Active state = accent pill.
- Check-in affordance: circular checkmark button on every episode/next-up card, satisfying pressed animation (scale + fill transition ~150ms); optimistic UI everywhere (update immediately, revert on API error with a toast).
- Poster component: TMDB `w342` with blur-up (`w92` placeholder), 2:3 aspect ratio locked, rounded-xl, subtle ring on hover.
- TMDB attribution line in the shell footer (spec/TMDB requirement).

- [ ] Step 1: implement tokens + shell + primitives. Step 2: verify visually — `npm run dev`, check `/` renders shell with nav at desktop + mobile widths (no dead-ends; placeholder pages for all seven routes). Step 3: Commit `git commit -am "feat: design system + app shell"`

---

### Task 9: Screens — Watch Next, Show detail, My Shows  *(load `frontend-design` skill first; reuse Task 8 primitives)*

**Files:**
- Create: `src/app/page.tsx` (Watch Next), `src/components/watch-next-card.tsx`, `src/app/show/[id]/page.tsx`, `src/components/episode-row.tsx`, `src/components/season-tabs.tsx`, `src/app/shows/page.tsx`, `src/components/show-grid.tsx`
- All server components fetch via lib directly; mutations via small client components calling the API with optimistic updates.

**Screen contracts:**
- **Watch Next** (`/`): grid of `getWatchNextList()` cards — backdrop image, show name, `S3 · E10 — Title`, relative last-watched, big check-in button that advances the card to the following episode in place (optimistic). Empty state → CTA to Explore. Fires `fetch('/api/sync',{method:'POST'})` fire-and-forget.
- **Show detail** (`/show/[id]`): backdrop hero + poster + status badge + progress bar (`getShowProgress`) + favorite toggle + status menu + rating (1–10 stars). Season tabs → episode rows: still, number, name, air date, runtime, check-in circle; unaired rows dimmed with countdown ("fra 3 giorni"); "Mark season watched" per tab; "Mark all watched". If show not in library: "Add to library" hero button (calls POST /api/library/shows).
- **My Shows** (`/shows`): five groups from `getLibraryGrouped()` in TV Time order (Watching / Up to date / For later / Finished / Stopped), poster grid with progress bar + status change menu; favorites first within groups.

- [ ] Step 1: implement Watch Next + verify in browser (seed one show via `scripts/seed-dev.ts` — create it: addShow(1396 Breaking Bad) + a few check-ins). Step 2: implement Show detail + verify check-in/uncheck/season-watch flows update progress live. Step 3: implement My Shows + verify status transitions move cards between groups. Step 4: `npx vitest run` (all green). Step 5: Commit `git commit -am "feat: watch-next, show detail, my shows screens"`

---

### Task 10: Screens — Movies, Explore, Upcoming, Stats  *(load `frontend-design` skill first)*

**Files:**
- Create: `src/app/movies/page.tsx`, `src/app/movie/[id]/page.tsx`, `src/app/explore/page.tsx`, `src/components/search-box.tsx`, `src/app/upcoming/page.tsx`, `src/app/stats/page.tsx`, `src/components/stats-charts.tsx`

**Screen contracts:**
- **Movies**: Watchlist / Watched tabs; card check-in moves watchlist→watched (sets watchedAt now); movie detail page mirrors show detail minus seasons.
- **Explore**: debounced (300ms) `/api/search` box; below it `trendingShows()` + `trendingMovies()` rails (horizontal scroll); every card shows an add-state button (Add / In library ✓). Sections: "Di tendenza — Serie", "Di tendenza — Film".
- **Upcoming**: `getUpcoming(90)` grouped by date with day headers ("Oggi", "Domani", weekday + date), premiere badge, show poster + `S/E` chip. Empty state explains it fills as followed shows announce dates.
- **Stats**: hero tiles (time watched as "X anni Y mesi Z giorni" TV Time-style, episodes, movies, shows finished), top-shows list with minutes, genre bars, 24-month activity chart (pure SVG, no chart lib — follow dataviz conventions), longest streak. All from `getStats()`.

- [ ] Step 1: Movies + verify. Step 2: Explore + verify live TMDB search/trending against real API. Step 3: Upcoming + verify with a currently-airing seeded show. Step 4: Stats + verify numbers against a hand-computed seed. Step 5: `npx vitest run` green; commit `git commit -am "feat: movies, explore, upcoming, stats screens"`

---

### Task 11: Settings & Import UI

**Files:**
- Create: `src/app/settings/page.tsx`, `src/components/import-wizard.tsx`

**Screen contract:** drag-and-drop zone for the GDPR ZIP → uploads to POST `/api/import` → **preview card** (shows/episodes/movies/watchlist counts + unmatched lists) → Confirm button → PUT streams progress lines into a log panel → final report (imported counts, skipped duplicates, errors). Unmatched shows render each with an inline TMDB search box → picking a result calls `resolveManualMatch` and re-offers import for just those. Also on this page: TMDB language toggle (it-IT/en-US, stored in `settings`), db file location + size display, "Export my data" button (downloads JSON dump of all user tables — never lock data in again).

- [ ] Step 1: implement; Step 2: end-to-end verify with the TINY fixture zip (2 follows import cleanly, re-import → 0 new); Step 3: commit `git commit -am "feat: settings + import wizard"`

---

### Task 12: Docker packaging

**Files:**
- Create: `Dockerfile` (multi-stage: deps → build (`next build`, standalone output) → runner `node:22-slim`, `ENV DATA_DIR=/data`, `VOLUME /data`, `EXPOSE 3000`; better-sqlite3 native module must be rebuilt in the runner stage arch), `docker-compose.yml` (service `tvtracker`, `ports: 3000:3000`, `volumes: ./data:/data`, `env_file: .env`, `restart: unless-stopped`), `.dockerignore`, `README.md` (run/backup/restore instructions)
- Modify: `next.config.ts` — `output: 'standalone'`

- [ ] Step 1: `docker compose build` → success. Step 2: `docker compose up -d` → `curl -s localhost:3000` 200; add a show via UI; `docker compose restart` → data still there (volume proof). Step 3: commit `git commit -am "feat: docker packaging with persistent volume"`

---

### Task 13: Final end-to-end verification (real data)

- [ ] Step 1: In the dockerized app, run the import wizard with `import/gdpr-data-main.zip`.
- [ ] Step 2: Cross-check: imported episode count ≈ 13,999 minus skipped/unmatched (all accounted for in the report — the sum must reconcile exactly); shows ≈ 342; spot-check 3 shows the user knows (e.g. The Walking Dead S3E10 watched on 2020-05-30) against show detail; Stats page totals sane vs export's `time_spent` (369,252 min ⇒ ~256 days — same order of magnitude; runtimes differ by source, exact match not expected).
- [ ] Step 3: Click through all seven screens with real data; fix anything broken; re-run `npx vitest run`.
- [ ] Step 4: Re-run the import a second time → report shows ~100% skipped duplicates, 0 new (idempotency proof on real data).
- [ ] Step 5: Commit `git commit -am "chore: e2e verification against real TV Time export"` and tag `v1.0.0`.

---

## Self-review notes

- Spec coverage: all seven screens (T8–T11), importer incl. dry-run/manual-match/idempotency (T6, T11), TMDB sync (T7), Docker+volume (T12), stats (T5/T10), error handling (throttle/backoff T2, per-row import errors T6, optimistic-revert T8), testing (every logic task TDD; e2e T13). Ratings import: evidence-gated decision documented in T6.
- Type consistency: `LibStatus` (T3) used by T4 grouping and T6 status mapping; `ParsedExport/MatchedExport` shared T6→T11; `getStats(): Stats` shared T5→T10.
- Movies have no TVDB id in the export — matched by name+year only; unmatched movies flow through the same manual-match UI (T11).
