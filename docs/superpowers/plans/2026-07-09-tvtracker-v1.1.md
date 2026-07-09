# TVTracker v1.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the v1.1 feature batch: "Da iniziare" library group, Watch Next progress bars, liquid-glass floating bottom nav, watch providers with logos, and a filterable/sortable/persistent My Shows view.

**Spec:** docs/superpowers/specs/2026-07-09-tvtracker-v1.1-design.md (binding).

## Global Constraints

- All v1.0 constraints stand (see docs/superpowers/plans/2026-07-08-tvtracker.md Global Constraints + AGENTS.md module contracts).
- UI directive: user-first, as beautiful as possible. UI tasks load the `frontend-design` skill first.
- NEVER open ./data/tvtracker.db from the macOS host while the container runs (virtiofs WAL corruption). Use `docker exec` or the API.
- The production container at :3100 holds the user's real library — schema migrations must be additive (`IF NOT EXISTS` / nullable columns), and any container rebuild must be verified to preserve data.
- Suite green + tsc clean + next build before every commit.

---

### Task 15: "Da iniziare" group + Watch Next progress

**Files:** Modify `src/lib/watch-next.ts`, `tests/watch-next.test.ts`, `src/app/shows/page.tsx`, `src/components/show-grid.tsx`, `src/components/ui.tsx` (StatusBadge key), `src/app/page.tsx`, `src/components/watch-next-card.tsx`.

- [ ] TDD lib: `getLibraryGrouped` returns 6 groups — `to_start` = stored `watching` && `watchedCount === 0`; `watching` requires ≥1 watch; group order in type/docs: watching, to_start, up_to_date, for_later, finished, stopped. `getWatchNextList` items expose `progress: {airedCount, watchedCount}`.
- [ ] UI: My Shows renders 6 groups (Italian: In visione · Da iniziare · In pari · Da vedere più tardi · Finite · Abbandonate); StatusBadge `to_start` = "Da iniziare". Watch Next card: ProgressBar + "Ti mancano N episodi" (singular "Ti manca 1 episodio").
- [ ] Verify in running app (curl HTML), suite/tsc/build green. Commit `feat: da-iniziare group + watch-next progress`.

### Task 16: Liquid-glass floating bottom nav  *(frontend-design skill first)*

**Files:** Modify `src/components/nav.tsx`, `src/app/layout.tsx`, `src/app/globals.css`; delete logo usage (keep `icon.svg` as favicon only).

- [ ] Remove sidebar entirely; one floating bottom capsule nav on all breakpoints: fixed bottom-center with margin, backdrop-blur + saturate, translucent surface token, top specular highlight (inset hairline gradient), soft drop shadow, rounded-full; icon+label ≥md, icon-only <md; active = accent pill; respects safe-area (env(safe-area-inset-bottom)).
- [ ] Layout: main content full-width (max-w container), bottom padding ≥ nav height; footer attribution stays minimal above the padding.
- [ ] Verify visually at 375px and 1280px in the running app; suite/tsc/build green. Commit `feat: liquid-glass floating nav`.

### Task 17: Watch providers

**Files:** Modify `src/db/schema.ts` (+ regenerate `src/db/migrations.ts` — additive ALTER-safe: new nullable text columns `watch_providers` on shows and movies via `ALTER TABLE ... ADD COLUMN` guarded statements), `src/lib/tmdb.ts` (`getWatchProviders(kind: 'tv'|'movie', tmdbId): Promise<ProvidersJson|null>` — region from settings `watch.region` default 'IT'; null when region absent), `src/lib/library.ts` (store on add + expose `refreshProviders(kind, id)`), `src/lib/sync.ts` (NULL-backfill for ALL library titles incl. ended; opportunistic refresh on normal sync), detail pages + a `src/components/providers-row.tsx`.
**Types:** `ProvidersJson = { region: string; link?: string; flatrate: ProviderEntry[]; rent: ProviderEntry[]; buy: ProviderEntry[] }`, `ProviderEntry = { id: number; name: string; logoPath: string }`.

- [ ] TDD: tmdb function (mocked fetch: hit, region-miss→null); library stores JSON on addShow/addMovie; sync backfills NULL providers including an Ended show (test proves the Ended skip is bypassed for the NULL-backfill only); migration adds columns idempotently.
- [ ] UI: "Dove guardarla" on show + movie detail — flatrate logo row (TMDB `w92` logos, rounded, provider name as tooltip/alt), rent/buy collapsed subsection; attribution "Dati di disponibilità forniti da JustWatch". Hidden entirely when no data.
- [ ] Verify live on a real show (post-recovery container has data; e.g. The Last of Us) — logos render. Suite/tsc/build green. Commit `feat: watch providers`.

### Task 18: My Shows filters, sort, persistent view

**Files:** Modify `src/app/shows/page.tsx`, `src/components/show-grid.tsx` (+ new `src/components/library-toolbar.tsx`), `src/lib/watch-next.ts` (grouped items expose genres + provider ids + lastWatchedAt + progress% for client-side filtering), settings API reuse.

- [ ] Explore add-with-intent (spec §6): show-add offers "Inizio a guardarla" / "Da vedere più tardi" (status for_later) in Esplora cards AND show-detail hero; movies unchanged. Extend existing api tests for the status param path.
- [ ] Toolbar (client): filter chips/selects — Piattaforma (options = distinct flatrate providers across library, with logos), Genere (distinct genres), Stato (6 groups), Solo preferite; sort select — Nome A→Z (default), Attività recente, Progresso. Filtering/sorting client-side over server-passed data (single-user scale).
- [ ] Groups stay; items sorted per sort choice inside groups (default alphabetical, it-IT collation); Stato filter hides other groups; empty groups hidden.
- [ ] Persistent view: toolbar state auto-saved (debounced 500ms) to settings key `view.myshows` via POST /api/settings (extend the route to accept arbitrary whitelisted keys — whitelist `view.myshows`, `watch.region`, `tmdb.language`), restored server-side on page load; "Reimposta" clears. TDD the settings whitelist + round-trip.
- [ ] Verify live: set filters, reload page → view persists; reset works. Suite/tsc/build green. Commit `feat: my-shows filters, sort, persistent view`.

### Task 19: v1.1 wrap-up

- [ ] Final whole-branch code review (superpowers:requesting-code-review) covering v1.0 accumulated Minors (ledger) + v1.1 diff; fix wave for Critical/Important.
- [ ] Rebuild container (`docker compose build && up -d`) AFTER confirming no import is running; verify data intact (docker exec count), click through all screens with real data.
- [ ] Tag `v1.1.0`, push branch + main + tags to GitHub.

### Task 20: Season picker redesign  *(frontend-design skill first)*

**Files:** Modify `src/components/season-tabs.tsx` (rename/replace with season chip grid), `src/app/show/[id]/page.tsx` (pass per-season watched/aired counts — compute from existing data, no schema change), tests only if pure logic is extracted.

- [ ] Per-season progress data: aired + watched counts per season (derive in the page's server component from episodes+watches already loaded; exclude nothing — season 0 shown but last and de-emphasized).
- [ ] Wrapping chip grid per spec §7: all seasons visible, state-at-a-glance (done/partial/unwatched), selected state distinct, works from 1 to 25+ seasons at 375px and desktop.
- [ ] Verify live with a seeded long show; suite/tsc/build green. Commit `feat: season chip grid`.
