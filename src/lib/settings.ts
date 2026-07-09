import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { settings } from '../db/schema';

// App-level settings persisted in the key/value `settings` table.
// Kept tiny and defensive: reads fall back to sane defaults so callers on the
// TMDB hot path (buildUrl) never throw on a cold/locked db.

export type TmdbLanguage = 'it-IT' | 'en-US';

const LANGUAGE_KEY = 'tmdb.language';
const DEFAULT_LANGUAGE: TmdbLanguage = 'it-IT';

const WATCH_REGION_KEY = 'watch.region';
const DEFAULT_WATCH_REGION = 'IT';

/** ISO-3166-1 region used to pick the watch-providers block from TMDB. */
export function getWatchRegion(): string {
  try {
    const row = getDb().select().from(settings).where(eq(settings.key, WATCH_REGION_KEY)).get();
    return row?.value ?? DEFAULT_WATCH_REGION;
  } catch {
    return DEFAULT_WATCH_REGION;
  }
}

export function getLanguage(): TmdbLanguage {
  try {
    const row = getDb().select().from(settings).where(eq(settings.key, LANGUAGE_KEY)).get();
    return row?.value === 'en-US' ? 'en-US' : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function setLanguage(language: TmdbLanguage): void {
  getDb()
    .insert(settings)
    .values({ key: LANGUAGE_KEY, value: language })
    .onConflictDoUpdate({ target: settings.key, set: { value: language } })
    .run();
}
