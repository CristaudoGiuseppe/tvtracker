import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetDbForTests } from '../src/db';

vi.mock('../src/lib/tmdb', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/tmdb')>('../src/lib/tmdb');
  return {
    ...actual,
    findByTvdbId: vi.fn(),
    searchMovies: vi.fn(),
  };
});

import { findByTvdbId, searchMovies, TmdbError, type TmdbSearchResult } from '../src/lib/tmdb';
import { matchExport, resolveManualMatch } from '../src/lib/importer/match';
import type { ParsedExport } from '../src/lib/importer/parse';

function emptyParsed(): ParsedExport {
  return { episodeWatches: [], showFollows: [], movieWatches: [], movieWatchlist: [], warnings: [] };
}

function movieResult(id: number, title: string): TmdbSearchResult {
  return { id, kind: 'movie', name: title, poster_path: null, release_date: '2020-01-01', vote_average: 7, overview: '' };
}

describe('matchExport', () => {
  beforeEach(() => {
    resetDbForTests();
    vi.mocked(findByTvdbId).mockReset();
    vi.mocked(searchMovies).mockReset();
  });

  describe('shows', () => {
    it('matches known tvdb ids and reports unknown ones as unmatched', async () => {
      vi.mocked(findByTvdbId).mockImplementation(async (id: number) => ({
        tvId: id === 100 ? 555 : null,
      }));
      const parsed = emptyParsed();
      parsed.episodeWatches.push({ tvdbSeriesId: 100, seriesName: 'Known', season: 1, episode: 1, watchedAt: 'x', isRewatch: false });
      parsed.showFollows.push({ tvdbSeriesId: 200, seriesName: 'Unknown', isForLater: false, isArchived: false, followedAt: 'x' });

      const result = await matchExport(parsed);
      expect(result.shows).toContainEqual({ tvdbSeriesId: 100, seriesName: 'Known', tmdbId: 555 });
      expect(result.shows).toContainEqual({ tvdbSeriesId: 200, seriesName: 'Unknown', tmdbId: null });
      expect(result.unmatchedShows).toEqual(['Unknown']);
    });

    it('dedups shows across episodeWatches and showFollows (one lookup each)', async () => {
      vi.mocked(findByTvdbId).mockResolvedValue({ tvId: 42 });
      const parsed = emptyParsed();
      parsed.episodeWatches.push({ tvdbSeriesId: 7, seriesName: 'Dup', season: 1, episode: 1, watchedAt: 'x', isRewatch: false });
      parsed.showFollows.push({ tvdbSeriesId: 7, seriesName: 'Dup', isForLater: false, isArchived: false, followedAt: 'x' });

      const result = await matchExport(parsed);
      expect(result.shows).toHaveLength(1);
      expect(vi.mocked(findByTvdbId)).toHaveBeenCalledTimes(1);
    });

    it('a settings override wins over findByTvdbId', async () => {
      vi.mocked(findByTvdbId).mockResolvedValue({ tvId: 999 });
      resolveManualMatch(300, 12345);
      const parsed = emptyParsed();
      parsed.showFollows.push({ tvdbSeriesId: 300, seriesName: 'Overridden', isForLater: false, isArchived: false, followedAt: 'x' });

      const result = await matchExport(parsed);
      expect(result.shows[0].tmdbId).toBe(12345);
      expect(vi.mocked(findByTvdbId)).not.toHaveBeenCalled();
    });

    it('a TmdbError during a lookup marks that show unmatched and continues', async () => {
      vi.mocked(findByTvdbId).mockImplementation(async (id: number) => {
        if (id === 1) throw new TmdbError('boom', 500);
        return { tvId: 88 };
      });
      const parsed = emptyParsed();
      parsed.showFollows.push({ tvdbSeriesId: 1, seriesName: 'Boom', isForLater: false, isArchived: false, followedAt: 'x' });
      parsed.showFollows.push({ tvdbSeriesId: 2, seriesName: 'Fine', isForLater: false, isArchived: false, followedAt: 'x' });

      const result = await matchExport(parsed);
      expect(result.unmatchedShows).toEqual(['Boom']);
      expect(result.shows.find(s => s.tvdbSeriesId === 2)?.tmdbId).toBe(88);
    });
  });

  describe('movies', () => {
    it('picks the case-insensitive exact title match', async () => {
      vi.mocked(searchMovies).mockResolvedValue([
        movieResult(1, 'The Batman Begins'),
        movieResult(2, 'batman'),
        movieResult(3, 'Batman Returns'),
      ]);
      const parsed = emptyParsed();
      parsed.movieWatches.push({ movieName: 'Batman', releaseYear: 2005, runtimeMin: 120, watchedAt: 'x', rewatchCount: 0 });

      const result = await matchExport(parsed);
      expect(result.movies[0].tmdbId).toBe(2);
    });

    it('falls back to the sole result when no exact title matches', async () => {
      vi.mocked(searchMovies).mockResolvedValue([movieResult(9, 'Something Else')]);
      const parsed = emptyParsed();
      parsed.movieWatchlist.push({ movieName: 'Query', releaseYear: null, addedAt: 'x' });

      const result = await matchExport(parsed);
      expect(result.movies[0].tmdbId).toBe(9);
    });

    it('reports unmatched when multiple results and none match exactly', async () => {
      vi.mocked(searchMovies).mockResolvedValue([movieResult(1, 'A'), movieResult(2, 'B')]);
      const parsed = emptyParsed();
      parsed.movieWatches.push({ movieName: 'Nope', releaseYear: null, runtimeMin: null, watchedAt: 'x', rewatchCount: 0 });

      const result = await matchExport(parsed);
      expect(result.movies[0].tmdbId).toBeNull();
      expect(result.unmatchedMovies).toEqual(['Nope']);
    });

    it('a movie override wins over searchMovies', async () => {
      vi.mocked(searchMovies).mockResolvedValue([movieResult(1, 'Inception')]);
      // override key uses lowercased name + |year
      const { getDb } = await import('../src/db');
      const { settings } = await import('../src/db/schema');
      getDb().insert(settings).values({ key: 'import.override.movie.inception|2010', value: '27205' }).run();

      const parsed = emptyParsed();
      parsed.movieWatches.push({ movieName: 'Inception', releaseYear: 2010, runtimeMin: 148, watchedAt: 'x', rewatchCount: 0 });

      const result = await matchExport(parsed);
      expect(result.movies[0].tmdbId).toBe(27205);
      expect(vi.mocked(searchMovies)).not.toHaveBeenCalled();
    });

    it('dedups movies across watches and watchlist by name|year', async () => {
      vi.mocked(searchMovies).mockResolvedValue([movieResult(5, 'Dune')]);
      const parsed = emptyParsed();
      parsed.movieWatches.push({ movieName: 'Dune', releaseYear: 2021, runtimeMin: 155, watchedAt: 'x', rewatchCount: 0 });
      parsed.movieWatchlist.push({ movieName: 'Dune', releaseYear: 2021, addedAt: 'x' });

      const result = await matchExport(parsed);
      expect(result.movies).toHaveLength(1);
      expect(vi.mocked(searchMovies)).toHaveBeenCalledTimes(1);
    });
  });
});
