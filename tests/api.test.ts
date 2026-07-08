import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { readFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetDbForTests, getDb } from '../src/db';
import { libraryShows } from '../src/db/schema';
import { eq } from 'drizzle-orm';

// --- mocks -------------------------------------------------------------
// Library and tmdb are partially mocked: every export is wrapped in vi.fn()
// so individual tests can stub delegation, but the *default* implementation
// is the real one (needed by the import-route tests, which exercise the
// real importer against a mocked tmdb only).

vi.mock('../src/lib/library', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/library')>();
  return {
    ...actual,
    addShow: vi.fn(actual.addShow),
    setShowStatus: vi.fn(actual.setShowStatus),
    toggleFavorite: vi.fn(actual.toggleFavorite),
    removeShow: vi.fn(actual.removeShow),
    checkInEpisode: vi.fn(actual.checkInEpisode),
    uncheckEpisode: vi.fn(actual.uncheckEpisode),
    checkInMovie: vi.fn(actual.checkInMovie),
    markSeasonWatched: vi.fn(actual.markSeasonWatched),
    markShowWatched: vi.fn(actual.markShowWatched),
    rate: vi.fn(actual.rate),
    addMovie: vi.fn(actual.addMovie),
    setMovieState: vi.fn(actual.setMovieState),
    removeMovie: vi.fn(actual.removeMovie),
  };
});

vi.mock('../src/lib/tmdb', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/tmdb')>();
  return {
    ...actual,
    searchShows: vi.fn(actual.searchShows),
    searchMovies: vi.fn(actual.searchMovies),
    getShowFull: vi.fn(actual.getShowFull),
    getMovie: vi.fn(actual.getMovie),
    findByTvdbId: vi.fn(actual.findByTvdbId),
  };
});

vi.mock('../src/lib/sync', () => ({
  refreshStaleShows: vi.fn(),
}));

import * as library from '../src/lib/library';
import * as tmdb from '../src/lib/tmdb';
import { refreshStaleShows } from '../src/lib/sync';
import type { TmdbSearchResult, TmdbShowFull } from '../src/lib/tmdb';

import { POST as postLibraryShow } from '../src/app/api/library/shows/route';
import { POST as postLibraryMovie } from '../src/app/api/library/movies/route';
import { DELETE as deleteLibraryMovie } from '../src/app/api/library/movies/[id]/route';
import { PATCH as patchLibraryShow, DELETE as deleteLibraryShow } from '../src/app/api/library/shows/[id]/route';
import { POST as postCheckin, DELETE as deleteCheckin } from '../src/app/api/checkin/route';
import { POST as postSeasonWatched } from '../src/app/api/season-watched/route';
import { POST as postRate } from '../src/app/api/rate/route';
import { GET as getSearch } from '../src/app/api/search/route';
import { POST as postImport, PUT as putImport } from '../src/app/api/import/route';
import { POST as postSync } from '../src/app/api/sync/route';

let realLibrary: typeof import('../src/lib/library');

beforeAll(async () => {
  realLibrary = await vi.importActual<typeof import('../src/lib/library')>('../src/lib/library');
});

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// --- library/shows -------------------------------------------------------

describe('POST /api/library/shows', () => {
  beforeEach(() => {
    vi.mocked(library.addShow).mockReset().mockResolvedValue(undefined);
  });

  it('delegates to addShow and returns 201', async () => {
    const res = await postLibraryShow(jsonRequest('http://x/api/library/shows', 'POST', { tmdbId: 1396, status: 'for_later' }));
    expect(res.status).toBe(201);
    expect(library.addShow).toHaveBeenCalledWith(1396, 'for_later');
  });

  it('400s when tmdbId is missing', async () => {
    const res = await postLibraryShow(jsonRequest('http://x/api/library/shows', 'POST', { status: 'watching' }));
    expect(res.status).toBe(400);
    expect(library.addShow).not.toHaveBeenCalled();
  });

  it('400s when tmdbId is not a number', async () => {
    const res = await postLibraryShow(jsonRequest('http://x/api/library/shows', 'POST', { tmdbId: '1396' }));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/library/shows/[id]', () => {
  beforeEach(() => {
    vi.mocked(library.setShowStatus).mockReset().mockReturnValue(undefined);
    vi.mocked(library.toggleFavorite).mockReset().mockReturnValue(undefined);
  });

  it('delegates a status change', async () => {
    const res = await patchLibraryShow(jsonRequest('http://x/api/library/shows/1396', 'PATCH', { status: 'finished' }), {
      params: Promise.resolve({ id: '1396' }),
    });
    expect(res.status).toBe(200);
    expect(library.setShowStatus).toHaveBeenCalledWith(1396, 'finished');
  });

  it('delegates a favorite toggle', async () => {
    const res = await patchLibraryShow(jsonRequest('http://x/api/library/shows/1396', 'PATCH', { favorite: true }), {
      params: Promise.resolve({ id: '1396' }),
    });
    expect(res.status).toBe(200);
    expect(library.toggleFavorite).toHaveBeenCalledWith(1396);
  });

  it('400s on a non-numeric id', async () => {
    const res = await patchLibraryShow(jsonRequest('http://x/api/library/shows/abc', 'PATCH', { favorite: true }), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
    expect(library.toggleFavorite).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/library/shows/[id]', () => {
  beforeEach(() => {
    vi.mocked(library.removeShow).mockReset().mockReturnValue(undefined);
  });

  it('delegates to removeShow', async () => {
    const res = await deleteLibraryShow(new Request('http://x/api/library/shows/1396', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '1396' }),
    });
    expect(res.status).toBe(200);
    expect(library.removeShow).toHaveBeenCalledWith(1396);
  });

  it('400s on a non-numeric id', async () => {
    const res = await deleteLibraryShow(new Request('http://x/api/library/shows/abc', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
  });
});

// --- library/movies ------------------------------------------------------

describe('POST /api/library/movies', () => {
  beforeEach(() => {
    vi.mocked(library.addMovie).mockReset().mockResolvedValue(undefined);
    vi.mocked(library.setMovieState).mockReset().mockReturnValue(undefined);
  });

  it('delegates a watchlist add to addMovie and returns 201, without upgrading state', async () => {
    const res = await postLibraryMovie(jsonRequest('http://x/api/library/movies', 'POST', { tmdbId: 550, state: 'watchlist' }));
    expect(res.status).toBe(201);
    expect(library.addMovie).toHaveBeenCalledWith(550, 'watchlist');
    expect(library.setMovieState).not.toHaveBeenCalled();
  });

  it('delegates a watched add to addMovie and also upgrades existing library rows via setMovieState', async () => {
    const res = await postLibraryMovie(jsonRequest('http://x/api/library/movies', 'POST', { tmdbId: 550, state: 'watched' }));
    expect(res.status).toBe(201);
    expect(library.addMovie).toHaveBeenCalledWith(550, 'watched');
    expect(library.setMovieState).toHaveBeenCalledWith(550, 'watched');
  });

  it('400s when tmdbId is missing', async () => {
    const res = await postLibraryMovie(jsonRequest('http://x/api/library/movies', 'POST', { state: 'watchlist' }));
    expect(res.status).toBe(400);
    expect(library.addMovie).not.toHaveBeenCalled();
  });

  it('400s on an invalid state', async () => {
    const res = await postLibraryMovie(jsonRequest('http://x/api/library/movies', 'POST', { tmdbId: 550, state: 'seen' }));
    expect(res.status).toBe(400);
    expect(library.addMovie).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/library/movies/[id]', () => {
  beforeEach(() => {
    vi.mocked(library.removeMovie).mockReset().mockReturnValue(undefined);
  });

  it('delegates to removeMovie', async () => {
    const res = await deleteLibraryMovie(new Request('http://x/api/library/movies/550', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '550' }),
    });
    expect(res.status).toBe(200);
    expect(library.removeMovie).toHaveBeenCalledWith(550);
  });

  it('400s on a non-numeric id', async () => {
    const res = await deleteLibraryMovie(new Request('http://x/api/library/movies/abc', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
    expect(library.removeMovie).not.toHaveBeenCalled();
  });
});

// --- checkin -------------------------------------------------------------

describe('POST /api/checkin', () => {
  beforeEach(() => {
    vi.mocked(library.checkInEpisode).mockReset().mockReturnValue(undefined);
    vi.mocked(library.checkInMovie).mockReset().mockReturnValue(undefined);
    vi.mocked(library.setMovieState).mockReset().mockReturnValue(undefined);
  });

  it('delegates an episode check-in', async () => {
    const res = await postCheckin(jsonRequest('http://x/api/checkin', 'POST', { episodeId: 555, watchedAt: '2024-01-01 00:00:00' }));
    expect(res.status).toBe(201);
    expect(library.checkInEpisode).toHaveBeenCalledWith(555, '2024-01-01 00:00:00');
  });

  it('delegates a movie check-in to checkInMovie and moves it to watched', async () => {
    const res = await postCheckin(jsonRequest('http://x/api/checkin', 'POST', { movieId: 777 }));
    expect(res.status).toBe(201);
    expect(library.checkInMovie).toHaveBeenCalledWith(777, undefined);
    expect(library.setMovieState).toHaveBeenCalledWith(777, 'watched');
  });

  it('400s when neither episodeId nor movieId is given', async () => {
    const res = await postCheckin(jsonRequest('http://x/api/checkin', 'POST', {}));
    expect(res.status).toBe(400);
  });

  it('400s when both episodeId and movieId are given', async () => {
    const res = await postCheckin(jsonRequest('http://x/api/checkin', 'POST', { episodeId: 1, movieId: 2 }));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/checkin', () => {
  beforeEach(() => {
    vi.mocked(library.uncheckEpisode).mockReset().mockReturnValue(undefined);
  });

  it('delegates to uncheckEpisode', async () => {
    const res = await deleteCheckin(jsonRequest('http://x/api/checkin', 'DELETE', { episodeId: 555 }));
    expect(res.status).toBe(200);
    expect(library.uncheckEpisode).toHaveBeenCalledWith(555);
  });

  it('400s when episodeId is missing', async () => {
    const res = await deleteCheckin(jsonRequest('http://x/api/checkin', 'DELETE', {}));
    expect(res.status).toBe(400);
  });
});

// --- season-watched --------------------------------------------------------

describe('POST /api/season-watched', () => {
  beforeEach(() => {
    vi.mocked(library.markSeasonWatched).mockReset().mockReturnValue(undefined);
    vi.mocked(library.markShowWatched).mockReset().mockReturnValue(undefined);
  });

  it('delegates to markSeasonWatched when seasonNumber is given', async () => {
    const res = await postSeasonWatched(jsonRequest('http://x/api/season-watched', 'POST', { showId: 1396, seasonNumber: 2 }));
    expect(res.status).toBe(200);
    expect(library.markSeasonWatched).toHaveBeenCalledWith(1396, 2);
    expect(library.markShowWatched).not.toHaveBeenCalled();
  });

  it('delegates to markShowWatched when only showId is given', async () => {
    const res = await postSeasonWatched(jsonRequest('http://x/api/season-watched', 'POST', { showId: 1396 }));
    expect(res.status).toBe(200);
    expect(library.markShowWatched).toHaveBeenCalledWith(1396);
  });

  it('400s when showId is missing', async () => {
    const res = await postSeasonWatched(jsonRequest('http://x/api/season-watched', 'POST', {}));
    expect(res.status).toBe(400);
  });
});

// --- rate ------------------------------------------------------------------

describe('POST /api/rate', () => {
  beforeEach(() => {
    vi.mocked(library.rate).mockReset().mockReturnValue(undefined);
  });

  it('delegates to rate', async () => {
    const res = await postRate(jsonRequest('http://x/api/rate', 'POST', { kind: 'episode', targetId: 555, rating: 8 }));
    expect(res.status).toBe(200);
    expect(library.rate).toHaveBeenCalledWith('episode', 555, 8);
  });

  it('400s on an invalid kind', async () => {
    const res = await postRate(jsonRequest('http://x/api/rate', 'POST', { kind: 'song', targetId: 555, rating: 8 }));
    expect(res.status).toBe(400);
  });

  it('400s on an out-of-range rating', async () => {
    const res = await postRate(jsonRequest('http://x/api/rate', 'POST', { kind: 'show', targetId: 1, rating: 11 }));
    expect(res.status).toBe(400);
  });
});

// --- search ------------------------------------------------------------------

describe('GET /api/search', () => {
  const showResult: TmdbSearchResult = { id: 1, kind: 'tv', name: 'A Show', poster_path: null, vote_average: 7, overview: '' };
  const movieResult: TmdbSearchResult = { id: 2, kind: 'movie', name: 'A Movie', poster_path: null, vote_average: 6, overview: '' };

  beforeEach(() => {
    vi.mocked(tmdb.searchShows).mockReset().mockResolvedValue([showResult]);
    vi.mocked(tmdb.searchMovies).mockReset().mockResolvedValue([movieResult]);
  });

  it('merges show and movie results', async () => {
    const res = await getSearch(new Request('http://x/api/search?q=test'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toEqual([showResult, movieResult]);
  });

  it('400s when q is missing', async () => {
    const res = await getSearch(new Request('http://x/api/search'));
    expect(res.status).toBe(400);
  });

  it('400s when q is empty', async () => {
    const res = await getSearch(new Request('http://x/api/search?q='));
    expect(res.status).toBe(400);
  });

  it('502s when tmdb throws TmdbError', async () => {
    vi.mocked(tmdb.searchShows).mockRejectedValue(new tmdb.TmdbError('tmdb down', 503));
    const res = await getSearch(new Request('http://x/api/search?q=test'));
    expect(res.status).toBe(502);
  });
});

// --- sync ------------------------------------------------------------------

describe('POST /api/sync', () => {
  it('delegates to refreshStaleShows', async () => {
    vi.mocked(refreshStaleShows).mockReset().mockResolvedValue(3);
    const res = await postSync();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ refreshed: 3 });
  });

  it('500s when refreshStaleShows throws', async () => {
    vi.mocked(refreshStaleShows).mockReset().mockRejectedValue(new Error('boom'));
    const res = await postSync();
    expect(res.status).toBe(500);
  });
});

// --- import (real importer + real db, tmdb mocked) --------------------------

describe('POST/PUT /api/import', () => {
  const FIXTURE_ZIP = join(__dirname, 'fixtures', 'tvtime-tiny.zip');
  let importDir: string;

  const showById: Record<number, TmdbShowFull> = {
    71912: { id: 71912, name: 'The Boys', overview: '', poster_path: null, backdrop_path: null, status: 'Returning Series', genres: [], episode_run_time: [60], seasons: [] },
    84773: { id: 84773, name: 'Carnival Row', overview: '', poster_path: null, backdrop_path: null, status: 'Ended', genres: [], episode_run_time: [50], seasons: [] },
  };

  const originalDataDir = process.env.DATA_DIR;

  beforeEach(() => {
    resetDbForTests();
    importDir = mkdtempSync(join(tmpdir(), 'tvtracker-import-'));
    process.env.DATA_DIR = importDir;

    // restore real implementations for the importer's own dependencies
    vi.mocked(library.addShow).mockReset().mockImplementation(realLibrary.addShow);

    vi.mocked(tmdb.findByTvdbId).mockReset().mockImplementation(async (tvdbId: number) => {
      if (tvdbId === 355567) return { tvId: 71912 }; // The Boys
      if (tvdbId === 365026) return { tvId: 84773 }; // Carnival Row
      return { tvId: null };
    });
    vi.mocked(tmdb.getShowFull).mockReset().mockImplementation(async (id: number) => {
      const show = showById[id];
      if (!show) throw new Error(`unexpected show id ${id}`);
      return show;
    });
  });

  afterEach(() => {
    rmSync(importDir, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
  });

  it('POST parses + matches + dry-runs the upload and persists a session', async () => {
    const zipBuffer = readFileSync(FIXTURE_ZIP);
    const form = new FormData();
    form.append('file', new Blob([zipBuffer]), 'export.zip');

    const res = await postImport(new Request('http://x/api/import', { method: 'POST', body: form }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.sessionId).toBe('import-session');
    expect(json.preview.follows).toBe(2);
    expect(json.preview.unmatchedShows).toEqual([]);
    expect(existsSync(join(importDir, 'import-session.zip'))).toBe(true);
    expect(existsSync(join(importDir, 'import-session.json'))).toBe(true);
  });

  it('POST 400s when no file field is present', async () => {
    const form = new FormData();
    const res = await postImport(new Request('http://x/api/import', { method: 'POST', body: form }));
    expect(res.status).toBe(400);
  });

  it('PUT runs the real import against the persisted session', async () => {
    const zipBuffer = readFileSync(FIXTURE_ZIP);
    const form = new FormData();
    form.append('file', new Blob([zipBuffer]), 'export.zip');
    await postImport(new Request('http://x/api/import', { method: 'POST', body: form }));

    const res = await putImport(jsonRequest('http://x/api/import', 'PUT', { sessionId: 'import-session', confirm: true }));
    expect(res.status).toBe(200);
    const report = await res.json();
    expect(report.imported.shows).toBe(2);
    expect(report.imported.follows).toBe(2);

    const row = getDb().select().from(libraryShows).where(eq(libraryShows.showId, 71912)).get();
    expect(row?.status).toBe('watching');

    // Verify session files are invalidated after successful import
    const res2 = await putImport(jsonRequest('http://x/api/import', 'PUT', { sessionId: 'import-session', confirm: true }));
    expect(res2.status).toBe(400);
  });

  it('PUT 400s when no session has been created', async () => {
    const res = await putImport(jsonRequest('http://x/api/import', 'PUT', { sessionId: 'import-session', confirm: true }));
    expect(res.status).toBe(400);
  });

  it('PUT 400s on a mismatched sessionId', async () => {
    const res = await putImport(jsonRequest('http://x/api/import', 'PUT', { sessionId: 'nope', confirm: true }));
    expect(res.status).toBe(400);
  });
});
