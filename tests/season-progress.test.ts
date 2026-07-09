import { describe, it, expect } from 'vitest';
import { seasonProgress } from '../src/lib/season-progress';

const TODAY = '2026-07-09';

describe('seasonProgress', () => {
  it('is empty for a season with no episodes', () => {
    expect(seasonProgress([], TODAY)).toEqual({ airedCount: 0, watchedCount: 0 });
  });

  it('counts only aired episodes as aired (airDate <= today)', () => {
    const eps = [
      { airDate: '2026-07-01', watched: false }, // aired
      { airDate: '2026-07-09', watched: false }, // aired (today, inclusive)
      { airDate: '2026-07-10', watched: false }, // future
      { airDate: null, watched: false }, // undated
    ];
    expect(seasonProgress(eps, TODAY)).toEqual({ airedCount: 2, watchedCount: 0 });
  });

  it('counts watched only among aired episodes', () => {
    const eps = [
      { airDate: '2026-07-01', watched: true }, // aired + watched
      { airDate: '2026-07-02', watched: false }, // aired, unwatched
      { airDate: '2026-07-20', watched: true }, // future but flagged watched -> ignored
    ];
    expect(seasonProgress(eps, TODAY)).toEqual({ airedCount: 2, watchedCount: 1 });
  });

  it('reports a fully-watched aired season', () => {
    const eps = [
      { airDate: '2026-06-01', watched: true },
      { airDate: '2026-06-08', watched: true },
    ];
    expect(seasonProgress(eps, TODAY)).toEqual({ airedCount: 2, watchedCount: 2 });
  });

  it('treats a season of only future episodes as nothing aired', () => {
    const eps = [
      { airDate: '2026-08-01', watched: false },
      { airDate: '2026-08-08', watched: false },
    ];
    expect(seasonProgress(eps, TODAY)).toEqual({ airedCount: 0, watchedCount: 0 });
  });
});
