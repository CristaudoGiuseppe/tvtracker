import { eq, and } from 'drizzle-orm';
import { getDb } from '../db';
import { shows, seasons, episodes, libraryShows, watches, ratings } from '../db/schema';
import type { ProviderEntry, ProvidersJson } from './tmdb';

export type ShowRow = typeof shows.$inferSelect;
export type EpisodeRow = typeof episodes.$inferSelect;
export type LibraryShowRow = typeof libraryShows.$inferSelect;

export type LibraryGroup = 'watching' | 'to_start' | 'up_to_date' | 'for_later' | 'finished' | 'stopped';

export interface ShowProgress {
  airedCount: number;
  watchedCount: number;
  nextEpisode: EpisodeRow | null;
  upToDate: boolean;
}

/**
 * Single display-classification rule, shared by getLibraryGrouped and the show-detail badge:
 * stored 'watching' splits into 'up_to_date' (all aired watched), 'to_start' (never watched
 * an episode) or 'watching'; other stored statuses map straight through.
 */
export function libraryGroupFor(
  status: LibraryShowRow['status'],
  progress: Pick<ShowProgress, 'upToDate' | 'watchedCount'>,
): LibraryGroup {
  if (status !== 'watching') return status as LibraryGroup;
  if (progress.upToDate) return 'up_to_date';
  return progress.watchedCount === 0 ? 'to_start' : 'watching';
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysUtc(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isAired(airDate: string | null, todayStr: string): boolean {
  return airDate !== null && airDate <= todayStr;
}

/** Progress computation shared by getShowProgress / getWatchNextList / getLibraryGrouped. Season 0 (specials) excluded. */
function computeProgress(eps: EpisodeRow[], watchedEpisodeIds: Set<number>, todayStr: string): ShowProgress {
  const nonSpecial = eps.filter(e => e.seasonNumber !== 0);
  const airedCount = nonSpecial.filter(e => isAired(e.airDate, todayStr)).length;
  const watchedCount = nonSpecial.filter(e => watchedEpisodeIds.has(e.tmdbId)).length;
  const sorted = [...nonSpecial].sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
  const nextEpisode = sorted.find(e => isAired(e.airDate, todayStr) && !watchedEpisodeIds.has(e.tmdbId)) ?? null;
  const upToDate = airedCount > 0 && watchedCount >= airedCount;
  return { airedCount, watchedCount, nextEpisode, upToDate };
}

function watchedEpisodeIdsForShow(showId: number): Set<number> {
  const db = getDb();
  const rows = db.select().from(watches).where(and(eq(watches.kind, 'episode'), eq(watches.showId, showId))).all();
  return new Set(rows.map(w => w.episodeId).filter((id): id is number => id !== null));
}

/** Aired/watched counts, next unwatched aired episode, and up-to-date flag for a single show. Season 0 excluded throughout. */
export function getShowProgress(showId: number): ShowProgress {
  const db = getDb();
  const eps = db.select().from(episodes).where(eq(episodes.showId, showId)).all();
  return computeProgress(eps, watchedEpisodeIdsForShow(showId), today());
}

export interface DetailEpisode {
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
  stillPath: string | null;
  airDate: string | null;
  runtime: number | null;
  watched: boolean;
  watchCount: number;
}

export interface DetailSeason {
  seasonNumber: number;
  name: string | null;
  episodes: DetailEpisode[];
}

export interface ShowDetail {
  show: ShowRow;
  lib: LibraryShowRow;
  progress: ShowProgress;
  seasons: DetailSeason[];
  rating: number | null;
}

/** Specials (season 0) sort after regular seasons; regular seasons ascending. */
function seasonSort(a: number, b: number): number {
  if (a === 0) return 1;
  if (b === 0) return -1;
  return a - b;
}

/** Full detail view-model for an in-library show: seasons → episodes with per-episode watch state, progress and rating. Returns null if the show is not in the library. */
export function getShowDetail(showId: number): ShowDetail | null {
  const db = getDb();
  const lib = db.select().from(libraryShows).where(eq(libraryShows.showId, showId)).get();
  if (!lib) return null;
  const show = db.select().from(shows).where(eq(shows.tmdbId, showId)).get();
  if (!show) return null;

  const eps = db.select().from(episodes).where(eq(episodes.showId, showId)).all();
  const seasonRows = db.select().from(seasons).where(eq(seasons.showId, showId)).all();
  const watchRows = db.select().from(watches).where(and(eq(watches.kind, 'episode'), eq(watches.showId, showId))).all();

  const watchCounts = new Map<number, number>();
  for (const w of watchRows) {
    if (w.episodeId !== null) watchCounts.set(w.episodeId, (watchCounts.get(w.episodeId) ?? 0) + 1);
  }
  const progress = computeProgress(eps, new Set(watchCounts.keys()), today());

  const seasonNames = new Map(seasonRows.map(s => [s.seasonNumber, s.name]));
  const bySeason = new Map<number, DetailEpisode[]>();
  for (const e of eps) {
    const list = bySeason.get(e.seasonNumber) ?? [];
    list.push({
      tmdbId: e.tmdbId,
      seasonNumber: e.seasonNumber,
      episodeNumber: e.episodeNumber,
      name: e.name,
      stillPath: e.stillPath,
      airDate: e.airDate,
      runtime: e.runtime,
      watched: watchCounts.has(e.tmdbId),
      watchCount: watchCounts.get(e.tmdbId) ?? 0,
    });
    bySeason.set(e.seasonNumber, list);
  }

  const detailSeasons: DetailSeason[] = [...bySeason.keys()]
    .sort(seasonSort)
    .map(seasonNumber => ({
      seasonNumber,
      name: seasonNames.get(seasonNumber) ?? null,
      episodes: bySeason.get(seasonNumber)!.sort((a, b) => a.episodeNumber - b.episodeNumber),
    }));

  const ratingRow = db.select().from(ratings).where(and(eq(ratings.kind, 'show'), eq(ratings.targetId, showId))).get();

  return { show, lib, progress, seasons: detailSeasons, rating: ratingRow?.rating ?? null };
}

/** Refreshed progress for the show that owns `episodeTmdbId` — used by the check-in route to advance a card in place. */
export function getShowProgressByEpisode(episodeTmdbId: number): ShowProgress | null {
  const db = getDb();
  const ep = db.select().from(episodes).where(eq(episodes.tmdbId, episodeTmdbId)).get();
  if (!ep) return null;
  return getShowProgress(ep.showId);
}

export interface WatchNextItem {
  show: ShowRow;
  lib: LibraryShowRow;
  next: EpisodeRow;
  lastWatchedAt: string | null;
  progress: { airedCount: number; watchedCount: number };
}

/** 'watching', non-archived shows that have a next episode; ordered by last-watch recency desc, never-watched last. */
export function getWatchNextList(): WatchNextItem[] {
  const db = getDb();
  const todayStr = today();
  const libs = db.select().from(libraryShows).where(and(eq(libraryShows.status, 'watching'), eq(libraryShows.archived, 0))).all();

  const results: WatchNextItem[] = [];
  for (const lib of libs) {
    const show = db.select().from(shows).where(eq(shows.tmdbId, lib.showId)).get();
    if (!show) continue;
    const eps = db.select().from(episodes).where(eq(episodes.showId, lib.showId)).all();
    const watchRows = db.select().from(watches).where(and(eq(watches.kind, 'episode'), eq(watches.showId, lib.showId))).all();
    const watchedIds = new Set(watchRows.map(w => w.episodeId).filter((id): id is number => id !== null));
    const progress = computeProgress(eps, watchedIds, todayStr);
    if (!progress.nextEpisode) continue;
    const lastWatchedAt = watchRows.length
      ? watchRows.reduce((max, w) => (w.watchedAt > max ? w.watchedAt : max), watchRows[0].watchedAt)
      : null;
    results.push({
      show,
      lib,
      next: progress.nextEpisode,
      lastWatchedAt,
      progress: { airedCount: progress.airedCount, watchedCount: progress.watchedCount },
    });
  }

  results.sort((a, b) => {
    if (a.lastWatchedAt === null && b.lastWatchedAt === null) return 0;
    if (a.lastWatchedAt === null) return 1;
    if (b.lastWatchedAt === null) return -1;
    return b.lastWatchedAt.localeCompare(a.lastWatchedAt);
  });
  return results;
}

/** Future-aired episodes within [tomorrow, today+daysAhead] for non-archived library shows of ANY status. */
export function getUpcoming(daysAhead = 90): { show: ShowRow; episode: EpisodeRow; isSeasonPremiere: boolean }[] {
  const db = getDb();
  const todayStr = today();
  const maxDate = addDaysUtc(todayStr, daysAhead);
  const libs = db.select().from(libraryShows).where(eq(libraryShows.archived, 0)).all();

  const results: { show: ShowRow; episode: EpisodeRow; isSeasonPremiere: boolean }[] = [];
  for (const lib of libs) {
    const show = db.select().from(shows).where(eq(shows.tmdbId, lib.showId)).get();
    if (!show) continue;
    const eps = db.select().from(episodes).where(eq(episodes.showId, lib.showId)).all();
    for (const ep of eps) {
      if (ep.airDate !== null && ep.airDate > todayStr && ep.airDate <= maxDate) {
        results.push({ show, episode: ep, isSeasonPremiere: ep.episodeNumber === 1 });
      }
    }
  }

  results.sort((a, b) => {
    const byDate = a.episode.airDate!.localeCompare(b.episode.airDate!);
    return byDate !== 0 ? byDate : a.show.name.localeCompare(b.show.name);
  });
  return results;
}

/** Item shape for the My Shows grid: core row plus the client-side filter/sort facets. */
export interface LibraryGroupItem {
  show: ShowRow;
  lib: LibraryShowRow;
  progress: ShowProgress;
  genres: string[];
  providers: ProviderEntry[]; // flatrate (subscription) providers only
  lastWatchedAt: string | null;
}

function parseGenres(json: string | null): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((g): g is string => typeof g === 'string') : [];
  } catch {
    return [];
  }
}

function parseFlatrate(json: string | null): ProviderEntry[] {
  if (!json) return [];
  try {
    const p = JSON.parse(json) as ProvidersJson;
    return Array.isArray(p.flatrate) ? p.flatrate : [];
  } catch {
    return [];
  }
}

function lastWatchedAtForShow(showId: number): string | null {
  const rows = getDb()
    .select({ watchedAt: watches.watchedAt })
    .from(watches)
    .where(and(eq(watches.kind, 'episode'), eq(watches.showId, showId)))
    .all();
  if (rows.length === 0) return null;
  return rows.reduce((max, r) => (r.watchedAt > max ? r.watchedAt : max), rows[0].watchedAt);
}

/**
 * Display grouping for the whole library: stored 'watching' splits three ways via progress —
 * 'up_to_date' (all aired episodes watched), 'to_start' (never watched an episode), else 'watching' (in progress).
 * Other stored statuses map to their own group. Archived shows still appear here (archived only suppresses
 * watch-next/upcoming noise, it does not remove a show from its library group).
 * Each item also carries genres, flatrate providers and last-watch timestamp for client-side filter/sort.
 */
export function getLibraryGrouped(): Record<LibraryGroup, LibraryGroupItem[]> {
  const db = getDb();
  const grouped: Record<LibraryGroup, LibraryGroupItem[]> = {
    watching: [],
    to_start: [],
    up_to_date: [],
    for_later: [],
    finished: [],
    stopped: [],
  };

  const libs = db.select().from(libraryShows).all();
  for (const lib of libs) {
    const show = db.select().from(shows).where(eq(shows.tmdbId, lib.showId)).get();
    if (!show) continue;
    const progress = getShowProgress(lib.showId);
    grouped[libraryGroupFor(lib.status, progress)].push({
      show,
      lib,
      progress,
      genres: parseGenres(show.genres),
      providers: parseFlatrate(show.watchProviders),
      lastWatchedAt: lastWatchedAtForShow(lib.showId),
    });
  }
  return grouped;
}
