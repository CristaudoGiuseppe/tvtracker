import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDb, resetDbForTests } from '../src/db';
import { watches, libraryShows, libraryMovies } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import type { TmdbShowFull, TmdbMovie } from '../src/lib/tmdb';

vi.mock('../src/lib/tmdb', () => {
  class TmdbError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.name = 'TmdbError';
      this.status = status;
    }
  }
  return {
    getShowFull: vi.fn(),
    getMovie: vi.fn(),
    findEpisodeByTvdbId: vi.fn(),
    TmdbError,
  };
});

import { getShowFull, getMovie, findEpisodeByTvdbId, TmdbError } from '../src/lib/tmdb';
import { dryRun, runImport } from '../src/lib/importer/run';
import type { ParsedExport } from '../src/lib/importer/parse';
import type { MatchedExport } from '../src/lib/importer/match';

const showA: TmdbShowFull = {
  id: 5001, name: 'Show A', overview: '', poster_path: null, backdrop_path: null,
  status: 'Ended', genres: [], episode_run_time: [40],
  seasons: [
    { season_number: 1, name: 'S1', poster_path: null, episode_count: 2, air_date: '2020-01-01', episodes: [
      { id: 10001, season_number: 1, episode_number: 1, name: 'E1', overview: '', still_path: null, air_date: '2020-01-01', runtime: 40 },
      { id: 10002, season_number: 1, episode_number: 2, name: 'E2', overview: '', still_path: null, air_date: '2020-01-08', runtime: 40 },
    ] },
    { season_number: 3, name: 'S3', poster_path: null, episode_count: 1, air_date: '2022-01-01', episodes: [
      { id: 10310, season_number: 3, episode_number: 10, name: 'E10', overview: '', still_path: null, air_date: '2022-01-01', runtime: 40 },
    ] },
  ],
};

const showB: TmdbShowFull = {
  id: 6002, name: 'Show B', overview: '', poster_path: null, backdrop_path: null,
  status: 'Returning Series', genres: [], episode_run_time: [30],
  seasons: [
    { season_number: 1, name: 'S1', poster_path: null, episode_count: 1, air_date: '2021-01-01', episodes: [
      { id: 20001, season_number: 1, episode_number: 1, name: 'B-E1', overview: '', still_path: null, air_date: '2021-01-01', runtime: 30 },
    ] },
  ],
};

const movieX: TmdbMovie = { id: 7001, title: 'Movie X', overview: '', poster_path: null, backdrop_path: null, genres: [], runtime: 100, release_date: '2020-01-01' };
const movieY: TmdbMovie = { id: 7002, title: 'Movie Y', overview: '', poster_path: null, backdrop_path: null, genres: [], runtime: 110, release_date: '2021-01-01' };

function scenario(): { parsed: ParsedExport; matched: MatchedExport } {
  const parsed: ParsedExport = {
    episodeWatches: [
      { tvdbSeriesId: 100, seriesName: 'Show A', season: 1, episode: 1, watchedAt: '2020-01-01 00:00:00', isRewatch: false, tvdbEpisodeId: null },
      { tvdbSeriesId: 100, seriesName: 'Show A', season: 1, episode: 1, watchedAt: '2021-01-01 00:00:00', isRewatch: true, tvdbEpisodeId: null },
      { tvdbSeriesId: 100, seriesName: 'Show A', season: 1, episode: 2, watchedAt: '2020-02-01 00:00:00', isRewatch: false, tvdbEpisodeId: null },
      { tvdbSeriesId: 100, seriesName: 'Show A', season: 9, episode: 9, watchedAt: '2020-03-01 00:00:00', isRewatch: false, tvdbEpisodeId: null },
    ],
    showFollows: [
      { tvdbSeriesId: 100, seriesName: 'Show A', isForLater: false, isArchived: false, followedAt: 'x' },
      { tvdbSeriesId: 200, seriesName: 'Show B', isForLater: true, isArchived: false, followedAt: 'x' },
    ],
    movieWatches: [
      { movieName: 'Movie X', releaseYear: 2020, runtimeMin: 100, watchedAt: '2022-01-01 00:00:00', rewatchCount: 0 },
    ],
    movieWatchlist: [
      { movieName: 'Movie Y', releaseYear: 2021, addedAt: '2023-01-01 00:00:00' },
    ],
    warnings: [],
  };
  const matched: MatchedExport = {
    shows: [
      { tvdbSeriesId: 100, seriesName: 'Show A', tmdbId: 5001 },
      { tvdbSeriesId: 200, seriesName: 'Show B', tmdbId: 6002 },
    ],
    movies: [
      { movieName: 'Movie X', releaseYear: 2020, tmdbId: 7001 },
      { movieName: 'Movie Y', releaseYear: 2021, tmdbId: 7002 },
    ],
    unmatchedShows: [],
    unmatchedMovies: [],
  };
  return { parsed, matched };
}

beforeEach(() => {
  resetDbForTests();
  vi.mocked(getShowFull).mockReset().mockImplementation(async (id: number) => {
    if (id === 5001) return showA;
    if (id === 6002) return showB;
    throw new Error(`unexpected show ${id}`);
  });
  vi.mocked(getMovie).mockReset().mockImplementation(async (id: number) => {
    if (id === 7001) return movieX;
    if (id === 7002) return movieY;
    throw new Error(`unexpected movie ${id}`);
  });
  vi.mocked(findEpisodeByTvdbId).mockReset().mockResolvedValue(null);
});

describe('dryRun', () => {
  it('is pure: reports counts without writing to the db or fetching', () => {
    const { parsed, matched } = scenario();
    const preview = dryRun(parsed, matched);
    expect(preview.shows).toBe(2);
    expect(preview.episodesOfMatchedShows).toBe(4); // all 4 belong to a matched show; (season,episode)->tmdb resolution happens only during runImport
    expect(preview.movies).toBe(1);
    expect(preview.watchlist).toBe(1);
    expect(preview.follows).toBe(2);
    expect(preview.unmatchedShows).toEqual([]);
    expect(preview.unmatchedMovies).toEqual([]);
    expect(vi.mocked(getShowFull)).not.toHaveBeenCalled();
    const db = getDb();
    expect(db.select().from(watches).all()).toHaveLength(0);
  });

  it('excludes unmatched shows/movies from importable counts', () => {
    const { parsed, matched } = scenario();
    matched.shows[1].tmdbId = null;
    matched.unmatchedShows = ['Show B'];
    matched.movies[1].tmdbId = null;
    matched.unmatchedMovies = ['Movie Y'];
    const preview = dryRun(parsed, matched);
    expect(preview.shows).toBe(1);
    expect(preview.follows).toBe(1);
    expect(preview.watchlist).toBe(0);
    expect(preview.unmatchedShows).toEqual(['Show B']);
    expect(preview.unmatchedMovies).toEqual(['Movie Y']);
  });
});

describe('runImport', () => {
  it('imports shows, episodes, movies and watchlist; reports episode mismatches', async () => {
    const { parsed, matched } = scenario();
    const report = await runImport(parsed, matched);
    const db = getDb();

    expect(report.imported.shows).toBe(2);
    expect(report.imported.episodes).toBe(3); // E1 x2 + E2; S9E9 is a mismatch
    expect(report.imported.movies).toBe(1);
    expect(report.imported.watchlist).toBe(1);
    expect(report.errors).toEqual([]);

    expect(report.episodeMismatches).toEqual([
      { show: 'Show A', season: 9, episode: 9, count: 1 },
    ]);

    // rewatch indices assigned in export order for the repeated episode
    const e1 = db.select().from(watches).where(and(eq(watches.kind, 'episode'), eq(watches.episodeId, 10001))).all();
    expect(e1.map(w => w.rewatchIndex).sort()).toEqual([0, 1]);
    expect(e1.find(w => w.watchedAt === '2020-01-01 00:00:00')!.rewatchIndex).toBe(0);
    expect(e1.find(w => w.watchedAt === '2021-01-01 00:00:00')!.rewatchIndex).toBe(1);

    // movie watched + watchlist rows
    expect(db.select().from(watches).where(eq(watches.movieId, 7001)).all()).toHaveLength(1);
    expect(db.select().from(libraryMovies).where(eq(libraryMovies.movieId, 7002)).get()?.state).toBe('watchlist');
  });

  it('maps follow status: for_later -> for_later, plain follow -> watching', async () => {
    const { parsed, matched } = scenario();
    await runImport(parsed, matched);
    const db = getDb();
    expect(db.select().from(libraryShows).where(eq(libraryShows.showId, 5001)).get()?.status).toBe('watching');
    expect(db.select().from(libraryShows).where(eq(libraryShows.showId, 6002)).get()?.status).toBe('for_later');
  });

  it('maps archived follow -> stopped', async () => {
    const { parsed, matched } = scenario();
    parsed.showFollows[1] = { tvdbSeriesId: 200, seriesName: 'Show B', isForLater: false, isArchived: true, followedAt: 'x' };
    await runImport(parsed, matched);
    const db = getDb();
    expect(db.select().from(libraryShows).where(eq(libraryShows.showId, 6002)).get()?.status).toBe('stopped');
  });

  it('is idempotent: a second run inserts 0 new rows and counts them as skipped', async () => {
    const { parsed, matched } = scenario();
    await runImport(parsed, matched);
    const db = getDb();
    const before = db.select().from(watches).all().length;

    const second = await runImport(parsed, matched);
    const after = db.select().from(watches).all().length;
    expect(after).toBe(before);
    expect(second.skippedDuplicates).toBe(3); // the 3 episode watches re-seen
  });

  it('does not downgrade a watched movie that also appears in the watchlist', async () => {
    const { parsed, matched } = scenario();
    parsed.movieWatchlist.push({ movieName: 'Movie X', releaseYear: 2020, addedAt: '2024-01-01 00:00:00' });
    await runImport(parsed, matched);
    const db = getDb();
    expect(db.select().from(libraryMovies).where(eq(libraryMovies.movieId, 7001)).get()?.state).toBe('watched');
  });

  it('inserts 1 + rewatchCount movie watch rows when rewatchCount is positive', async () => {
    const { parsed, matched } = scenario();
    parsed.movieWatches[0].rewatchCount = 2;
    await runImport(parsed, matched);
    const db = getDb();
    const rows = db.select().from(watches).where(eq(watches.movieId, 7001)).all();
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.rewatchIndex).sort()).toEqual([0, 1, 2]);
    expect(rows.every(r => r.watchedAt === '2022-01-01 00:00:00')).toBe(true);
  });

  it('upgrades a watchlist movie to watched when a later run also matches it as watched (manual-match-then-rerun)', async () => {
    const { parsed, matched } = scenario();
    await runImport(parsed, matched); // run 1: Movie Y only in the watchlist
    const db = getDb();
    expect(db.select().from(libraryMovies).where(eq(libraryMovies.movieId, 7002)).get()?.state).toBe('watchlist');

    // run 2: user fixed Movie Y's match via resolveManualMovieMatch, now it also shows up as watched
    const parsed2: ParsedExport = {
      ...parsed,
      movieWatches: [
        ...parsed.movieWatches,
        { movieName: 'Movie Y', releaseYear: 2021, runtimeMin: 110, watchedAt: '2024-01-01 00:00:00', rewatchCount: 0 },
      ],
    };
    await runImport(parsed2, matched);

    expect(db.select().from(libraryMovies).where(eq(libraryMovies.movieId, 7002)).get()?.state).toBe('watched');
    expect(db.select().from(watches).where(eq(watches.movieId, 7002)).all()).toHaveLength(1);
  });

  it('collects an error and continues when a show import throws', async () => {
    const { parsed, matched } = scenario();
    vi.mocked(getShowFull).mockImplementation(async (id: number) => {
      if (id === 5001) throw new Error('tmdb down');
      if (id === 6002) return showB;
      throw new Error(`unexpected ${id}`);
    });
    const report = await runImport(parsed, matched);
    expect(report.errors.some(e => e.includes('Show A'))).toBe(true);
    // Show B still imported despite Show A failing
    const db = getDb();
    expect(db.select().from(libraryShows).where(eq(libraryShows.showId, 6002)).get()).toBeDefined();
  });
});

describe('runImport: ep_id recovery of mismatched episodes', () => {
  // The S9E9 watch never resolves by (season,episode); recovery maps its ep_id
  // onto Show A's real S3E10 episode (tmdb id 10310), already cached by addShow.
  function recoveryScenario(tvdbEpisodeId: number | null): { parsed: ParsedExport; matched: MatchedExport } {
    const { parsed, matched } = scenario();
    parsed.episodeWatches = [
      { tvdbSeriesId: 100, seriesName: 'Show A', season: 9, episode: 9, watchedAt: '2020-03-01 00:00:00', isRewatch: false, tvdbEpisodeId },
    ];
    parsed.showFollows = [{ tvdbSeriesId: 100, seriesName: 'Show A', isForLater: false, isArchived: false, followedAt: 'x' }];
    parsed.movieWatches = [];
    parsed.movieWatchlist = [];
    matched.shows = [{ tvdbSeriesId: 100, seriesName: 'Show A', tmdbId: 5001 }];
    matched.movies = [];
    return { parsed, matched };
  }

  it('recovers a mismatched episode via its ep_id and counts it under recoveredByEpisodeId', async () => {
    const { parsed, matched } = recoveryScenario(55501);
    vi.mocked(findEpisodeByTvdbId).mockResolvedValue({
      episodeTmdbId: 10310, showTmdbId: 5001, seasonNumber: 3, episodeNumber: 10,
    });

    const report = await runImport(parsed, matched);
    const db = getDb();

    expect(report.recoveredByEpisodeId).toBe(1);
    expect(report.imported.episodes).toBe(1);
    expect(report.episodeMismatches).toEqual([]);
    expect(vi.mocked(findEpisodeByTvdbId)).toHaveBeenCalledWith(55501);

    const rows = db.select().from(watches).where(and(eq(watches.kind, 'episode'), eq(watches.episodeId, 10310))).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].showId).toBe(5001); // episode's own show
    expect(rows[0].watchedAt).toBe('2020-03-01 00:00:00');
  });

  it('keeps the row as a mismatch when find returns null', async () => {
    const { parsed, matched } = recoveryScenario(55502);
    vi.mocked(findEpisodeByTvdbId).mockResolvedValue(null);

    const report = await runImport(parsed, matched);
    expect(report.recoveredByEpisodeId).toBe(0);
    expect(report.imported.episodes).toBe(0);
    expect(report.episodeMismatches).toEqual([{ show: 'Show A', season: 9, episode: 9, count: 1 }]);
  });

  it('keeps the row as a mismatch when the resolved episode is not in the db', async () => {
    const { parsed, matched } = recoveryScenario(55503);
    vi.mocked(findEpisodeByTvdbId).mockResolvedValue({
      episodeTmdbId: 99999, showTmdbId: 12345, seasonNumber: 1, episodeNumber: 1,
    });

    const report = await runImport(parsed, matched);
    expect(report.recoveredByEpisodeId).toBe(0);
    expect(report.episodeMismatches).toEqual([{ show: 'Show A', season: 9, episode: 9, count: 1 }]);
  });

  it('never aborts on a TmdbError: keeps the mismatch, records a warning, run continues', async () => {
    const { parsed, matched } = recoveryScenario(55504);
    // add a normally-matching episode after the one that triggers the error
    parsed.episodeWatches.push(
      { tvdbSeriesId: 100, seriesName: 'Show A', season: 1, episode: 1, watchedAt: '2020-01-01 00:00:00', isRewatch: false, tvdbEpisodeId: null },
    );
    vi.mocked(findEpisodeByTvdbId).mockRejectedValue(new TmdbError('TMDB down', 500));

    const report = await runImport(parsed, matched);
    const db = getDb();

    expect(report.recoveredByEpisodeId).toBe(0);
    expect(report.episodeMismatches).toEqual([{ show: 'Show A', season: 9, episode: 9, count: 1 }]);
    expect(report.errors.some(e => /55504/.test(e))).toBe(true);
    // the following normal episode still imported
    expect(db.select().from(watches).where(eq(watches.episodeId, 10001)).all()).toHaveLength(1);
  });

  it('is idempotent: a re-run skips the recovered watch as a duplicate', async () => {
    const { parsed, matched } = recoveryScenario(55501);
    vi.mocked(findEpisodeByTvdbId).mockResolvedValue({
      episodeTmdbId: 10310, showTmdbId: 5001, seasonNumber: 3, episodeNumber: 10,
    });

    await runImport(parsed, matched);
    const db = getDb();
    const before = db.select().from(watches).all().length;

    const second = await runImport(parsed, matched);
    expect(db.select().from(watches).all().length).toBe(before);
    expect(second.recoveredByEpisodeId).toBe(0);
    expect(second.skippedDuplicates).toBe(1);
  });

  it('assigns increasing rewatchIndex to duplicate ep_id rewatch rows', async () => {
    const { parsed, matched } = recoveryScenario(55501);
    parsed.episodeWatches.push(
      { tvdbSeriesId: 100, seriesName: 'Show A', season: 9, episode: 9, watchedAt: '2021-03-01 00:00:00', isRewatch: true, tvdbEpisodeId: 55501 },
    );
    vi.mocked(findEpisodeByTvdbId).mockResolvedValue({
      episodeTmdbId: 10310, showTmdbId: 5001, seasonNumber: 3, episodeNumber: 10,
    });

    const report = await runImport(parsed, matched);
    const db = getDb();

    expect(report.recoveredByEpisodeId).toBe(2);
    const rows = db.select().from(watches).where(eq(watches.episodeId, 10310)).all();
    expect(rows.map(r => r.rewatchIndex).sort()).toEqual([0, 1]);
  });
});
