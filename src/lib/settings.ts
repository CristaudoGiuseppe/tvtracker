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

/** Raw value for a settings key, or null when unset (defensive: never throws). */
export function getSetting(key: string): string | null {
  try {
    const row = getDb().select().from(settings).where(eq(settings.key, key)).get();
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/** Upsert a settings key. Callers (thin API route) own validation. */
export function setSetting(key: string, value: string): void {
  getDb()
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

export function deleteSetting(key: string): void {
  getDb().delete(settings).where(eq(settings.key, key)).run();
}
