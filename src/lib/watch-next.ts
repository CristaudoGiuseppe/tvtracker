import { eq, and } from 'drizzle-orm';
import { getDb } from '../db';
import { shows, episodes, libraryShows, watches } from '../db/schema';

export type ShowRow = typeof shows.$inferSelect;
export type EpisodeRow = typeof episodes.$inferSelect;
export type LibraryShowRow = typeof libraryShows.$inferSelect;

type LibraryGroup = 'watching' | 'up_to_date' | 'for_later' | 'finished' | 'stopped';

export interface ShowProgress {
  airedCount: number;
  watchedCount: number;
  nextEpisode: EpisodeRow | null;
  upToDate: boolean;
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

/** 'watching', non-archived shows that have a next episode; ordered by last-watch recency desc, never-watched last. */
export function getWatchNextList(): { show: ShowRow; lib: LibraryShowRow; next: EpisodeRow; lastWatchedAt: string | null }[] {
  const db = getDb();
  const todayStr = today();
  const libs = db.select().from(libraryShows).where(and(eq(libraryShows.status, 'watching'), eq(libraryShows.archived, 0))).all();

  const results: { show: ShowRow; lib: LibraryShowRow; next: EpisodeRow; lastWatchedAt: string | null }[] = [];
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
    results.push({ show, lib, next: progress.nextEpisode, lastWatchedAt });
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

/**
 * Display grouping for the whole library: stored 'watching' splits into 'watching' vs 'up_to_date' via progress;
 * other stored statuses map to their own group. Archived shows still appear here (archived only suppresses
 * watch-next/upcoming noise, it does not remove a show from its library group).
 */
export function getLibraryGrouped(): Record<LibraryGroup, { show: ShowRow; lib: LibraryShowRow; progress: ShowProgress }[]> {
  const db = getDb();
  const grouped: Record<LibraryGroup, { show: ShowRow; lib: LibraryShowRow; progress: ShowProgress }[]> = {
    watching: [],
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
    const group: LibraryGroup = lib.status === 'watching' ? (progress.upToDate ? 'up_to_date' : 'watching') : (lib.status as LibraryGroup);
    grouped[group].push({ show, lib, progress });
  }
  return grouped;
}
