# TVTracker v1.1 — Design Spec

**Date:** 2026-07-09
**Status:** Approved (user request batch, clarified via Q&A)
**Base:** v1.0.x (all 14 v1.0 tasks complete)

## 1. Library semantics — "Da iniziare"

Problem: shows never started sit in "In visione" alongside shows actively being watched; shows the user is behind on get parked manually in "Più tardi" (fine, unchanged).

- New **computed** display group `to_start` ("Da iniziare"): stored status `watching` AND `watchedCount === 0`. No schema change; the split happens in `getLibraryGrouped` exactly like the existing `watching`/`up_to_date` split.
- My Shows group order becomes: **In visione · Da iniziare · In pari · Da vedere più tardi · Finite · Abbandonate**.
- StatusBadge gains a `to_start` display key ("Da iniziare").
- Watch Next (home) keeps including never-started shows (their next episode is S1E1).

## 2. Watch Next progress bar

Each Watch Next card gains a ProgressBar with `watchedCount/airedCount` and the label "Ti mancano N episodi" (N = aired − watched). Data comes from `computeProgress` (already computed per show in `getWatchNextList` — expose it in the returned shape).

## 3. Navigation — liquid-glass floating bottom bar

- The sidebar is REMOVED on all breakpoints; the logo/wordmark is removed.
- One floating bottom bar on every viewport, Apple "Liquid Glass" style: translucent capsule (backdrop-blur + saturation boost), specular top highlight, soft shadow, floating with margin from screen edges, rounded-full. Active item = filled accent pill. Labels visible on ≥md, icon-only on small screens.
- TMDB attribution stays in a minimal footer; page content gets bottom padding so the bar never covers content.

## 4. Watch providers ("Dove guardarla")

- New columns `shows.watch_providers` and `movies.watch_providers` (JSON text, nullable): `{ region: 'IT', flatrate: [{id, name, logoPath}], rent: [...], buy: [...] , link }` from TMDB `/tv/{id}/watch/providers` and `/movie/{id}/watch/providers` (JustWatch data).
- Region from settings key `watch.region`, default `IT`.
- Populated: on `addShow`/`addMovie`, and backfilled by the daily sync for any library title where the column is NULL (including ended shows — the NULL backfill ignores the Ended/Canceled skip); refreshed opportunistically whenever a show is re-synced.
- UI: "Dove guardarla" row on show and movie detail — provider logos (TMDB image CDN), flatrate first, then rent/buy collapsed under a smaller heading. Required attribution line: "Dati di disponibilità forniti da JustWatch" (TMDB terms).

## 5. My Shows — filters, sort, persistent view

Toolbar above the grid:
- **Filters** (combinable): Piattaforma (from stored watch_providers flatrate of library shows), Genere (from stored genres), Stato (the 6 display groups), Solo preferite (toggle).
- **Sort**: Nome A→Z (DEFAULT), Attività recente (last watch desc), Progresso (% asc — closest-to-done last? No: % desc). Applied within groups.
- **Grouping**: status groups stay (per user choice), items sorted inside each group; when a Stato filter is active, non-matching groups disappear.
- **Persistent view**: the toolbar state (filters + sort) auto-saves to settings key `view.myshows` via a debounced POST /api/settings and is restored on load. A "Reimposta" button clears it. No named-views system (YAGNI).

## Non-goals (v1.1)

- Provider logos on grid cards (detail-only for now).
- Automatic status transitions (behind-a-season stays a manual "Più tardi" choice).
- Multi-region providers.

## Testing

- Lib: `to_start` split, progress exposure in watch-next list, provider JSON parse/store, sync NULL-backfill (incl. ended shows), settings view round-trip — unit tests.
- Routes: providers fields flow through existing thin routes; new/changed routes get api tests.
- UI: build + live verification (curl/browser) per established practice; nav change is visual — verified in the running app at both breakpoints.

## 6. Explore — add-with-intent (added 2026-07-09, user request)

Adding a SHOW from Esplora (search results and trending rails) offers two actions instead of one: "Inizio a guardarla" (status `watching`, today's behavior) and "Da vedere più tardi" (status `for_later`) — small split-button or long-press menu on the existing add control; default tap = watching. Movies keep going straight to the watchlist. The show-detail "Aggiungi alla libreria" hero button gets the same two options. Implemented with Task 18 (it already touches the library toolbar/filters surface).
