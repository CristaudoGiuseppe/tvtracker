import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseExport } from '../src/lib/importer/parse';

const FIX = join(__dirname, 'fixtures', 'tvtime');
const TINY = join(__dirname, 'fixtures', 'tvtime-tiny');
const TINY_ZIP = join(__dirname, 'fixtures', 'tvtime-tiny.zip');
const ANTMAN = join(__dirname, 'fixtures', 'tvtime-antman');

describe('parseExport', () => {
  describe('main fixture (real representative rows)', () => {
    const parsed = parseExport(FIX);

    it('parses all valid episode watches and skips the malformed row with a warning', () => {
      // 12 Trollhunters watches + 4 Walking Dead rewatches = 16; the 17th row has an
      // empty series_name and must be skipped (not thrown).
      expect(parsed.episodeWatches).toHaveLength(16);
      expect(parsed.warnings.length).toBeGreaterThanOrEqual(1);
    });

    it('flags rewatch rows via the key prefix', () => {
      const rewatches = parsed.episodeWatches.filter(e => e.isRewatch);
      expect(rewatches).toHaveLength(4);
      const twd = parsed.episodeWatches.find(
        e => e.tvdbSeriesId === 153021 && e.season === 3 && e.episode === 10,
      );
      expect(twd).toBeDefined();
      expect(twd!.isRewatch).toBe(true);
      expect(twd!.watchedAt).toBe('2020-05-30 15:54:20');
      expect(twd!.seriesName).toBe('The Walking Dead');
    });

    it('every episode watch has a numeric tvdb id and a non-empty series name', () => {
      for (const e of parsed.episodeWatches) {
        expect(Number.isFinite(e.tvdbSeriesId)).toBe(true);
        expect(e.seriesName.length).toBeGreaterThan(0);
      }
    });

    it('merges v2 follows with followed_tv_show, deduped by tvdb id (v2 wins)', () => {
      // 12 distinct v2 follows + 30 followed_tv_show rows, overlap on Futurama (73871)
      // => 41 distinct follows.
      expect(parsed.showFollows).toHaveLength(41);
      const ids = parsed.showFollows.map(f => f.tvdbSeriesId);
      expect(new Set(ids).size).toBe(ids.length); // no duplicates
      expect(ids).toContain(73871); // in both sources, appears once
    });

    it('carries for_later / archived flags on follows', () => {
      const opm = parsed.showFollows.find(f => f.tvdbSeriesId === 293088); // One-Punch Man
      expect(opm?.isForLater).toBe(true);
      const followOnly = parsed.showFollows.find(f => f.tvdbSeriesId === 71663); // The Simpsons (followed_tv_show only)
      expect(followOnly).toBeDefined();
      expect(followOnly!.isForLater).toBe(false);
      expect(followOnly!.isArchived).toBe(false);
    });

    it('parses movie watches: seconds->minutes, watch_date falls back to created_at', () => {
      expect(parsed.movieWatches).toHaveLength(12);
      const lobster = parsed.movieWatches.find(m => m.movieName === 'The Lobster');
      expect(lobster).toBeDefined();
      expect(lobster!.releaseYear).toBe(2015);
      expect(lobster!.runtimeMin).toBe(118); // 7080s / 60
      expect(lobster!.watchedAt).toBe('2024-01-02 07:16:58'); // watch_date empty -> created_at
      expect(lobster!.rewatchCount).toBe(0);
    });

    it('splits towatch rows into the watchlist', () => {
      expect(parsed.movieWatchlist).toHaveLength(8);
      const anora = parsed.movieWatchlist.find(m => m.movieName === 'Anora');
      expect(anora).toBeDefined();
      expect(anora!.releaseYear).toBe(2024);
    });

    it('does not treat legacy movie follow/episode rows as watches or watchlist', () => {
      // only watch->watches and towatch->watchlist; follow rows (redundant) are ignored.
      const names = new Set(parsed.movieWatches.map(m => m.movieName));
      // Barbie is a watch row; ensure it is present exactly once
      expect(parsed.movieWatches.filter(m => m.movieName === 'Barbie')).toHaveLength(1);
      expect(names.size).toBe(parsed.movieWatches.length);
    });
  });

  describe('tiny account (dir)', () => {
    it('parses 2 follows and 0 watches without a legacy file', () => {
      const parsed = parseExport(TINY);
      expect(parsed.episodeWatches).toHaveLength(0);
      expect(parsed.movieWatches).toHaveLength(0);
      expect(parsed.movieWatchlist).toHaveLength(0);
      expect(parsed.showFollows).toHaveLength(2);
      const ids = parsed.showFollows.map(f => f.tvdbSeriesId).sort();
      expect(ids).toEqual([355567, 365026]); // The Boys, Carnival Row
    });
  });

  describe('tiny account (zip)', () => {
    it('parses the same result from a .zip path', () => {
      const parsed = parseExport(TINY_ZIP);
      expect(parsed.showFollows).toHaveLength(2);
      expect(parsed.showFollows.map(f => f.tvdbSeriesId).sort()).toEqual([355567, 365026]);
    });
  });

  describe('follow-only movie (Ant-Man case: nameless watch row + named follow row)', () => {
    const parsed = parseExport(ANTMAN);

    it('recovers the movie as a single watchlist entry from the follow row', () => {
      expect(parsed.movieWatchlist).toHaveLength(1);
      const antMan = parsed.movieWatchlist[0];
      expect(antMan.movieName).toBe('Ant-Man');
      expect(antMan.releaseYear).toBe(2015);
      expect(antMan.addedAt).toBe('2015-07-20 10:00:01');
    });

    it('does not create a movie watch (the watch row had no name)', () => {
      expect(parsed.movieWatches).toHaveLength(0);
    });

    it('still warns about the nameless watch row', () => {
      expect(parsed.warnings.some(w => w.includes('skipped movie row with empty movie_name'))).toBe(true);
    });
  });
});
