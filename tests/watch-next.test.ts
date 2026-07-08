import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../src/db';
import { shows, episodes, libraryShows, watches } from '../src/db/schema';
import type { LibStatus } from '../src/lib/library';
import {
  getShowProgress,
  getWatchNextList,
  getUpcoming,
  getLibraryGrouped,
} from '../src/lib/watch-next';

// --- date helpers: relative to real "today" so fixtures never go stale ---
function offsetDate(days: number): string {
  const dt = new Date();
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
const TODAY = offsetDate(0);
const YESTERDAY = offsetDate(-1);
const TOMORROW = offsetDate(1);
const IN_50_DAYS = offsetDate(50);
const IN_90_DAYS = offsetDate(90);
const IN_91_DAYS = offsetDate(91);

// --- seed helpers ---
function insertShow(id: number, name = `Show ${id}`): void {
  getDb().insert(shows).values({ tmdbId: id, name }).run();
}
function insertEpisode(id: number, showId: number, seasonNumber: number, episodeNumber: number, airDate: string | null): void {
  getDb().insert(episodes).values({ tmdbId: id, showId, seasonNumber, episodeNumber, airDate }).run();
}
function insertLib(showId: number, status: LibStatus, archived = 0): void {
  getDb().insert(libraryShows).values({ showId, status, archived, addedAt: '2020-01-01 00:00:00' }).run();
}
function insertWatch(episodeId: number, showId: number, watchedAt: string, rewatchIndex = 0): void {
  getDb().insert(watches).values({ kind: 'episode', episodeId, showId, watchedAt, rewatchIndex }).run();
}

describe('watch-next', () => {
  beforeEach(() => resetDbForTests());

  describe('getShowProgress', () => {
    it('next episode skips specials and unaired episodes', () => {
      insertShow(1);
      insertEpisode(100, 1, 0, 1, YESTERDAY); // special, aired
      insertEpisode(101, 1, 1, 1, YESTERDAY); // aired, watched
      insertEpisode(102, 1, 1, 2, YESTERDAY); // aired, unwatched -> expected next
      insertEpisode(103, 1, 2, 1, TOMORROW); // future
      insertWatch(101, 1, '2024-01-01 00:00:00');

      const progress = getShowProgress(1);
      expect(progress.airedCount).toBe(2); // season 1 only, season 0 excluded
      expect(progress.watchedCount).toBe(1);
      expect(progress.nextEpisode?.tmdbId).toBe(102);
      expect(progress.upToDate).toBe(false);
    });

    it('rewatches do not inflate watchedCount', () => {
      insertShow(2);
      insertEpisode(200, 2, 1, 1, YESTERDAY);
      insertEpisode(201, 2, 1, 2, YESTERDAY);
      insertWatch(200, 2, '2024-01-01 00:00:00', 0);
      insertWatch(200, 2, '2024-02-01 00:00:00', 1); // rewatch of same episode

      const progress = getShowProgress(2);
      expect(progress.watchedCount).toBe(1);
      expect(progress.nextEpisode?.tmdbId).toBe(201);
    });

    it('upToDate is true when all aired non-special episodes are watched', () => {
      insertShow(3);
      insertEpisode(300, 3, 1, 1, YESTERDAY);
      insertEpisode(301, 3, 1, 2, YESTERDAY);
      insertEpisode(302, 3, 2, 1, TOMORROW); // future, does not count
      insertWatch(300, 3, '2024-01-01 00:00:00');
      insertWatch(301, 3, '2024-01-02 00:00:00');

      const progress = getShowProgress(3);
      expect(progress.airedCount).toBe(2);
      expect(progress.watchedCount).toBe(2);
      expect(progress.upToDate).toBe(true);
      expect(progress.nextEpisode).toBeNull();
    });

    it('upToDate is false when there are no aired episodes yet', () => {
      insertShow(4);
      insertEpisode(400, 4, 1, 1, TOMORROW);
      const progress = getShowProgress(4);
      expect(progress.airedCount).toBe(0);
      expect(progress.upToDate).toBe(false);
      expect(progress.nextEpisode).toBeNull();
    });
  });

  describe('getWatchNextList', () => {
    it('includes only "watching" non-archived shows that have a next episode, ordered by recency (nulls last)', () => {
      // show 10: watching, watched an episode recently -> should be first
      insertShow(10, 'Recent Show');
      insertLib(10, 'watching');
      insertEpisode(1000, 10, 1, 1, YESTERDAY);
      insertEpisode(1001, 10, 1, 2, YESTERDAY);
      insertWatch(1000, 10, '2024-06-01 00:00:00');

      // show 11: watching, watched a while ago -> should be second
      insertShow(11, 'Older Show');
      insertLib(11, 'watching');
      insertEpisode(1100, 11, 1, 1, YESTERDAY);
      insertEpisode(1101, 11, 1, 2, YESTERDAY);
      insertWatch(1100, 11, '2024-01-01 00:00:00');

      // show 12: watching, never watched anything -> should be last (null lastWatchedAt)
      insertShow(12, 'Never Watched Show');
      insertLib(12, 'watching');
      insertEpisode(1200, 12, 1, 1, YESTERDAY);

      // show 13: watching but fully up to date (no next episode) -> excluded
      insertShow(13, 'Up To Date Show');
      insertLib(13, 'watching');
      insertEpisode(1300, 13, 1, 1, YESTERDAY);
      insertWatch(1300, 13, '2024-01-01 00:00:00');

      // show 14: watching but archived -> excluded even though it has a next episode
      insertShow(14, 'Archived Watching Show');
      insertLib(14, 'watching', 1);
      insertEpisode(1400, 14, 1, 1, YESTERDAY);

      // show 15: for_later status -> excluded regardless of episodes
      insertShow(15, 'For Later Show');
      insertLib(15, 'for_later');
      insertEpisode(1500, 15, 1, 1, YESTERDAY);

      const list = getWatchNextList();
      expect(list.map(r => r.show.tmdbId)).toEqual([10, 11, 12]);
      expect(list[0].next.tmdbId).toBe(1001);
      expect(list[0].lastWatchedAt).toBe('2024-06-01 00:00:00');
      expect(list[2].lastWatchedAt).toBeNull();
    });
  });

  describe('getUpcoming', () => {
    it('orders by airDate asc then show name, flags season premieres, respects daysAhead window and archived exclusion', () => {
      insertShow(20, 'Zebra Show');
      insertLib(20, 'watching');
      insertEpisode(2000, 20, 1, 1, IN_50_DAYS); // season premiere

      insertShow(21, 'Alpha Show');
      insertLib(21, 'watching');
      insertEpisode(2100, 21, 1, 2, IN_50_DAYS); // same date as above, not premiere -> should sort before Zebra by name

      insertShow(22, 'Finished Show With New Season');
      insertLib(22, 'finished');
      insertEpisode(2200, 22, 3, 1, TOMORROW); // finished shows still surface new seasons

      // not aired-future: today's episode is not "future"
      insertShow(23, 'Today Show');
      insertLib(23, 'watching');
      insertEpisode(2300, 23, 1, 1, TODAY);

      // beyond daysAhead window (default 90)
      insertShow(24, 'Too Far Show');
      insertLib(24, 'watching');
      insertEpisode(2400, 24, 1, 1, IN_91_DAYS);

      // exactly at the boundary
      insertShow(25, 'Boundary Show');
      insertLib(25, 'watching');
      insertEpisode(2500, 25, 1, 1, IN_90_DAYS);

      // archived show excluded even though episode is upcoming
      insertShow(26, 'Archived Show');
      insertLib(26, 'watching', 1);
      insertEpisode(2600, 26, 1, 1, TOMORROW);

      const upcoming = getUpcoming();
      const ids = upcoming.map(r => r.episode.tmdbId);

      expect(ids).not.toContain(2300); // today, not future
      expect(ids).not.toContain(2400); // beyond window
      expect(ids).not.toContain(2600); // archived
      expect(ids).toContain(2200); // finished show still surfaces
      expect(ids).toContain(2500); // boundary inclusive

      // ordering: TOMORROW (2200) first, then IN_50_DAYS pair ordered by name (Alpha before Zebra), then boundary
      expect(ids.indexOf(2200)).toBeLessThan(ids.indexOf(2100));
      expect(ids.indexOf(2100)).toBeLessThan(ids.indexOf(2000));
      expect(ids.indexOf(2000)).toBeLessThan(ids.indexOf(2500));

      const zebra = upcoming.find(r => r.episode.tmdbId === 2000)!;
      const alpha = upcoming.find(r => r.episode.tmdbId === 2100)!;
      expect(zebra.isSeasonPremiere).toBe(true);
      expect(alpha.isSeasonPremiere).toBe(false);
    });

    it('respects a custom daysAhead value', () => {
      insertShow(30, 'Custom Window Show');
      insertLib(30, 'watching');
      insertEpisode(3000, 30, 1, 1, offsetDate(10));
      insertEpisode(3001, 30, 1, 2, offsetDate(20));

      const upcoming = getUpcoming(15);
      expect(upcoming.map(r => r.episode.tmdbId)).toEqual([3000]);
    });
  });

  describe('getLibraryGrouped', () => {
    it('splits stored "watching" into "watching" vs "up_to_date" based on progress', () => {
      insertShow(40, 'Still Watching Show');
      insertLib(40, 'watching');
      insertEpisode(4000, 40, 1, 1, YESTERDAY);
      insertEpisode(4001, 40, 1, 2, YESTERDAY);
      insertWatch(4000, 40, '2024-01-01 00:00:00');

      insertShow(41, 'Caught Up Show');
      insertLib(41, 'watching');
      insertEpisode(4100, 41, 1, 1, YESTERDAY);
      insertWatch(4100, 41, '2024-01-01 00:00:00');

      const grouped = getLibraryGrouped();
      expect(grouped.watching.map(r => r.show.tmdbId)).toEqual([40]);
      expect(grouped.up_to_date.map(r => r.show.tmdbId)).toEqual([41]);
    });

    it('maps stored for_later/finished/stopped to their own groups', () => {
      insertShow(42, 'For Later');
      insertLib(42, 'for_later');
      insertShow(43, 'Finished');
      insertLib(43, 'finished');
      insertShow(44, 'Stopped');
      insertLib(44, 'stopped');

      const grouped = getLibraryGrouped();
      expect(grouped.for_later.map(r => r.show.tmdbId)).toEqual([42]);
      expect(grouped.finished.map(r => r.show.tmdbId)).toEqual([43]);
      expect(grouped.stopped.map(r => r.show.tmdbId)).toEqual([44]);
    });

    it('still includes archived shows under their stored group (archived only suppresses watch-next/upcoming)', () => {
      insertShow(45, 'Archived But Grouped');
      insertLib(45, 'stopped', 1); // archived=1

      const grouped = getLibraryGrouped();
      expect(grouped.stopped.map(r => r.show.tmdbId)).toEqual([45]);
    });
  });
});
