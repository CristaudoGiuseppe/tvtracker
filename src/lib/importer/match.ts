import { eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { settings } from '../../db/schema';
import { findByTvdbId, searchMovies, TmdbError } from '../tmdb';
import type { ParsedExport } from './parse';

export type MatchedShow = { tvdbSeriesId: number; seriesName: string; tmdbId: number | null };
export type MatchedMovie = { movieName: string; releaseYear: number | null; tmdbId: number | null };

export type MatchedExport = {
  shows: MatchedShow[];
  movies: MatchedMovie[];
  unmatchedShows: string[];
  unmatchedMovies: string[];
};

function getSetting(key: string): string | null {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  getDb()
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

/** Persists a manual show override consulted first by matchExport. */
export function resolveManualMatch(tvdbSeriesId: number, tmdbId: number): void {
  setSetting(`import.override.tvdb.${tvdbSeriesId}`, String(tmdbId));
}

function movieOverrideKey(name: string, year: number | null): string {
  return `import.override.movie.${name.toLowerCase()}|${year ?? ''}`;
}

/** Persists a manual movie override consulted first by matchExport. */
export function resolveManualMovieMatch(movieName: string, releaseYear: number | null, tmdbId: number): void {
  setSetting(movieOverrideKey(movieName, releaseYear), String(tmdbId));
}

export async function matchExport(parsed: ParsedExport): Promise<MatchedExport> {
  const shows: MatchedShow[] = [];
  const movies: MatchedMovie[] = [];
  const unmatchedShows: string[] = [];
  const unmatchedMovies: string[] = [];

  // --- shows: distinct tvdb ids across watches + follows -----------------
  const showMap = new Map<number, string>();
  for (const e of parsed.episodeWatches) if (!showMap.has(e.tvdbSeriesId)) showMap.set(e.tvdbSeriesId, e.seriesName);
  for (const f of parsed.showFollows) if (!showMap.has(f.tvdbSeriesId)) showMap.set(f.tvdbSeriesId, f.seriesName);

  for (const [tvdbSeriesId, seriesName] of showMap) {
    let tmdbId: number | null = null;
    const override = getSetting(`import.override.tvdb.${tvdbSeriesId}`);
    if (override !== null) {
      tmdbId = Number.parseInt(override, 10);
    } else {
      try {
        tmdbId = (await findByTvdbId(tvdbSeriesId)).tvId;
      } catch (err) {
        if (!(err instanceof TmdbError)) throw err;
        tmdbId = null;
      }
    }
    shows.push({ tvdbSeriesId, seriesName, tmdbId });
    if (tmdbId === null) unmatchedShows.push(seriesName);
  }

  // --- movies: distinct name|year across watches + watchlist -------------
  const movieMap = new Map<string, { movieName: string; releaseYear: number | null }>();
  const addMovie = (movieName: string, releaseYear: number | null) => {
    const key = `${movieName.toLowerCase()}|${releaseYear ?? ''}`;
    if (!movieMap.has(key)) movieMap.set(key, { movieName, releaseYear });
  };
  for (const m of parsed.movieWatches) addMovie(m.movieName, m.releaseYear);
  for (const m of parsed.movieWatchlist) addMovie(m.movieName, m.releaseYear);

  for (const { movieName, releaseYear } of movieMap.values()) {
    let tmdbId: number | null = null;
    const override = getSetting(movieOverrideKey(movieName, releaseYear));
    if (override !== null) {
      tmdbId = Number.parseInt(override, 10);
    } else {
      try {
        const results = await searchMovies(movieName, releaseYear ?? undefined);
        const exact = results.find(r => r.name.toLowerCase() === movieName.toLowerCase());
        if (exact) tmdbId = exact.id;
        else if (results.length === 1) tmdbId = results[0].id;
        else tmdbId = null;
      } catch (err) {
        if (!(err instanceof TmdbError)) throw err;
        tmdbId = null;
      }
    }
    movies.push({ movieName, releaseYear, tmdbId });
    if (tmdbId === null) unmatchedMovies.push(movieName);
  }

  return { shows, movies, unmatchedShows, unmatchedMovies };
}
