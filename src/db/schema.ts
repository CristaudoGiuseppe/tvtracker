import { sqliteTable, integer, text, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const shows = sqliteTable('shows', {
  tmdbId: integer('tmdb_id').primaryKey(),
  tvdbId: integer('tvdb_id'),
  name: text('name').notNull(),
  overview: text('overview'),
  posterPath: text('poster_path'),
  backdropPath: text('backdrop_path'),
  status: text('status'),                      // 'Returning Series' | 'Ended' | 'Canceled' | …(TMDB verbatim)
  genres: text('genres'),                      // JSON string[]
  episodeRunTime: integer('episode_run_time'), // minutes, fallback 40
  lastSyncedAt: text('last_synced_at'),
});

export const seasons = sqliteTable('seasons', {
  showId: integer('show_id').notNull().references(() => shows.tmdbId),
  seasonNumber: integer('season_number').notNull(),
  name: text('name'),
  posterPath: text('poster_path'),
  episodeCount: integer('episode_count'),
  airDate: text('air_date'),
}, t => [primaryKey({ columns: [t.showId, t.seasonNumber] })]);

export const episodes = sqliteTable('episodes', {
  tmdbId: integer('tmdb_id').primaryKey(),
  showId: integer('show_id').notNull().references(() => shows.tmdbId),
  seasonNumber: integer('season_number').notNull(),
  episodeNumber: integer('episode_number').notNull(),
  name: text('name'),
  overview: text('overview'),
  stillPath: text('still_path'),
  airDate: text('air_date'),                   // 'YYYY-MM-DD' or null
  runtime: integer('runtime'),                 // minutes or null
}, t => [uniqueIndex('ep_show_se').on(t.showId, t.seasonNumber, t.episodeNumber)]);

export const movies = sqliteTable('movies', {
  tmdbId: integer('tmdb_id').primaryKey(),
  title: text('title').notNull(),
  overview: text('overview'),
  posterPath: text('poster_path'),
  backdropPath: text('backdrop_path'),
  genres: text('genres'),
  runtime: integer('runtime'),                 // minutes
  releaseDate: text('release_date'),
  lastSyncedAt: text('last_synced_at'),
});

export const libraryShows = sqliteTable('library_shows', {
  showId: integer('show_id').primaryKey().references(() => shows.tmdbId),
  status: text('status').notNull(),            // 'watching' | 'finished' | 'stopped' | 'for_later'
  isFavorite: integer('is_favorite').notNull().default(0),
  archived: integer('archived').notNull().default(0),
  addedAt: text('added_at').notNull(),
});

export const libraryMovies = sqliteTable('library_movies', {
  movieId: integer('movie_id').primaryKey().references(() => movies.tmdbId),
  state: text('state').notNull(),              // 'watchlist' | 'watched'
  addedAt: text('added_at').notNull(),
});

export const watches = sqliteTable('watches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(),                // 'episode' | 'movie'
  episodeId: integer('episode_id'),            // tmdb episode id (kind=episode)
  showId: integer('show_id'),                  // denormalized for fast per-show queries
  movieId: integer('movie_id'),                // tmdb movie id (kind=movie)
  watchedAt: text('watched_at').notNull(),
  rewatchIndex: integer('rewatch_index').notNull().default(0),
}, t => [
  uniqueIndex('watch_unique').on(t.kind, t.episodeId, t.movieId, t.rewatchIndex),
  index('watch_show').on(t.showId),
]);

export const ratings = sqliteTable('ratings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(),                // 'show' | 'episode' | 'movie'
  targetId: integer('target_id').notNull(),
  rating: integer('rating').notNull(),         // 1-10
  ratedAt: text('rated_at').notNull(),
}, t => [uniqueIndex('rating_unique').on(t.kind, t.targetId)]);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
