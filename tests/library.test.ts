import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDb, resetDbForTests } from '../src/db';
import { shows, seasons, episodes, libraryShows, libraryMovies, watches, ratings, movies } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import type { TmdbShowFull, TmdbMovie } from '../src/lib/tmdb';

vi.mock('../src/lib/tmdb', () => ({
  getShowFull: vi.fn(),
  getMovie: vi.fn(),
  getWatchProviders: vi.fn(),
}));

import { getShowFull, getMovie, getWatchProviders } from '../src/lib/tmdb';
import {
  addShow,
  upsertShowMetadata,
  setShowStatus,
  toggleFavorite,
  removeShow,
  checkInEpisode,
  uncheckEpisode,
  markSeasonWatched,
  markShowWatched,
  addMovie,
  setMovieState,
  checkInMovie,
  refreshProviders,
  rate,
  nowUtc,
  type LibStatus,
} from '../src/lib/library';

const fixtureProviders = {
  region: 'IT',
  link: 'https://tmdb/watch',
  flatrate: [{ id: 8, name: 'Netflix', logoPath: '/net.jpg' }],
  rent: [],
  buy: [],
};

const SHOW_ID = 5001;

const fixtureShow: TmdbShowFull = {
  id: SHOW_ID,
  name: 'Test Show',
  overview: 'A test show',
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  status: 'Returning Series',
  genres: [{ name: 'Drama' }, { name: 'Sci-Fi' }],
  episode_run_time: [45],
  seasons: [
    {
      season_number: 0,
      name: 'Specials',
      poster_path: null,
      episode_count: 1,
      air_date: '2019-01-01',
      episodes: [
        { id: 10000, season_number: 0, episode_number: 1, name: 'Special 1', overview: '', still_path: null, air_date: '2019-01-01', runtime: 10 },
      ],
    },
    {
      season_number: 1,
      name: 'Season 1',
      poster_path: '/s1.jpg',
      episode_count: 2,
      air_date: '2020-01-01',
      episodes: [
        { id: 10001, season_number: 1, episode_number: 1, name: 'Ep1', overview: '...', still_path: null, air_date: '2020-01-01', runtime: 45 },
        { id: 10002, season_number: 1, episode_number: 2, name: 'Ep2', overview: '...', still_path: null, air_date: '2020-01-08', runtime: 45 },
      ],
    },
    {
      season_number: 2,
      name: 'Season 2',
      poster_path: '/s2.jpg',
      episode_count: 1,
      air_date: '2099-01-01',
      episodes: [
        { id: 10003, season_number: 2, episode_number: 1, name: 'Ep3 (future)', overview: '...', still_path: null, air_date: '2099-01-01', runtime: 45 },
      ],
    },
  ],
};

const fixtureMovie: TmdbMovie = {
  id: 6001,
  title: 'Test Movie',
  overview: 'A test movie',
  poster_path: '/mposter.jpg',
  backdrop_path: '/mbackdrop.jpg',
  genres: [{ name: 'Action' }],
  runtime: 120,
  release_date: '2021-05-05',
};

describe('library', () => {
  beforeEach(() => {
    resetDbForTests();
    vi.mocked(getShowFull).mockReset().mockResolvedValue(fixtureShow);
    vi.mocked(getMovie).mockReset().mockResolvedValue(fixtureMovie);
    vi.mocked(getWatchProviders).mockReset().mockResolvedValue(fixtureProviders);
  });

  describe('nowUtc', () => {
    it('produces YYYY-MM-DD HH:MM:SS format', () => {
      expect(nowUtc()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('addShow', () => {
    it('caches all episodes, seasons, and show metadata', async () => {
      await addShow(SHOW_ID);
      const db = getDb();

      const showRow = db.select().from(shows).where(eq(shows.tmdbId, SHOW_ID)).get();
      expect(showRow?.name).toBe('Test Show');
      expect(showRow?.episodeRunTime).toBe(45);
      expect(JSON.parse(showRow!.genres!)).toEqual(['Drama', 'Sci-Fi']);

      const seasonRows = db.select().from(seasons).where(eq(seasons.showId, SHOW_ID)).all();
      expect(seasonRows).toHaveLength(3);

      const episodeRows = db.select().from(episodes).where(eq(episodes.showId, SHOW_ID)).all();
      expect(episodeRows).toHaveLength(4);
    });

    it('inserts a library_shows row defaulting to watching', async () => {
      await addShow(SHOW_ID);
      const db = getDb();
      const libRow = db.select().from(libraryShows).where(eq(libraryShows.showId, SHOW_ID)).get();
      expect(libRow?.status).toBe('watching');
    });

    it('respects an explicit status', async () => {
      await addShow(SHOW_ID, 'for_later');
      const db = getDb();
      const libRow = db.select().from(libraryShows).where(eq(libraryShows.showId, SHOW_ID)).get();
      expect(libRow?.status).toBe('for_later');
    });

    it('is idempotent: double addShow does not duplicate rows nor lose existing status', async () => {
      await addShow(SHOW_ID);
      setShowStatus(SHOW_ID, 'stopped');
      await addShow(SHOW_ID); // second call, default status 'watching' should NOT override

      const db = getDb();
      const libRows = db.select().from(libraryShows).where(eq(libraryShows.showId, SHOW_ID)).all();
      expect(libRows).toHaveLength(1);
      expect(libRows[0].status).toBe('stopped');

      const episodeRows = db.select().from(episodes).where(eq(episodes.showId, SHOW_ID)).all();
      expect(episodeRows).toHaveLength(4);
    });

    it('stores fetched watch providers as JSON on the show row', async () => {
      await addShow(SHOW_ID);
      const row = getDb().select().from(shows).where(eq(shows.tmdbId, SHOW_ID)).get();
      expect(JSON.parse(row!.watchProviders!)).toEqual(fixtureProviders);
    });

    it('tolerates a providers fetch failure: adds the show with null providers', async () => {
      vi.mocked(getWatchProviders).mockRejectedValueOnce(new Error('tmdb down'));
      await addShow(SHOW_ID);
      const row = getDb().select().from(shows).where(eq(shows.tmdbId, SHOW_ID)).get();
      expect(row?.watchProviders).toBeNull();
      expect(getDb().select().from(libraryShows).where(eq(libraryShows.showId, SHOW_ID)).get()).toBeTruthy();
    });
  });

  describe('refreshProviders', () => {
    it('populates providers and returns true; region-miss stores null and returns false', async () => {
      await addShow(SHOW_ID);
      getDb().update(shows).set({ watchProviders: null }).where(eq(shows.tmdbId, SHOW_ID)).run();

      const ok = await refreshProviders('tv', SHOW_ID);
      expect(ok).toBe(true);
      expect(JSON.parse(getDb().select().from(shows).where(eq(shows.tmdbId, SHOW_ID)).get()!.watchProviders!)).toEqual(fixtureProviders);

      vi.mocked(getWatchProviders).mockResolvedValueOnce(null);
      const miss = await refreshProviders('tv', SHOW_ID);
      expect(miss).toBe(false);
      expect(getDb().select().from(shows).where(eq(shows.tmdbId, SHOW_ID)).get()!.watchProviders).toBeNull();
    });

    it('preserves existing providers when the fetch errors', async () => {
      await addShow(SHOW_ID);
      vi.mocked(getWatchProviders).mockRejectedValueOnce(new Error('tmdb down'));

      const ok = await refreshProviders('tv', SHOW_ID);
      expect(ok).toBe(false);
      expect(getDb().select().from(shows).where(eq(shows.tmdbId, SHOW_ID)).get()!.watchProviders).not.toBeNull();
    });
  });

  describe('upsertShowMetadata', () => {
    it('is safe to re-run and updates changed fields', () => {
      upsertShowMetadata(fixtureShow);
      upsertShowMetadata({ ...fixtureShow, name: 'Renamed Show' });

      const db = getDb();
      const rows = db.select().from(shows).where(eq(shows.tmdbId, SHOW_ID)).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Renamed Show');
    });
  });

  describe('setShowStatus / toggleFavorite', () => {
    it('updates status', async () => {
      await addShow(SHOW_ID);
      setShowStatus(SHOW_ID, 'finished');
      const db = getDb();
      expect(db.select().from(libraryShows).where(eq(libraryShows.showId, SHOW_ID)).get()?.status).toBe('finished');
    });

    it('toggles favorite on and off', async () => {
      await addShow(SHOW_ID);
      const db = getDb();
      expect(db.select().from(libraryShows).where(eq(libraryShows.showId, SHOW_ID)).get()?.isFavorite).toBe(0);
      toggleFavorite(SHOW_ID);
      expect(db.select().from(libraryShows).where(eq(libraryShows.showId, SHOW_ID)).get()?.isFavorite).toBe(1);
      toggleFavorite(SHOW_ID);
      expect(db.select().from(libraryShows).where(eq(libraryShows.showId, SHOW_ID)).get()?.isFavorite).toBe(0);
    });
  });

  describe('checkInEpisode / uncheckEpisode', () => {
    it('sets the denormalized showId on the watch row', async () => {
      await addShow(SHOW_ID);
      checkInEpisode(10001);
      const db = getDb();
      const watchRows = db.select().from(watches).where(eq(watches.episodeId, 10001)).all();
      expect(watchRows).toHaveLength(1);
      expect(watchRows[0].showId).toBe(SHOW_ID);
      expect(watchRows[0].rewatchIndex).toBe(0);
    });

    it('checking in twice creates a rewatch with rewatchIndex 1', async () => {
      await addShow(SHOW_ID);
      checkInEpisode(10001);
      checkInEpisode(10001);
      const db = getDb();
      const watchRows = db.select().from(watches).where(eq(watches.episodeId, 10001)).all();
      expect(watchRows.map(w => w.rewatchIndex).sort()).toEqual([0, 1]);
    });

    it('uses a custom watchedAt when provided', async () => {
      await addShow(SHOW_ID);
      checkInEpisode(10001, '2022-06-01 10:00:00');
      const db = getDb();
      expect(db.select().from(watches).where(eq(watches.episodeId, 10001)).get()?.watchedAt).toBe('2022-06-01 10:00:00');
    });

    it('uncheck removes the highest-rewatchIndex row first', async () => {
      await addShow(SHOW_ID);
      checkInEpisode(10001);
      checkInEpisode(10001);
      uncheckEpisode(10001);
      const db = getDb();
      const watchRows = db.select().from(watches).where(eq(watches.episodeId, 10001)).all();
      expect(watchRows).toHaveLength(1);
      expect(watchRows[0].rewatchIndex).toBe(0);
    });

    it('uncheck on a fully-unwatched episode is a no-op', async () => {
      await addShow(SHOW_ID);
      expect(() => uncheckEpisode(10001)).not.toThrow();
      const db = getDb();
      expect(db.select().from(watches).where(eq(watches.episodeId, 10001)).all()).toHaveLength(0);
    });
  });

  describe('markSeasonWatched', () => {
    it('skips already-watched episodes (no rewatch created)', async () => {
      await addShow(SHOW_ID);
      checkInEpisode(10001);
      markSeasonWatched(SHOW_ID, 1);
      const db = getDb();
      expect(db.select().from(watches).where(eq(watches.episodeId, 10001)).all()).toHaveLength(1);
      expect(db.select().from(watches).where(eq(watches.episodeId, 10002)).all()).toHaveLength(1);
    });

    it('skips unaired episodes', async () => {
      await addShow(SHOW_ID);
      markSeasonWatched(SHOW_ID, 2); // season 2 only has the future episode
      const db = getDb();
      expect(db.select().from(watches).where(eq(watches.episodeId, 10003)).all()).toHaveLength(0);
    });

    it('markSeasonWatched(showId, 0) explicitly checks in specials', async () => {
      await addShow(SHOW_ID);
      markSeasonWatched(SHOW_ID, 0);
      const db = getDb();
      expect(db.select().from(watches).where(eq(watches.episodeId, 10000)).all()).toHaveLength(1);
    });
  });

  describe('markShowWatched', () => {
    it('checks in all aired episodes except season 0, and sets status finished', async () => {
      await addShow(SHOW_ID);
      markShowWatched(SHOW_ID);
      const db = getDb();

      // season 0 special: excluded
      expect(db.select().from(watches).where(eq(watches.episodeId, 10000)).all()).toHaveLength(0);
      // season 1: aired, checked in
      expect(db.select().from(watches).where(eq(watches.episodeId, 10001)).all()).toHaveLength(1);
      expect(db.select().from(watches).where(eq(watches.episodeId, 10002)).all()).toHaveLength(1);
      // season 2: future, not checked in
      expect(db.select().from(watches).where(eq(watches.episodeId, 10003)).all()).toHaveLength(0);

      expect(db.select().from(libraryShows).where(eq(libraryShows.showId, SHOW_ID)).get()?.status).toBe('finished');
    });
  });

  describe('removeShow', () => {
    it('deletes the library row and the show watches/ratings, keeps cached metadata', async () => {
      await addShow(SHOW_ID);
      checkInEpisode(10001);
      rate('show', SHOW_ID, 8);
      rate('episode', 10001, 9);

      removeShow(SHOW_ID);
      const db = getDb();

      expect(db.select().from(libraryShows).where(eq(libraryShows.showId, SHOW_ID)).all()).toHaveLength(0);
      expect(db.select().from(watches).where(eq(watches.episodeId, 10001)).all()).toHaveLength(0);
      expect(db.select().from(ratings).where(and(eq(ratings.kind, 'show'), eq(ratings.targetId, SHOW_ID))).all()).toHaveLength(0);
      expect(db.select().from(ratings).where(and(eq(ratings.kind, 'episode'), eq(ratings.targetId, 10001))).all()).toHaveLength(0);

      // metadata stays cached
      expect(db.select().from(shows).where(eq(shows.tmdbId, SHOW_ID)).get()).toBeDefined();
      expect(db.select().from(episodes).where(eq(episodes.showId, SHOW_ID)).all()).toHaveLength(4);
    });
  });

  describe('movies', () => {
    it('addMovie caches metadata and inserts a watchlist library row', async () => {
      await addMovie(6001, 'watchlist');
      const db = getDb();
      expect(db.select().from(movies).where(eq(movies.tmdbId, 6001)).get()?.title).toBe('Test Movie');
      expect(db.select().from(libraryMovies).where(eq(libraryMovies.movieId, 6001)).get()?.state).toBe('watchlist');
      expect(db.select().from(watches).where(eq(watches.movieId, 6001)).all()).toHaveLength(0);
      expect(JSON.parse(db.select().from(movies).where(eq(movies.tmdbId, 6001)).get()!.watchProviders!)).toEqual(fixtureProviders);
    });

    it('addMovie with watched state also checks in a watch', async () => {
      await addMovie(6001, 'watched', '2022-01-01 12:00:00');
      const db = getDb();
      const watchRows = db.select().from(watches).where(eq(watches.movieId, 6001)).all();
      expect(watchRows).toHaveLength(1);
      expect(watchRows[0].watchedAt).toBe('2022-01-01 12:00:00');
    });

    it('is idempotent: double addMovie does not duplicate library row or watch', async () => {
      await addMovie(6001, 'watched');
      await addMovie(6001, 'watched');
      const db = getDb();
      expect(db.select().from(libraryMovies).where(eq(libraryMovies.movieId, 6001)).all()).toHaveLength(1);
      expect(db.select().from(watches).where(eq(watches.movieId, 6001)).all()).toHaveLength(1);
    });

    it('setMovieState updates state', async () => {
      await addMovie(6001, 'watchlist');
      setMovieState(6001, 'watched');
      const db = getDb();
      expect(db.select().from(libraryMovies).where(eq(libraryMovies.movieId, 6001)).get()?.state).toBe('watched');
    });

    it('checkInMovie increments rewatchIndex on repeat check-ins', async () => {
      await addMovie(6001, 'watchlist');
      checkInMovie(6001);
      checkInMovie(6001);
      const db = getDb();
      const watchRows = db.select().from(watches).where(eq(watches.movieId, 6001)).all();
      expect(watchRows.map(w => w.rewatchIndex).sort()).toEqual([0, 1]);
    });
  });

  describe('rate', () => {
    it('upserts a rating instead of duplicating rows', () => {
      rate('show', SHOW_ID, 7);
      rate('show', SHOW_ID, 9);
      const db = getDb();
      const rows = db.select().from(ratings).where(and(eq(ratings.kind, 'show'), eq(ratings.targetId, SHOW_ID))).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].rating).toBe(9);
    });
  });
});
