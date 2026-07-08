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
