import { eq, and, ne, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getDb } from '../db';
import * as schema from '../db/schema';
import { shows, seasons, episodes, movies, libraryShows, libraryMovies, watches, ratings } from '../db/schema';
import { getShowFull, getMovie, getWatchProviders } from './tmdb';
import type { TmdbShowFull, TmdbMovie } from './tmdb';

export type LibStatus = 'watching' | 'finished' | 'stopped' | 'for_later';

type Db = BetterSQLite3Database<typeof schema>;

/** Single producer of app timestamps: 'YYYY-MM-DD HH:MM:SS' in UTC. */
export function nowUtc(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function isAired(airDate: string | null, today: string): boolean {
  return airDate !== null && airDate <= today;
}

// --- metadata caching -------------------------------------------------

function upsertShowCore(db: Db, show: TmdbShowFull): void {
  const showValues = {
    tmdbId: show.id,
    name: show.name,
    overview: show.overview,
    posterPath: show.poster_path,
    backdropPath: show.backdrop_path,
    status: show.status,
    genres: JSON.stringify(show.genres.map(g => g.name)),
    episodeRunTime: show.episode_run_time[0] ?? null,
    lastSyncedAt: nowUtc(),
  };
  db.insert(shows).values(showValues).onConflictDoUpdate({ target: shows.tmdbId, set: showValues }).run();

  for (const season of show.seasons) {
    const seasonValues = {
      showId: show.id,
      seasonNumber: season.season_number,
      name: season.name,
      posterPath: season.poster_path,
      episodeCount: season.episode_count,
      airDate: season.air_date,
    };
    db.insert(seasons)
      .values(seasonValues)
      .onConflictDoUpdate({ target: [seasons.showId, seasons.seasonNumber], set: seasonValues })
      .run();

    for (const ep of season.episodes) {
      const episodeValues = {
        tmdbId: ep.id,
        showId: show.id,
        seasonNumber: ep.season_number,
        episodeNumber: ep.episode_number,
        name: ep.name,
        overview: ep.overview,
        stillPath: ep.still_path,
        airDate: ep.air_date,
        runtime: ep.runtime,
      };
      db.insert(episodes)
        .values(episodeValues)
        .onConflictDoUpdate({ target: episodes.tmdbId, set: episodeValues })
        .run();
    }
  }
}

/** Upserts show/season/episode metadata caches. Safe to re-run (also used by the sync task). */
export function upsertShowMetadata(show: TmdbShowFull): void {
  const db = getDb();
  db.transaction((tx: Db) => upsertShowCore(tx, show));
}

function upsertMovieCore(db: Db, movie: TmdbMovie): void {
  const values = {
    tmdbId: movie.id,
    title: movie.title,
    overview: movie.overview,
    posterPath: movie.poster_path,
    backdropPath: movie.backdrop_path,
    genres: JSON.stringify(movie.genres.map(g => g.name)),
    runtime: movie.runtime,
    releaseDate: movie.release_date,
    lastSyncedAt: nowUtc(),
  };
  db.insert(movies).values(values).onConflictDoUpdate({ target: movies.tmdbId, set: values }).run();
}

// --- watch providers ----------------------------------------------------

// Returns the ProvidersJson string to store, `null` when the region legitimately
// has no availability, or `undefined` when the fetch failed (caller leaves the
// column untouched). A providers fetch must never fail the surrounding operation.
async function fetchProvidersJson(kind: 'tv' | 'movie', tmdbId: number): Promise<string | null | undefined> {
  try {
    const providers = await getWatchProviders(kind, tmdbId);
    return providers ? JSON.stringify(providers) : null;
  } catch (err) {
    console.warn(`watch providers fetch failed for ${kind} ${tmdbId}:`, err);
    return undefined;
  }
}

/** Re-fetches and stores watch providers for a library title. Returns true when
 * real availability was stored. Failure-tolerant: on a fetch error the existing
 * value is preserved and false is returned. */
export async function refreshProviders(kind: 'tv' | 'movie', tmdbId: number): Promise<boolean> {
  const json = await fetchProvidersJson(kind, tmdbId);
  if (json === undefined) return false;
  const db = getDb();
  if (kind === 'tv') db.update(shows).set({ watchProviders: json }).where(eq(shows.tmdbId, tmdbId)).run();
  else db.update(movies).set({ watchProviders: json }).where(eq(movies.tmdbId, tmdbId)).run();
  return json !== null;
}

// --- shows library ------------------------------------------------------

export async function addShow(tmdbId: number, status: LibStatus = 'watching'): Promise<void> {
  const show = await getShowFull(tmdbId);
  const providers = await fetchProvidersJson('tv', tmdbId);
  const db = getDb();
  db.transaction((tx: Db) => {
    upsertShowCore(tx, show);
    if (providers !== undefined) {
      tx.update(shows).set({ watchProviders: providers }).where(eq(shows.tmdbId, tmdbId)).run();
    }
    tx.insert(libraryShows)
      .values({ showId: tmdbId, status, addedAt: nowUtc() })
      .onConflictDoNothing({ target: libraryShows.showId })
      .run();
  });
}

export function setShowStatus(tmdbId: number, status: LibStatus): void {
  getDb().update(libraryShows).set({ status }).where(eq(libraryShows.showId, tmdbId)).run();
}

export function toggleFavorite(tmdbId: number): void {
  const db = getDb();
  const row = db.select().from(libraryShows).where(eq(libraryShows.showId, tmdbId)).get();
  if (!row) return;
  db.update(libraryShows).set({ isFavorite: row.isFavorite ? 0 : 1 }).where(eq(libraryShows.showId, tmdbId)).run();
}

export function removeShow(tmdbId: number): void {
  const db = getDb();
  db.transaction((tx: Db) => {
    const episodeIds = tx.select({ id: episodes.tmdbId }).from(episodes).where(eq(episodes.showId, tmdbId)).all().map(r => r.id);
    if (episodeIds.length) {
      tx.delete(watches).where(and(eq(watches.kind, 'episode'), inArray(watches.episodeId, episodeIds))).run();
      tx.delete(ratings).where(and(eq(ratings.kind, 'episode'), inArray(ratings.targetId, episodeIds))).run();
    }
    tx.delete(ratings).where(and(eq(ratings.kind, 'show'), eq(ratings.targetId, tmdbId))).run();
    tx.delete(libraryShows).where(eq(libraryShows.showId, tmdbId)).run();
  });
}

// --- episode check-ins ---------------------------------------------------

export function checkInEpisode(episodeTmdbId: number, watchedAt?: string): void {
  const db = getDb();
  const episode = db.select().from(episodes).where(eq(episodes.tmdbId, episodeTmdbId)).get();
  if (!episode) throw new Error(`Episode ${episodeTmdbId} not found`);

  const existing = db.select().from(watches).where(and(eq(watches.kind, 'episode'), eq(watches.episodeId, episodeTmdbId))).all();
  const rewatchIndex = existing.length ? Math.max(...existing.map(w => w.rewatchIndex)) + 1 : 0;

  db.insert(watches)
    .values({
      kind: 'episode',
      episodeId: episodeTmdbId,
      showId: episode.showId,
      watchedAt: watchedAt ?? nowUtc(),
      rewatchIndex,
    })
    .run();
}

export function uncheckEpisode(episodeTmdbId: number): void {
  const db = getDb();
  const existing = db.select().from(watches).where(and(eq(watches.kind, 'episode'), eq(watches.episodeId, episodeTmdbId))).all();
  if (!existing.length) return;
  const highest = existing.reduce((a, b) => (b.rewatchIndex > a.rewatchIndex ? b : a));
  db.delete(watches).where(eq(watches.id, highest.id)).run();
}

function checkInIfUnwatched(db: Db, showId: number, episode: { tmdbId: number; airDate: string | null }, today: string): void {
  if (!isAired(episode.airDate, today)) return;
  const already = db.select().from(watches).where(and(eq(watches.kind, 'episode'), eq(watches.episodeId, episode.tmdbId))).all();
  if (already.length) return;
  db.insert(watches).values({ kind: 'episode', episodeId: episode.tmdbId, showId, watchedAt: nowUtc(), rewatchIndex: 0 }).run();
}

export function markSeasonWatched(showId: number, seasonNumber: number): void {
  const db = getDb();
  const today = nowUtc().slice(0, 10);
  const eps = db.select().from(episodes).where(and(eq(episodes.showId, showId), eq(episodes.seasonNumber, seasonNumber))).all();
  db.transaction((tx: Db) => {
    for (const ep of eps) checkInIfUnwatched(tx, showId, ep, today);
  });
}

export function markShowWatched(showId: number): void {
  const db = getDb();
  const today = nowUtc().slice(0, 10);
  const eps = db.select().from(episodes).where(and(eq(episodes.showId, showId), ne(episodes.seasonNumber, 0))).all();
  db.transaction((tx: Db) => {
    for (const ep of eps) checkInIfUnwatched(tx, showId, ep, today);
    tx.update(libraryShows).set({ status: 'finished' }).where(eq(libraryShows.showId, showId)).run();
  });
}

// --- movies library -------------------------------------------------------

function checkInMovieCore(db: Db, tmdbId: number, watchedAt?: string): void {
  const existing = db.select().from(watches).where(and(eq(watches.kind, 'movie'), eq(watches.movieId, tmdbId))).all();
  const rewatchIndex = existing.length ? Math.max(...existing.map(w => w.rewatchIndex)) + 1 : 0;
  db.insert(watches).values({ kind: 'movie', movieId: tmdbId, watchedAt: watchedAt ?? nowUtc(), rewatchIndex }).run();
}

export async function addMovie(tmdbId: number, state: 'watchlist' | 'watched', watchedAt?: string): Promise<void> {
  const movie = await getMovie(tmdbId);
  const providers = await fetchProvidersJson('movie', tmdbId);
  const db = getDb();
  let hadExistingWatch = false;
  db.transaction((tx: Db) => {
    upsertMovieCore(tx, movie);
    if (providers !== undefined) {
      tx.update(movies).set({ watchProviders: providers }).where(eq(movies.tmdbId, tmdbId)).run();
    }
    tx.insert(libraryMovies).values({ movieId: tmdbId, state, addedAt: nowUtc() }).onConflictDoNothing({ target: libraryMovies.movieId }).run();
    hadExistingWatch = tx.select().from(watches).where(and(eq(watches.kind, 'movie'), eq(watches.movieId, tmdbId))).all().length > 0;
    if (state === 'watched' && !hadExistingWatch) checkInMovieCore(tx, tmdbId, watchedAt);
  });
}

export function setMovieState(tmdbId: number, state: 'watchlist' | 'watched'): void {
  getDb().update(libraryMovies).set({ state }).where(eq(libraryMovies.movieId, tmdbId)).run();
}

export function removeMovie(tmdbId: number): void {
  const db = getDb();
  db.transaction((tx: Db) => {
    tx.delete(watches).where(and(eq(watches.kind, 'movie'), eq(watches.movieId, tmdbId))).run();
    tx.delete(ratings).where(and(eq(ratings.kind, 'movie'), eq(ratings.targetId, tmdbId))).run();
    tx.delete(libraryMovies).where(eq(libraryMovies.movieId, tmdbId)).run();
  });
}

export function checkInMovie(tmdbId: number, watchedAt?: string): void {
  checkInMovieCore(getDb(), tmdbId, watchedAt);
}

// --- ratings ---------------------------------------------------------------

export function rate(kind: 'show' | 'episode' | 'movie', targetId: number, rating: number): void {
  const db = getDb();
  db.insert(ratings)
    .values({ kind, targetId, rating, ratedAt: nowUtc() })
    .onConflictDoUpdate({ target: [ratings.kind, ratings.targetId], set: { rating, ratedAt: nowUtc() } })
    .run();
}
