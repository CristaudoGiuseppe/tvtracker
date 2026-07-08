import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDb, resetDbForTests } from '../src/db';
import { shows, libraryShows, settings } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import type { TmdbShowFull } from '../src/lib/tmdb';

vi.mock('../src/lib/tmdb', () => ({
  getShowFull: vi.fn(),
}));

import { getShowFull } from '../src/lib/tmdb';
import { refreshStaleShows } from '../src/lib/sync';

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString().slice(0, 19).replace('T', ' ');
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function makeShow(id: number, overrides: Partial<TmdbShowFull> = {}): TmdbShowFull {
  return {
    id,
    name: `Show ${id}`,
    overview: '',
    poster_path: null,
    backdrop_path: null,
    status: 'Returning Series',
    genres: [],
    episode_run_time: [30],
    seasons: [],
    ...overrides,
  };
}

function seedShow(id: number, status: string, lastSyncedAt: string | null): void {
  const db = getDb();
  db.insert(shows)
    .values({ tmdbId: id, name: `Show ${id}`, status, lastSyncedAt })
    .run();
  db.insert(libraryShows).values({ showId: id, status: 'watching', addedAt: '2020-01-01 00:00:00' }).run();
}

beforeEach(() => {
  resetDbForTests();
  vi.mocked(getShowFull).mockReset();
});

describe('refreshStaleShows', () => {
  it('refreshes a stale show (lastSyncedAt > 24h old)', async () => {
    seedShow(1, 'Returning Series', iso(-25 * HOUR));
    vi.mocked(getShowFull).mockResolvedValue(makeShow(1));

    const refreshed = await refreshStaleShows();

    expect(refreshed).toBe(1);
    expect(vi.mocked(getShowFull)).toHaveBeenCalledWith(1);
    const row = getDb().select().from(shows).where(eq(shows.tmdbId, 1)).get();
    expect(row?.lastSyncedAt).not.toBeNull();
  });

  it('refreshes a show with a null lastSyncedAt', async () => {
    seedShow(2, 'Returning Series', null);
    vi.mocked(getShowFull).mockResolvedValue(makeShow(2));

    const refreshed = await refreshStaleShows();

    expect(refreshed).toBe(1);
  });

  it('does not refresh a fresh show (lastSyncedAt < 24h old)', async () => {
    seedShow(3, 'Returning Series', iso(-1 * HOUR));

    const refreshed = await refreshStaleShows();

    expect(refreshed).toBe(0);
    expect(vi.mocked(getShowFull)).not.toHaveBeenCalled();
  });

  it('does not refresh Ended or Canceled shows even if stale', async () => {
    seedShow(4, 'Ended', iso(-48 * HOUR));
    seedShow(5, 'Canceled', iso(-48 * HOUR));

    const refreshed = await refreshStaleShows();

    expect(refreshed).toBe(0);
    expect(vi.mocked(getShowFull)).not.toHaveBeenCalled();
  });

  it('the 1-hour guard blocks a second run and returns 0 without calling tmdb', async () => {
    seedShow(6, 'Returning Series', iso(-48 * HOUR));
    vi.mocked(getShowFull).mockResolvedValue(makeShow(6));

    const first = await refreshStaleShows();
    expect(first).toBe(1);

    vi.mocked(getShowFull).mockClear();
    const second = await refreshStaleShows();
    expect(second).toBe(0);
    expect(vi.mocked(getShowFull)).not.toHaveBeenCalled();
  });

  it('allows a new run once the guard window has passed', async () => {
    seedShow(7, 'Returning Series', iso(-48 * HOUR));
    vi.mocked(getShowFull).mockResolvedValue(makeShow(7));

    getDb()
      .insert(settings)
      .values({ key: 'sync.lastRunAt', value: iso(-2 * HOUR) })
      .run();

    const refreshed = await refreshStaleShows();
    expect(refreshed).toBe(1);
  });

  it('a failing getShowFull for one show does not abort the run for the rest', async () => {
    seedShow(8, 'Returning Series', iso(-48 * HOUR));
    seedShow(9, 'Returning Series', iso(-48 * HOUR));
    vi.mocked(getShowFull).mockImplementation(async (id: number) => {
      if (id === 8) throw new Error('tmdb down');
      return makeShow(id);
    });

    const refreshed = await refreshStaleShows();

    expect(refreshed).toBe(1);
    expect(vi.mocked(getShowFull)).toHaveBeenCalledTimes(2);
  });
});
