import { eq, and, or, isNull, lt, notInArray } from 'drizzle-orm';
import { getDb } from '../db';
import { shows, movies, libraryShows, libraryMovies, settings } from '../db/schema';
import { getShowFull } from './tmdb';
import { upsertShowMetadata, refreshProviders, nowUtc } from './library';

const STALE_MS = 24 * 60 * 60 * 1000;
const GUARD_MS = 60 * 60 * 1000;
const LAST_RUN_KEY = 'sync.lastRunAt';
const NON_STALE_STATUSES = ['Ended', 'Canceled'];

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

/** Fills `watch_providers` for every library title where it's still NULL —
 * shows AND movies, including Ended/Canceled shows (the metadata staleness skip
 * does NOT apply to this providers backfill). Failure-tolerant per title. */
async function backfillProviders(): Promise<void> {
  const db = getDb();

  const showIds = db
    .select({ id: shows.tmdbId })
    .from(shows)
    .innerJoin(libraryShows, eq(libraryShows.showId, shows.tmdbId))
    .where(isNull(shows.watchProviders))
    .all();
  for (const { id } of showIds) {
    await refreshProviders('tv', id);
  }

  const movieIds = db
    .select({ id: movies.tmdbId })
    .from(movies)
    .innerJoin(libraryMovies, eq(libraryMovies.movieId, movies.tmdbId))
    .where(isNull(movies.watchProviders))
    .all();
  for (const { id } of movieIds) {
    await refreshProviders('movie', id);
  }
}
