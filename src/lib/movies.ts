import { eq, and } from 'drizzle-orm';
import { getDb } from '../db';
import { movies, libraryMovies, watches, ratings } from '../db/schema';

export type MovieRow = typeof movies.$inferSelect;
export type MovieState = 'watchlist' | 'watched';

export interface LibraryMovie {
  movie: MovieRow;
  state: MovieState;
  watchedAt: string | null; // most recent watch, null for watchlist-only
  watchCount: number;
}

export interface MovieDetail extends LibraryMovie {
  rating: number | null;
}

/** Latest watch timestamp and total watch count per movie id. */
function watchInfoByMovie(): Map<number, { latest: string; count: number }> {
  const db = getDb();
  const rows = db.select().from(watches).where(eq(watches.kind, 'movie')).all();
  const info = new Map<number, { latest: string; count: number }>();
  for (const w of rows) {
    if (w.movieId === null) continue;
    const cur = info.get(w.movieId);
    if (cur) {
      cur.count += 1;
      if (w.watchedAt > cur.latest) cur.latest = w.watchedAt;
    } else {
      info.set(w.movieId, { latest: w.watchedAt, count: 1 });
    }
  }
  return info;
}

/** Every library movie joined with its cached metadata and latest-watch info. */
export function getLibraryMovies(): LibraryMovie[] {
  const db = getDb();
  const libs = db.select().from(libraryMovies).all();
  const movieById = new Map(db.select().from(movies).all().map(m => [m.tmdbId, m]));
  const watchInfo = watchInfoByMovie();

  const result: LibraryMovie[] = [];
  for (const lib of libs) {
    const movie = movieById.get(lib.movieId);
    if (!movie) continue;
    const info = watchInfo.get(lib.movieId);
    result.push({
      movie,
      state: lib.state as MovieState,
      watchedAt: info?.latest ?? null,
      watchCount: info?.count ?? 0,
    });
  }
  return result;
}

/** In-library movie detail with rating and watch info; null when not in the library. */
export function getMovieDetail(movieId: number): MovieDetail | null {
  const db = getDb();
  const lib = db.select().from(libraryMovies).where(eq(libraryMovies.movieId, movieId)).get();
  if (!lib) return null;
  const movie = db.select().from(movies).where(eq(movies.tmdbId, movieId)).get();
  if (!movie) return null;

  const info = watchInfoByMovie().get(movieId);
  const ratingRow = db.select().from(ratings).where(and(eq(ratings.kind, 'movie'), eq(ratings.targetId, movieId))).get();

  return {
    movie,
    state: lib.state as MovieState,
    watchedAt: info?.latest ?? null,
    watchCount: info?.count ?? 0,
    rating: ratingRow?.rating ?? null,
  };
}
