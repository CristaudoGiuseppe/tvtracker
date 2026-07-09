import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  tmdbGet,
  findByTvdbId,
  findEpisodeByTvdbId,
  getShowFull,
  getMovie,
  searchShows,
  searchMovies,
  trendingShows,
  trendingMovies,
  getWatchProviders,
  TmdbError,
  resetTmdbForTests,
} from '../src/lib/tmdb';

process.env.TMDB_READ_TOKEN = 'test-token';

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

describe('tmdb client', () => {
  beforeEach(() => {
    resetTmdbForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('(a) sends bearer auth header and default it-IT language param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ id: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await tmdbGet('/tv/900001');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('language=it-IT');
    expect((options as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test-token' });
  });

  it('(b) retries after a 429 and returns the eventual success', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({}, 429))
      .mockResolvedValueOnce(mockResponse({ id: 900002 }, 200));
    vi.stubGlobal('fetch', fetchMock);

    const promise = tmdbGet('/tv/900002');
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toEqual({ id: 900002 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws a TmdbError once retries are exhausted', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({}, 500));
    vi.stubGlobal('fetch', fetchMock);

    const promise = tmdbGet('/tv/900003');
    // let the promise settle its rejection path without an unhandled warning
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(500 + 1000 + 2000 + 10);

    await expect(promise).rejects.toBeInstanceOf(TmdbError);
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('(c) fetches the same URL only once thanks to the cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ id: 900004 }));
    vi.stubGlobal('fetch', fetchMock);

    await tmdbGet('/movie/900004');
    await tmdbGet('/movie/900004');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('(d) findByTvdbId resolves the first tv_results id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ tv_results: [{ id: 1396 }], movie_results: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await findByTvdbId(81189);

    expect(result).toEqual({ tvId: 1396 });
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/find/81189');
    expect(String(url)).toContain('external_source=tvdb_id');
  });

  it('findByTvdbId returns null tvId when there are no matches', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ tv_results: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await findByTvdbId(999999);

    expect(result).toEqual({ tvId: null });
  });

  it('findEpisodeByTvdbId resolves the first tv_episode_results entry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        tv_episode_results: [
          { id: 1149719, season_number: 5, episode_number: 133, show_id: 37854 },
        ],
        tv_results: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await findEpisodeByTvdbId(362051);

    expect(result).toEqual({
      episodeTmdbId: 1149719,
      showTmdbId: 37854,
      seasonNumber: 5,
      episodeNumber: 133,
    });
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/find/362051');
    expect(String(url)).toContain('external_source=tvdb_id');
  });

  it('findEpisodeByTvdbId returns null when there are no episode matches', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ tv_episode_results: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await findEpisodeByTvdbId(999999);

    expect(result).toBeNull();
  });

  it('(e) getShowFull merges each season episodes array into the season object', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/tv/900005/season/1')) {
        return mockResponse({
          episodes: [
            { id: 1, season_number: 1, episode_number: 1, name: 'E1', overview: 'o1', still_path: null, air_date: '2020-01-01', runtime: 42 },
          ],
        });
      }
      if (u.includes('/tv/900005/season/2')) {
        return mockResponse({
          episodes: [
            { id: 2, season_number: 2, episode_number: 1, name: 'E2', overview: 'o2', still_path: null, air_date: '2021-01-01', runtime: 44 },
          ],
        });
      }
      if (u.includes('/tv/900005')) {
        return mockResponse({
          id: 900005,
          name: 'Show',
          overview: 'desc',
          poster_path: null,
          backdrop_path: null,
          status: 'Ended',
          genres: [{ name: 'Drama' }],
          episode_run_time: [42],
          seasons: [
            { season_number: 1, name: 'Season 1', poster_path: null, episode_count: 1, air_date: '2020-01-01' },
            { season_number: 2, name: 'Season 2', poster_path: null, episode_count: 1, air_date: '2021-01-01' },
          ],
        });
      }
      throw new Error(`unexpected url: ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const show = await getShowFull(900005);

    expect(show.seasons).toHaveLength(2);
    expect(show.seasons[0].episodes).toHaveLength(1);
    expect(show.seasons[0].episodes[0].name).toBe('E1');
    expect(show.seasons[1].episodes[0].name).toBe('E2');
  });

  it('(f) falls back to en-US when the it-IT overview is empty', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/season/')) return mockResponse({ episodes: [] });
      if (u.includes('language=en-US')) {
        return mockResponse({
          id: 900006,
          name: 'Show',
          overview: 'English overview',
          genres: [],
          episode_run_time: [],
          seasons: [],
        });
      }
      return mockResponse({
        id: 900006,
        name: 'Show',
        overview: '',
        genres: [],
        episode_run_time: [],
        seasons: [],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const show = await getShowFull(900006);

    expect(show.overview).toBe('English overview');
  });

  it('getMovie normalizes the raw TMDB payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        id: 900007,
        title: 'A Movie',
        overview: 'plot',
        poster_path: '/p.jpg',
        backdrop_path: '/b.jpg',
        genres: [{ name: 'Action' }],
        runtime: 120,
        release_date: '2020-05-01',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const movie = await getMovie(900007);

    expect(movie).toEqual({
      id: 900007,
      title: 'A Movie',
      overview: 'plot',
      poster_path: '/p.jpg',
      backdrop_path: '/b.jpg',
      genres: [{ name: 'Action' }],
      runtime: 120,
      release_date: '2020-05-01',
    });
  });

  it('searchShows maps results to TmdbSearchResult[]', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        results: [{ id: 1, name: 'Foo', poster_path: '/f.jpg', first_air_date: '2020-01-01', vote_average: 8.1, overview: 'ov' }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchShows('foo');

    expect(results).toEqual([
      { id: 1, kind: 'tv', name: 'Foo', poster_path: '/f.jpg', first_air_date: '2020-01-01', vote_average: 8.1, overview: 'ov' },
    ]);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/search/tv');
    expect(String(url)).toContain('query=foo');
  });

  it('searchMovies maps results to TmdbSearchResult[] and forwards the year param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        results: [{ id: 2, title: 'Bar', poster_path: '/b.jpg', release_date: '2019-05-01', vote_average: 7.2, overview: 'ov2' }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchMovies('bar', 2019);

    expect(results).toEqual([
      { id: 2, kind: 'movie', name: 'Bar', poster_path: '/b.jpg', release_date: '2019-05-01', vote_average: 7.2, overview: 'ov2' },
    ]);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/search/movie');
    expect(String(url)).toContain('year=2019');
  });

  it('trendingShows and trendingMovies hit /trending/{tv|movie}/week', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ results: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await trendingShows();
    await trendingMovies();

    const urls = fetchMock.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(urls[0]).toContain('/trending/tv/week');
    expect(urls[1]).toContain('/trending/movie/week');
  });

  it('getWatchProviders maps the region block (default IT) to ProvidersJson', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        id: 100088,
        results: {
          IT: {
            link: 'https://www.themoviedb.org/tv/100088/watch?locale=IT',
            flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/net.jpg', display_priority: 0 }],
            rent: [{ provider_id: 2, provider_name: 'Apple TV', logo_path: '/apple.jpg', display_priority: 1 }],
            buy: [{ provider_id: 3, provider_name: 'Google Play', logo_path: '/gp.jpg', display_priority: 2 }],
          },
          US: { flatrate: [{ provider_id: 15, provider_name: 'Hulu', logo_path: '/hulu.jpg' }] },
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const providers = await getWatchProviders('tv', 100088);

    expect(providers).toEqual({
      region: 'IT',
      link: 'https://www.themoviedb.org/tv/100088/watch?locale=IT',
      flatrate: [{ id: 8, name: 'Netflix', logoPath: '/net.jpg' }],
      rent: [{ id: 2, name: 'Apple TV', logoPath: '/apple.jpg' }],
      buy: [{ id: 3, name: 'Google Play', logoPath: '/gp.jpg' }],
    });
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/tv/100088/watch/providers');
  });

  it('getWatchProviders returns null when the region has no availability block', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ id: 100099, results: { US: { flatrate: [] } } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const providers = await getWatchProviders('movie', 100099);

    expect(providers).toBeNull();
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/movie/100099/watch/providers');
  });

  it('(g) throttles the 41st request until the 10s sliding window elapses', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: true }, 200));
    vi.stubGlobal('fetch', fetchMock);

    const requests = Array.from({ length: 40 }, (_, i) =>
      tmdbGet(`/movie/${910000 + i}`),
    );
    await Promise.all(requests);
    expect(fetchMock).toHaveBeenCalledTimes(40);

    let resolved41 = false;
    const p41 = tmdbGet('/movie/929999').then(() => {
      resolved41 = true;
    });

    // Flush microtasks without advancing time: request #41 must still be waiting.
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved41).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(40);

    // Cross the 10s window boundary: request #41 should now go through.
    await vi.advanceTimersByTimeAsync(10_000);
    await p41;

    expect(resolved41).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(41);
  });
});
