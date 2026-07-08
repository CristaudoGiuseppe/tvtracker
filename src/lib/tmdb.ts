const BASE_URL = 'https://api.themoviedb.org/3';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_RETRIES = 3;
const THROTTLE_WINDOW_MS = 10_000; // 10 seconds
const THROTTLE_MAX_REQUESTS = 40;

export class TmdbError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'TmdbError';
    this.status = status;
  }
}

export interface TmdbEpisode {
  id: number;
  season_number: number;
  episode_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
}

export interface TmdbSeason {
  season_number: number;
  name: string;
  poster_path: string | null;
  episode_count: number;
  air_date: string | null;
  episodes: TmdbEpisode[];
}

export interface TmdbShowFull {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  status: string;
  genres: { name: string }[];
  episode_run_time: number[];
  seasons: TmdbSeason[];
}

export interface TmdbMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: { name: string }[];
  runtime: number | null;
  release_date: string | null;
}

export interface TmdbSearchResult {
  id: number;
  kind: 'tv' | 'movie';
  name: string;
  poster_path: string | null;
  first_air_date?: string;
  release_date?: string;
  vote_average: number;
  overview: string;
}

const cache = new Map<string, { expiresAt: number; data: unknown }>();
const requestTimestamps: number[] = [];

// Test-only: clears module state (throttle timestamps + URL cache) so tests don't
// leak state into one another.
export function resetTmdbForTests(): void {
  requestTimestamps.length = 0;
  cache.clear();
}

function getToken(): string {
  const token = process.env.TMDB_READ_TOKEN;
  if (!token) throw new TmdbError('TMDB_READ_TOKEN is not set');
  return token;
}

function buildUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(BASE_URL + path);
  url.searchParams.set('language', 'it-IT');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// Timestamp-queue throttle: keeps total request rate <= THROTTLE_MAX_REQUESTS
// per THROTTLE_WINDOW_MS, safe for long sequential runs (e.g. the importer).
async function waitForSlot(): Promise<void> {
  const now = Date.now();
  while (requestTimestamps.length && now - requestTimestamps[0] >= THROTTLE_WINDOW_MS) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= THROTTLE_MAX_REQUESTS) {
    const waitMs = THROTTLE_WINDOW_MS - (now - requestTimestamps[0]);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    return waitForSlot();
  }
  requestTimestamps.push(Date.now());
}

export async function tmdbGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = buildUrl(path, params);
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitForSlot();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    if (res.ok) {
      const data = await res.json();
      cache.set(url, { expiresAt: Date.now() + CACHE_TTL_MS, data });
      return data;
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_RETRIES) {
      throw new TmdbError(`TMDB request failed: ${res.status} ${res.statusText} (${path})`, res.status);
    }
    await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
  }
  // Unreachable: the loop above always returns or throws.
  throw new TmdbError(`TMDB request failed for ${path}`);
}

export async function findByTvdbId(tvdbId: number): Promise<{ tvId: number | null }> {
  const data = await tmdbGet(`/find/${tvdbId}`, { external_source: 'tvdb_id' });
  return { tvId: data.tv_results?.[0]?.id ?? null };
}

function mapEpisode(raw: any): TmdbEpisode {
  return {
    id: raw.id,
    season_number: raw.season_number,
    episode_number: raw.episode_number,
    name: raw.name,
    overview: raw.overview,
    still_path: raw.still_path ?? null,
    air_date: raw.air_date ?? null,
    runtime: raw.runtime ?? null,
  };
}

export async function getShowFull(tmdbId: number): Promise<TmdbShowFull> {
  const raw = await tmdbGet(`/tv/${tmdbId}`);

  let overview = raw.overview;
  if (!overview) {
    const enRaw = await tmdbGet(`/tv/${tmdbId}`, { language: 'en-US' });
    overview = enRaw.overview;
  }

  const seasons: TmdbSeason[] = [];
  for (const rawSeason of raw.seasons ?? []) {
    const seasonData = await tmdbGet(`/tv/${tmdbId}/season/${rawSeason.season_number}`);
    seasons.push({
      season_number: rawSeason.season_number,
      name: rawSeason.name,
      poster_path: rawSeason.poster_path ?? null,
      episode_count: rawSeason.episode_count,
      air_date: rawSeason.air_date ?? null,
      episodes: (seasonData.episodes ?? []).map(mapEpisode),
    });
  }

  return {
    id: raw.id,
    name: raw.name,
    overview,
    poster_path: raw.poster_path ?? null,
    backdrop_path: raw.backdrop_path ?? null,
    status: raw.status,
    genres: raw.genres ?? [],
    episode_run_time: raw.episode_run_time ?? [],
    seasons,
  };
}

export async function getMovie(tmdbId: number): Promise<TmdbMovie> {
  const raw = await tmdbGet(`/movie/${tmdbId}`);
  return {
    id: raw.id,
    title: raw.title,
    overview: raw.overview,
    poster_path: raw.poster_path ?? null,
    backdrop_path: raw.backdrop_path ?? null,
    genres: raw.genres ?? [],
    runtime: raw.runtime ?? null,
    release_date: raw.release_date ?? null,
  };
}

function mapShowSearchResult(raw: any): TmdbSearchResult {
  return {
    id: raw.id,
    kind: 'tv',
    name: raw.name,
    poster_path: raw.poster_path ?? null,
    first_air_date: raw.first_air_date,
    vote_average: raw.vote_average,
    overview: raw.overview,
  };
}

function mapMovieSearchResult(raw: any): TmdbSearchResult {
  return {
    id: raw.id,
    kind: 'movie',
    name: raw.title,
    poster_path: raw.poster_path ?? null,
    release_date: raw.release_date,
    vote_average: raw.vote_average,
    overview: raw.overview,
  };
}

export async function searchShows(query: string): Promise<TmdbSearchResult[]> {
  const data = await tmdbGet('/search/tv', { query });
  return (data.results ?? []).map(mapShowSearchResult);
}

export async function searchMovies(query: string, year?: number): Promise<TmdbSearchResult[]> {
  const params: Record<string, string> = { query };
  if (year !== undefined) params.year = String(year);
  const data = await tmdbGet('/search/movie', params);
  return (data.results ?? []).map(mapMovieSearchResult);
}

export async function trendingShows(): Promise<TmdbSearchResult[]> {
  const data = await tmdbGet('/trending/tv/week');
  return (data.results ?? []).map(mapShowSearchResult);
}

export async function trendingMovies(): Promise<TmdbSearchResult[]> {
  const data = await tmdbGet('/trending/movie/week');
  return (data.results ?? []).map(mapMovieSearchResult);
}
