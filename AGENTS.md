# AGENTS.md — working on TVTracker with an AI coding agent

Machine-oriented companion to [README.md](README.md). Read this before making changes.

## What this is

Single-user, self-hosted TV/movie tracker (TV Time replacement) with a lossless TV Time GDPR-export importer. Next.js 15 App Router serves UI + API in one app; SQLite is the only store; TMDB is the only external service.

## Commands

```bash
npx vitest run                 # full test suite (195 tests) — must stay green
npx vitest run tests/foo.test.ts   # focused run while iterating
npx tsc --noEmit               # typecheck — must stay clean
npx next build                 # production build — must pass before calling UI work done
npm run dev                    # dev server on :3000, uses .env (DATA_DIR=./data)
npx tsx scripts/seed-dev.ts    # seed Breaking Bad + check-ins for a non-empty dev UI
npx tsx scripts/import-real.ts # dry-run the importer against import/ (git-ignored user data), needs .env
docker compose up -d --build   # production container, host port ${TVTRACKER_PORT:-3100}
```

Secrets live in `.env` (git-ignored): `TMDB_API_KEY`, `TMDB_READ_TOKEN`, optional `TVTRACKER_PORT`, `DATA_DIR`. Never commit `.env`, `data/`, or `import/`.

## Module contracts (load-bearing — do not blur these boundaries)

| Module | Contract |
|---|---|
| `src/db/schema.ts` | Single source of schema truth. After ANY change: `npx drizzle-kit generate`, then mirror the SQL into `src/db/migrations.ts` as `IF NOT EXISTS` statements (executed idempotently on open). Additive columns (SQLite has no `ADD COLUMN IF NOT EXISTS`) go in `alterStatements` instead and are executed with a duplicate-column guard in `db/index.ts`. |
| `src/db/index.ts` | `getDb()` singleton; `DATA_DIR=':memory:'` → in-memory (tests use `resetDbForTests()` in `beforeEach`). |
| `src/lib/tmdb.ts` | The ONLY module that performs TMDB HTTP. Throttle ≤40 req/10s, 10-min URL cache, retry w/ backoff, `TmdbError` on exhaustion, per-call language from settings (`it-IT` fallback). Tests mock `fetch`; call `resetTmdbForTests()` in `beforeEach`. |
| `src/lib/library.ts` | The ONLY module that mutates user data. `nowUtc()` is the single timestamp producer (`YYYY-MM-DD HH:MM:SS` UTC). `addShow`/`addMovie` are idempotent-INSERTs: they never change existing rows — state transitions go through `setShowStatus`/`setMovieState`. |
| `src/lib/watch-next.ts`, `stats.ts` | Read-only computation. Season 0 (specials) is excluded from progress/watch-next/up-to-date. "Aired" = `airDate <= today (UTC date string)`. Rewatches count once for progress, every time for stats minutes. |
| `src/lib/importer/` | `parse.ts` (CSV/ZIP → ParsedExport, warnings never throw) → `match.ts` (settings overrides first, then TVDB→TMDB `/find`; movies by name+year) → `run.ts` (pure `dryRun`, idempotent `runImport`; unmatched/mismatched items are REPORTED, never silently dropped — this is the project's paramount invariant). |
| `src/app/api/**` | Thin handlers: validation + delegation only, zero business logic. Errors: validation → 400, `TmdbError` → 502, else 500 `{error}`. Next 15: `params` is a Promise — await it. |
| `src/components/ui.tsx` | Design-system primitives (Poster, CheckinButton, StatusBadge…). Dark-only theme, tokens in `globals.css` via Tailwind 4 `@theme`. UI copy is Italian; code/comments English. |

## Domain semantics that bite

- `watches` table: unique on `(kind, episodeId, movieId, rewatchIndex)`; a rewatch = new row with incremented `rewatchIndex`. Import idempotency keys on `(kind, episodeId, watchedAt)`.
- `library_shows.status` stored values: `watching | finished | stopped | for_later`. The DISPLAY splits `watching` into `to_start` and `up_to_date` (computed) — mapping lives in the screens, not the DB.
- Favorite toggle API: send `{favorite: true}` to toggle; `favorite: false` is a no-op by design.
- Timestamps are plain-text UTC strings compared lexically — never round-trip them through `Date` for bucketing (string-slice instead).
- `.gitignore` uses anchored `/import/` deliberately — a bare `import/` pattern once swallowed `src/app/api/import/`. Watch for the same trap with `data/`.
- Docker: compose pins `DATA_DIR=/data` via `environment:` (overrides `env_file`); the runner stage copies better-sqlite3's native module LAST so it wins over the standalone trace.

## Workflow expectations

- TDD for logic: failing test → implement → green. UI-only work is verified by `next build` + driving the running app (curl or browser) — say what you verified and how.
- Full suite + typecheck before every commit. Match existing style; keep diffs surgical.
- Test fixtures in `tests/fixtures/tvtime*/` are real-shaped TV Time export rows (anonymized). Extend them rather than inventing new shapes — column names and quirks (runtime in seconds in the legacy file, `'true'/'false'` vs `'0'/'1'` booleans) are real-world facts, not choices.
- The importer is one-shot user-history migration code: any change there needs the losslessness question answered explicitly ("where do rows that fail this path get reported?").

## Docs

- `docs/superpowers/specs/2026-07-08-tvtracker-design.md` — the approved design spec.
- `docs/superpowers/plans/2026-07-08-tvtracker.md` — the 13-task implementation plan the codebase was built from (useful map of what lives where and why).
