import { getDb } from '../db';
import { shows, episodes, movies, libraryShows, watches } from '../db/schema';

export type ShowRow = typeof shows.$inferSelect;

export interface Stats {
  totalMinutes: number;
  episodesWatched: number;
  moviesWatched: number;
  showsFinished: number;
  topShows: { show: ShowRow; minutes: number; episodes: number }[];
  topGenres: { genre: string; count: number }[];
  byMonth: { month: string; episodes: number; movies: number }[];
  firstWatchAt: string | null;
  streakDays: number;
}

const DEFAULT_EPISODE_RUNTIME = 40;
const MONTHS_WINDOW = 24;
const TOP_SHOWS_LIMIT = 10;
const TOP_GENRES_LIMIT = 8;

function parseGenres(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function monthKey(watchedAt: string): string {
  return watchedAt.slice(0, 7);
}

function dayKey(watchedAt: string): string {
  return watchedAt.slice(0, 10);
}

/** Last `count` 'YYYY-MM' keys ending at (and including) the current UTC month, oldest first. */
function lastMonths(count: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

/** Longest run of consecutive UTC calendar days present in `days`. 0 if empty, else >= 1. */
function longestStreak(days: Set<string>): number {
  if (days.size === 0) return 0;
  const sorted = [...days].sort();
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prevMs = Date.parse(`${sorted[i - 1]}T00:00:00Z`);
    const nextMs = Date.parse(`${sorted[i]}T00:00:00Z`);
    const diffDays = (nextMs - prevMs) / 86_400_000;
    current = diffDays === 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

/** Read-only aggregation over the local db: totals, top shows/genres, monthly activity, streaks. */
export function getStats(): Stats {
  const db = getDb();
  const allWatches = db.select().from(watches).all();
  const showById = new Map(db.select().from(shows).all().map(s => [s.tmdbId, s]));
  const episodeById = new Map(db.select().from(episodes).all().map(e => [e.tmdbId, e]));
  const movieById = new Map(db.select().from(movies).all().map(m => [m.tmdbId, m]));
  const allLibraryShows = db.select().from(libraryShows).all();

  let totalMinutes = 0;
  let episodesWatched = 0;
  let moviesWatched = 0;
  let firstWatchAt: string | null = null;

  const showMinutes = new Map<number, number>();
  const showEpisodeCount = new Map<number, number>();
  const watchedShowIds = new Set<number>();
  const watchedMovieIds = new Set<number>();
  const monthCounts = new Map<string, { episodes: number; movies: number }>();
  const daySet = new Set<string>();

  for (const w of allWatches) {
    if (firstWatchAt === null || w.watchedAt < firstWatchAt) firstWatchAt = w.watchedAt;
    daySet.add(dayKey(w.watchedAt));

    const mKey = monthKey(w.watchedAt);
    const bucket = monthCounts.get(mKey) ?? { episodes: 0, movies: 0 };

    if (w.kind === 'episode') {
      episodesWatched += 1;
      bucket.episodes += 1;
      const episode = w.episodeId !== null ? episodeById.get(w.episodeId) : undefined;
      const show = w.showId !== null ? showById.get(w.showId) : undefined;
      const minutes = episode?.runtime ?? show?.episodeRunTime ?? DEFAULT_EPISODE_RUNTIME;
      totalMinutes += minutes;
      if (w.showId !== null) {
        showMinutes.set(w.showId, (showMinutes.get(w.showId) ?? 0) + minutes);
        showEpisodeCount.set(w.showId, (showEpisodeCount.get(w.showId) ?? 0) + 1);
        watchedShowIds.add(w.showId);
      }
    } else if (w.kind === 'movie') {
      moviesWatched += 1;
      bucket.movies += 1;
      const movie = w.movieId !== null ? movieById.get(w.movieId) : undefined;
      totalMinutes += movie?.runtime ?? 0;
      if (w.movieId !== null) watchedMovieIds.add(w.movieId);
    }

    monthCounts.set(mKey, bucket);
  }

  const showsFinished = allLibraryShows.filter(l => l.status === 'finished').length;

  const topShows = [...showMinutes.entries()]
    .filter(([showId]) => showById.has(showId))
    .map(([showId, minutes]) => ({
      show: showById.get(showId)!,
      minutes,
      episodes: showEpisodeCount.get(showId) ?? 0,
    }))
    .sort((a, b) => b.minutes - a.minutes || a.show.tmdbId - b.show.tmdbId)
    .slice(0, TOP_SHOWS_LIMIT);

  const genreCounts = new Map<string, number>();
  for (const showId of watchedShowIds) {
    const show = showById.get(showId);
    if (!show) continue;
    for (const genre of parseGenres(show.genres)) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }
  for (const movieId of watchedMovieIds) {
    const movie = movieById.get(movieId);
    if (!movie) continue;
    for (const genre of parseGenres(movie.genres)) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }
  const topGenres = [...genreCounts.entries()]
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
    .slice(0, TOP_GENRES_LIMIT);

  const byMonth = lastMonths(MONTHS_WINDOW).map(month => {
    const bucket = monthCounts.get(month);
    return { month, episodes: bucket?.episodes ?? 0, movies: bucket?.movies ?? 0 };
  });

  return {
    totalMinutes,
    episodesWatched,
    moviesWatched,
    showsFinished,
    topShows,
    topGenres,
    byMonth,
    firstWatchAt,
    streakDays: longestStreak(daySet),
  };
}
