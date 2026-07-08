import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, resetDbForTests } from '../src/db';
import { shows, episodes, movies, libraryShows, watches } from '../src/db/schema';
import { getStats } from '../src/lib/stats';

// --- seed helpers ---
function insertShow(id: number, opts: { name?: string; genres?: string[]; episodeRunTime?: number | null } = {}): void {
  getDb()
    .insert(shows)
    .values({
      tmdbId: id,
      name: opts.name ?? `Show ${id}`,
      genres: opts.genres ? JSON.stringify(opts.genres) : null,
      episodeRunTime: opts.episodeRunTime ?? null,
    })
    .run();
}
function insertEpisode(id: number, showId: number, opts: { seasonNumber?: number; episodeNumber?: number; runtime?: number | null } = {}): void {
  getDb()
    .insert(episodes)
    .values({
      tmdbId: id,
      showId,
      seasonNumber: opts.seasonNumber ?? 1,
      episodeNumber: opts.episodeNumber ?? 1,
      runtime: opts.runtime ?? null,
    })
    .run();
}
function insertMovie(id: number, opts: { title?: string; genres?: string[]; runtime?: number | null } = {}): void {
  getDb()
    .insert(movies)
    .values({
      tmdbId: id,
      title: opts.title ?? `Movie ${id}`,
      genres: opts.genres ? JSON.stringify(opts.genres) : null,
      runtime: opts.runtime ?? null,
    })
    .run();
}
function insertLib(showId: number, status: string): void {
  getDb().insert(libraryShows).values({ showId, status, addedAt: '2020-01-01 00:00:00' }).run();
}
function insertEpisodeWatch(episodeId: number, showId: number, watchedAt: string, rewatchIndex = 0): void {
  getDb().insert(watches).values({ kind: 'episode', episodeId, showId, watchedAt, rewatchIndex }).run();
}
function insertMovieWatch(movieId: number, watchedAt: string, rewatchIndex = 0): void {
  getDb().insert(watches).values({ kind: 'movie', movieId, watchedAt, rewatchIndex }).run();
}

// --- date helpers relative to real "now" so the 24-month window never goes stale ---
function monthsAgo(n: number, day = 15): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, day, 10, 0, 0));
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
function monthKeyAgo(n: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

describe('getStats', () => {
  beforeEach(() => resetDbForTests());

  it('returns zeroed/empty stats on an empty database, byMonth still has 24 zero rows', () => {
    const stats = getStats();
    expect(stats.totalMinutes).toBe(0);
    expect(stats.episodesWatched).toBe(0);
    expect(stats.moviesWatched).toBe(0);
    expect(stats.showsFinished).toBe(0);
    expect(stats.topShows).toEqual([]);
    expect(stats.topGenres).toEqual([]);
    expect(stats.firstWatchAt).toBeNull();
    expect(stats.streakDays).toBe(0);
    expect(stats.byMonth).toHaveLength(24);
    expect(stats.byMonth.every(m => m.episodes === 0 && m.movies === 0)).toBe(true);
    expect(stats.byMonth[0].month).toBe(monthKeyAgo(23));
    expect(stats.byMonth[23].month).toBe(monthKeyAgo(0));
  });

  it('runtime fallback chain: episode.runtime wins, then show.episodeRunTime, then default 40; movie.runtime falls back to 0', () => {
    // episode.runtime present -> wins over show.episodeRunTime
    insertShow(1, { episodeRunTime: 30 });
    insertEpisode(100, 1, { runtime: 55 });
    insertEpisodeWatch(100, 1, '2024-01-01 00:00:00');

    // episode.runtime null -> falls back to show.episodeRunTime
    insertShow(2, { episodeRunTime: 30 });
    insertEpisode(200, 2, { runtime: null });
    insertEpisodeWatch(200, 2, '2024-01-01 00:00:00');

    // both null -> default 40
    insertShow(3, { episodeRunTime: null });
    insertEpisode(300, 3, { runtime: null });
    insertEpisodeWatch(300, 3, '2024-01-01 00:00:00');

    // movie.runtime present
    insertMovie(400, { runtime: 120 });
    insertMovieWatch(400, '2024-01-01 00:00:00');

    // movie.runtime null -> falls back to 0
    insertMovie(500, { runtime: null });
    insertMovieWatch(500, '2024-01-01 00:00:00');

    const stats = getStats();
    expect(stats.totalMinutes).toBe(55 + 30 + 40 + 120 + 0);
    expect(stats.episodesWatched).toBe(3);
    expect(stats.moviesWatched).toBe(2);
  });

  it('rewatches count toward totalMinutes and episodesWatched/moviesWatched', () => {
    insertShow(1, { episodeRunTime: 45 });
    insertEpisode(100, 1, { runtime: null });
    insertEpisodeWatch(100, 1, '2024-01-01 00:00:00', 0);
    insertEpisodeWatch(100, 1, '2024-02-01 00:00:00', 1); // rewatch

    insertMovie(200, { runtime: 90 });
    insertMovieWatch(200, '2024-01-01 00:00:00', 0);
    insertMovieWatch(200, '2024-03-01 00:00:00', 1); // rewatch

    const stats = getStats();
    expect(stats.episodesWatched).toBe(2);
    expect(stats.moviesWatched).toBe(2);
    expect(stats.totalMinutes).toBe(45 * 2 + 90 * 2);
  });

  it('showsFinished counts library shows with status "finished" only', () => {
    insertShow(1);
    insertLib(1, 'finished');
    insertShow(2);
    insertLib(2, 'finished');
    insertShow(3);
    insertLib(3, 'watching');

    expect(getStats().showsFinished).toBe(2);
  });

  it('topShows ranks by total minutes desc, reports per-show episode counts, and caps at 10', () => {
    for (let i = 1; i <= 12; i++) {
      const runtime = (13 - i) * 10; // show 1 has the highest runtime, show 12 the lowest
      insertShow(i, { episodeRunTime: runtime });
      insertEpisode(i * 100, i, { runtime: null });
      insertEpisodeWatch(i * 100, i, '2024-01-01 00:00:00');
    }
    // show 1 gets a second watched episode to bump its episode count
    insertEpisode(1001, 1, { episodeNumber: 2, runtime: null });
    insertEpisodeWatch(1001, 1, '2024-01-02 00:00:00');

    const stats = getStats();
    expect(stats.topShows).toHaveLength(10);
    expect(stats.topShows[0].show.tmdbId).toBe(1);
    expect(stats.topShows[0].minutes).toBe(120 * 2); // two episodes at 120 min each
    expect(stats.topShows[0].episodes).toBe(2);
    expect(stats.topShows[9].show.tmdbId).toBe(10);
    // shows 11 and 12 (lowest minutes) are excluded by the top-10 cap
    expect(stats.topShows.map(s => s.show.tmdbId)).not.toContain(11);
    expect(stats.topShows.map(s => s.show.tmdbId)).not.toContain(12);
  });

  it('topGenres counts each watched show/movie once per genre, not once per episode', () => {
    insertShow(1, { genres: ['Drama', 'Action'] });
    insertEpisode(100, 1, { episodeNumber: 1, runtime: null });
    insertEpisode(101, 1, { episodeNumber: 2, runtime: null });
    insertEpisode(102, 1, { episodeNumber: 3, runtime: null });
    insertEpisodeWatch(100, 1, '2024-01-01 00:00:00');
    insertEpisodeWatch(101, 1, '2024-01-02 00:00:00');
    insertEpisodeWatch(102, 1, '2024-01-03 00:00:00');

    insertMovie(200, { genres: ['Drama'] });
    insertMovieWatch(200, '2024-01-01 00:00:00');

    const stats = getStats();
    const drama = stats.topGenres.find(g => g.genre === 'Drama');
    const action = stats.topGenres.find(g => g.genre === 'Action');
    expect(drama?.count).toBe(2); // 1 show + 1 movie, not 3 episodes + 1 movie
    expect(action?.count).toBe(1);
  });

  it('topGenres caps at 8', () => {
    for (let i = 1; i <= 9; i++) {
      insertShow(i, { genres: [`Genre${i}`] });
      insertEpisode(i * 100, i, { runtime: null });
      insertEpisodeWatch(i * 100, i, '2024-01-01 00:00:00');
    }
    expect(getStats().topGenres).toHaveLength(8);
  });

  it('byMonth covers the last 24 months (oldest first), zero-fills gaps, and excludes watches older than the window from its buckets (though they still count toward totals)', () => {
    insertShow(1, { episodeRunTime: 40 });
    insertEpisode(100, 1, { runtime: null });
    insertEpisodeWatch(100, 1, monthsAgo(0)); // current month
    insertEpisode(101, 1, { episodeNumber: 2, runtime: null });
    insertEpisodeWatch(101, 1, monthsAgo(23)); // oldest month still inside the window

    insertMovie(200, { runtime: 100 });
    insertMovieWatch(200, monthsAgo(5));

    // outside the 24-month window: still counted in totals, but not in byMonth buckets
    insertEpisode(102, 1, { episodeNumber: 3, runtime: null });
    insertEpisodeWatch(102, 1, monthsAgo(24));

    const stats = getStats();
    expect(stats.byMonth).toHaveLength(24);
    expect(stats.byMonth[0].month).toBe(monthKeyAgo(23));
    expect(stats.byMonth[23].month).toBe(monthKeyAgo(0));
    expect(stats.byMonth[23].episodes).toBe(1);
    expect(stats.byMonth[23].movies).toBe(0);
    expect(stats.byMonth[0].episodes).toBe(1);
    expect(stats.byMonth[18].movies).toBe(1); // monthsAgo(5) -> index 23-5

    const totalBucketedEpisodes = stats.byMonth.reduce((sum, m) => sum + m.episodes, 0);
    const totalBucketedMovies = stats.byMonth.reduce((sum, m) => sum + m.movies, 0);
    expect(totalBucketedEpisodes).toBe(2); // the monthsAgo(24) watch is excluded from byMonth
    expect(totalBucketedMovies).toBe(1);

    // but the old watch still counts toward the global totals
    expect(stats.episodesWatched).toBe(3);
  });

  it('firstWatchAt is the earliest watchedAt across all watches, or null when there are none', () => {
    expect(getStats().firstWatchAt).toBeNull();

    insertShow(1, { episodeRunTime: 40 });
    insertEpisode(100, 1, { runtime: null });
    insertEpisodeWatch(100, 1, '2024-06-01 00:00:00');
    insertMovie(200, { runtime: 90 });
    insertMovieWatch(200, '2024-01-15 00:00:00');

    expect(getStats().firstWatchAt).toBe('2024-01-15 00:00:00');
  });

  it('streakDays finds the longest run of consecutive UTC days, including across a month boundary', () => {
    insertShow(1, { episodeRunTime: 40 });
    insertEpisode(100, 1, { runtime: null });
    insertMovie(900, { runtime: 90 });

    // 3-day run crossing a month boundary: Jan 30, Jan 31, Feb 1
    insertMovieWatch(900, '2024-01-30 10:00:00', 0);
    insertEpisodeWatch(100, 1, '2024-01-31 10:00:00', 0);
    insertEpisodeWatch(100, 1, '2024-02-01 10:00:00', 1);

    // isolated day, breaks the streak
    insertEpisodeWatch(100, 1, '2024-02-05 10:00:00', 2);

    // longer 4-day run elsewhere, should win
    insertEpisodeWatch(100, 1, '2024-03-10 10:00:00', 3);
    insertEpisodeWatch(100, 1, '2024-03-11 10:00:00', 4);
    insertEpisodeWatch(100, 1, '2024-03-12 10:00:00', 5);
    insertEpisodeWatch(100, 1, '2024-03-13 10:00:00', 6);

    expect(getStats().streakDays).toBe(4);
  });

  it('streakDays is 1 when there are watches but no two consecutive days', () => {
    insertShow(1, { episodeRunTime: 40 });
    insertEpisode(100, 1, { runtime: null });
    insertEpisodeWatch(100, 1, '2024-01-01 00:00:00');
    insertEpisodeWatch(100, 1, '2024-01-10 00:00:00', 1);

    expect(getStats().streakDays).toBe(1);
  });
});
