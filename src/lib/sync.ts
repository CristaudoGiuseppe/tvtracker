import { asc, eq, and, or, isNull, lt, notInArray } from 'drizzle-orm';
import { getDb } from '../db';
import { shows, movies, libraryShows, libraryMovies, settings } from '../db/schema';
import { getShowFull } from './tmdb';
import { upsertShowMetadata, refreshProviders, nowUtc } from './library';

const STALE_MS = 24 * 60 * 60 * 1000;
const GUARD_MS = 60 * 60 * 1000;
const LAST_RUN_KEY = 'sync.lastRunAt';
const NON_STALE_STATUSES = ['Ended', 'Canceled'];
// Max providers-backfill fetches per sync run. The backfill runs inside the
// POST /api/sync request handler: unbounded it would walk every NULL-providers
// library title (hundreds of throttled TMDB calls, minutes of wall time) in a
// single request. Capped, each run chips away at the backlog lowest-id first;
// with the 1-hour sync guard the whole library completes over a few app opens.
export const PROVIDERS_BACKFILL_BATCH = 80;

function toDate(utcString: string): Date {
  return new Date(utcString.replace(' ', 'T') + 'Z');
}

function formatUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function getSetting(key: string): string | null {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  getDb()
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

/** Refreshes cached metadata for library shows that aren't finished airing and
 * haven't been synced in the last 24h. Guarded so at most one run happens per
 * hour. Failures for individual shows are swallowed and don't count as refreshed. */
export async function refreshStaleShows(): Promise<number> {
  const db = getDb();
  const now = nowUtc();

  const lastRunAt = getSetting(LAST_RUN_KEY);
  if (lastRunAt && toDate(now).getTime() - toDate(lastRunAt).getTime() < GUARD_MS) {
    return 0;
  }
  setSetting(LAST_RUN_KEY, now);

  const staleThreshold = formatUtc(new Date(toDate(now).getTime() - STALE_MS));

  const rows = db
    .select({ showId: shows.tmdbId })
    .from(libraryShows)
    .innerJoin(shows, eq(shows.tmdbId, libraryShows.showId))
    .where(
      and(
        or(isNull(shows.status), notInArray(shows.status, NON_STALE_STATUSES)),
        or(isNull(shows.lastSyncedAt), lt(shows.lastSyncedAt, staleThreshold)),
      ),
    )
    .all();

  let refreshed = 0;
  for (const row of rows) {
    try {
      const full = await getShowFull(row.showId);
      upsertShowMetadata(full);
      // Opportunistically refresh providers whenever we re-sync a show.
      await refreshProviders('tv', row.showId);
      refreshed++;
    } catch {
      // collect failures, continue with the rest of the batch
    }
  }

  await backfillProviders();
  return refreshed;
}

/** Fills `watch_providers` for library titles where it's still NULL — shows AND
 * movies, including Ended/Canceled shows (the metadata staleness skip does NOT
 * apply to this providers backfill). Processes at most
 * PROVIDERS_BACKFILL_BATCH titles per run, lowest tmdbId first; returns how
 * many NULL titles remain for later runs. Failure-tolerant per title. */
async function backfillProviders(): Promise<number> {
  const db = getDb();

  const showIds = db
    .select({ id: shows.tmdbId })
    .from(shows)
    .innerJoin(libraryShows, eq(libraryShows.showId, shows.tmdbId))
    .where(isNull(shows.watchProviders))
    .orderBy(asc(shows.tmdbId))
    .all()
    .map(r => ({ kind: 'tv' as const, id: r.id }));

  const movieIds = db
    .select({ id: movies.tmdbId })
    .from(movies)
    .innerJoin(libraryMovies, eq(libraryMovies.movieId, movies.tmdbId))
    .where(isNull(movies.watchProviders))
    .orderBy(asc(movies.tmdbId))
    .all()
    .map(r => ({ kind: 'movie' as const, id: r.id }));

  const pending = [...showIds, ...movieIds];
  const batch = pending.slice(0, PROVIDERS_BACKFILL_BATCH);
  for (const { kind, id } of batch) {
    await refreshProviders(kind, id);
  }
  return pending.length - batch.length;
}
