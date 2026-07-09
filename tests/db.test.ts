import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
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

// The additive `watch_providers` columns are added via ALTER TABLE, which SQLite
// cannot express as IF NOT EXISTS. Migrating an EXISTING db (second open) must be
// a clean no-op — this guards the duplicate-column swallow in db/index.ts.
describe('migrations idempotency', () => {
  let dir: string;
  const original = process.env.DATA_DIR;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tvt-mig-'));
  });
  afterEach(() => {
    resetDbForTests();
    if (original === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = original;
    rmSync(dir, { recursive: true, force: true });
  });

  it('runs the ALTER migrations twice against the same file without throwing', () => {
    // First open: creates tables + adds watch_providers columns, then persist a row.
    resetDbForTests();
    process.env.DATA_DIR = dir;
    getDb().insert(shows).values({ tmdbId: 42, name: 'X', watchProviders: '{"region":"IT"}' }).run();

    // Second open of the SAME file re-runs migrate() over already-altered tables.
    resetDbForTests();
    process.env.DATA_DIR = dir;
    expect(() => getDb()).not.toThrow();

    const row = getDb().select().from(shows).where(eq(shows.tmdbId, 42)).get();
    expect(row?.watchProviders).toBe('{"region":"IT"}');
  });
});
