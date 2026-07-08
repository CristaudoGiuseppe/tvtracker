import { getDb } from '../db';
import { libraryShows, libraryMovies, watches, ratings, settings, shows, movies } from '../db/schema';

// Full dump of the user's own data — "never lock data in again". Metadata
// tables (shows/movies/episodes) are NOT dumped wholesale; only a minimal
// id -> name mapping so an export is human-readable and re-linkable, while the
// user-owned rows (library, watches, ratings, settings) are exported verbatim.

export function exportData() {
  const db = getDb();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    libraryShows: db.select().from(libraryShows).all(),
    libraryMovies: db.select().from(libraryMovies).all(),
    watches: db.select().from(watches).all(),
    ratings: db.select().from(ratings).all(),
    settings: db.select().from(settings).all(),
    shows: db.select({ tmdbId: shows.tmdbId, name: shows.name }).from(shows).all(),
    movies: db.select({ tmdbId: movies.tmdbId, title: movies.title }).from(movies).all(),
  };
}

export type ExportBundle = ReturnType<typeof exportData>;
