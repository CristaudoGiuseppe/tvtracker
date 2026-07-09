import { eq, and } from 'drizzle-orm';
import { getDb } from '../../db';
import { episodes, watches, libraryShows } from '../../db/schema';
import { addShow, addMovie, setMovieState, type LibStatus } from '../library';
import { findEpisodeByTvdbId, TmdbError } from '../tmdb';
import type { ParsedExport, ShowFollow } from './parse';
import type { MatchedExport } from './match';

export type ImportPreview = {
  shows: number;
  /** Episode watches belonging to a matched show; actual (season,episode)->tmdb
   * resolution happens only during runImport, so this is not a guaranteed import count. */
  episodesOfMatchedShows: number;
  movies: number;
  watchlist: number;
  follows: number;
  unmatchedShows: string[];
  unmatchedMovies: string[];
  /** Structured unmatched entries carrying the identifiers the manual-match UI
   * needs (tvdbSeriesId for shows, name+year for movies). The plain string
   * arrays above are kept for existing callers/tests. */
  unmatchedShowItems: { tvdbSeriesId: number; seriesName: string }[];
  unmatchedMovieItems: { movieName: string; releaseYear: number | null }[];
};

export type EpisodeMismatch = { show: string; season: number; episode: number; count: number };

export type ImportReport = {
  imported: { shows: number; episodes: number; movies: number; watchlist: number; follows: number };
  skippedDuplicates: number;
  /** Episode watches whose (season,episode) numbering mismatched TMDB but were
   * recovered via the export's tvdb ep_id (also included in imported.episodes). */
  recoveredByEpisodeId: number;
  errors: string[];
  episodeMismatches: EpisodeMismatch[];
  unmatched: { shows: string[]; movies: string[] };
};

const movieKey = (name: string, year: number | null) => `${name.toLowerCase()}|${year ?? ''}`;

function matchedShowMap(matched: MatchedExport): Map<number, number> {
  const map = new Map<number, number>();
  for (const s of matched.shows) if (s.tmdbId !== null) map.set(s.tvdbSeriesId, s.tmdbId);
  return map;
}

function matchedMovieMap(matched: MatchedExport): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of matched.movies) if (m.tmdbId !== null) map.set(movieKey(m.movieName, m.releaseYear), m.tmdbId);
  return map;
}

function statusFromFollow(follow: ShowFollow | undefined): LibStatus {
  if (!follow) return 'watching';
  if (follow.isForLater) return 'for_later';
  if (follow.isArchived) return 'stopped';
  return 'watching';
}

// --- dry run (pure: no db writes, no network) ------------------------------

export function dryRun(parsed: ParsedExport, matched: MatchedExport): ImportPreview {
  const showMap = matchedShowMap(matched);
  const movieMap = matchedMovieMap(matched);

  const watchedTmdb = new Set<number>();
  for (const m of parsed.movieWatches) {
    const id = movieMap.get(movieKey(m.movieName, m.releaseYear));
    if (id !== undefined) watchedTmdb.add(id);
  }
  const watchlistTmdb = new Set<number>();
  for (const m of parsed.movieWatchlist) {
    const id = movieMap.get(movieKey(m.movieName, m.releaseYear));
    if (id !== undefined && !watchedTmdb.has(id)) watchlistTmdb.add(id);
  }

  return {
    shows: matched.shows.filter(s => s.tmdbId !== null).length,
    episodesOfMatchedShows: parsed.episodeWatches.filter(e => showMap.has(e.tvdbSeriesId)).length,
    movies: watchedTmdb.size,
    watchlist: watchlistTmdb.size,
    follows: parsed.showFollows.filter(f => showMap.has(f.tvdbSeriesId)).length,
    unmatchedShows: matched.unmatchedShows,
    unmatchedMovies: matched.unmatchedMovies,
    unmatchedShowItems: matched.shows
      .filter(s => s.tmdbId === null)
      .map(s => ({ tvdbSeriesId: s.tvdbSeriesId, seriesName: s.seriesName })),
    unmatchedMovieItems: matched.movies
      .filter(m => m.tmdbId === null)
      .map(m => ({ movieName: m.movieName, releaseYear: m.releaseYear })),
  };
}

// --- real import -----------------------------------------------------------

/** Inserts one episode watch with per-episode rewatch indexing, skipping exact
 * (episode, watchedAt) duplicates. Returns true when a new row was inserted. */
function insertEpisodeWatch(
  db: ReturnType<typeof getDb>,
  episodeId: number,
  showId: number,
  watchedAt: string,
  nextIndex: Map<number, number>,
  report: ImportReport,
): boolean {
  if (!nextIndex.has(episodeId)) {
    const count = db.select().from(watches).where(and(eq(watches.kind, 'episode'), eq(watches.episodeId, episodeId))).all().length;
    nextIndex.set(episodeId, count);
  }

  const dup = db
    .select()
    .from(watches)
    .where(and(eq(watches.kind, 'episode'), eq(watches.episodeId, episodeId), eq(watches.watchedAt, watchedAt)))
    .get();
  if (dup) {
    report.skippedDuplicates++;
    return false;
  }

  const idx = nextIndex.get(episodeId)!;
  db.insert(watches).values({ kind: 'episode', episodeId, showId, watchedAt, rewatchIndex: idx }).run();
  nextIndex.set(episodeId, idx + 1);
  report.imported.episodes++;
  return true;
}

async function importShowEpisodes(
  tmdbId: number,
  seriesName: string,
  showWatches: ParsedExport['episodeWatches'],
  report: ImportReport,
): Promise<void> {
  const db = getDb();

  // (season-episode) -> tmdb episode id for this show
  const epRows = db.select().from(episodes).where(eq(episodes.showId, tmdbId)).all();
  const byKey = new Map<string, number>();
  for (const e of epRows) byKey.set(`${e.seasonNumber}-${e.episodeNumber}`, e.tmdbId);

  const mismatches = new Map<string, EpisodeMismatch>();
  const nextIndex = new Map<number, number>();

  const recordMismatch = (w: ParsedExport['episodeWatches'][number]) => {
    const key = `${w.season}-${w.episode}`;
    const existing = mismatches.get(key);
    if (existing) existing.count++;
    else mismatches.set(key, { show: seriesName, season: w.season, episode: w.episode, count: 1 });
  };

  for (const w of showWatches) {
    const epId = byKey.get(`${w.season}-${w.episode}`);
    if (epId !== undefined) {
      insertEpisodeWatch(db, epId, tmdbId, w.watchedAt, nextIndex, report);
      continue;
    }

    // No (season,episode) match. Try the exact ep_id fallback: TVDB episode id
    // -> TMDB episode via /find. Only recover when that episode is already
    // cached (belongs to an imported show); use the episode's own show id.
    if (w.tvdbEpisodeId !== null) {
      let found: Awaited<ReturnType<typeof findEpisodeByTvdbId>> = null;
      try {
        found = await findEpisodeByTvdbId(w.tvdbEpisodeId);
      } catch (err) {
        if (!(err instanceof TmdbError)) throw err;
        report.errors.push(`recovery: TMDB find failed for ep_id ${w.tvdbEpisodeId} (${seriesName}): ${err.message}`);
        recordMismatch(w);
        continue;
      }
      if (found) {
        const epRow = db.select().from(episodes).where(eq(episodes.tmdbId, found.episodeTmdbId)).get();
        // Cached episodes/shows rows outlive removeShow (which only clears
        // watches/ratings/library rows), so also require the episode's show
        // to still be in the library before inserting a watch for it.
        const inLibrary = epRow && db.select().from(libraryShows).where(eq(libraryShows.showId, epRow.showId)).get();
        if (epRow && inLibrary) {
          const inserted = insertEpisodeWatch(db, epRow.tmdbId, epRow.showId, w.watchedAt, nextIndex, report);
          if (inserted) report.recoveredByEpisodeId++;
          continue;
        }
      }
    }

    recordMismatch(w);
  }

  for (const m of mismatches.values()) report.episodeMismatches.push(m);
}

export async function runImport(
  parsed: ParsedExport,
  matched: MatchedExport,
  onProgress?: (msg: string) => void,
): Promise<ImportReport> {
  const report: ImportReport = {
    imported: { shows: 0, episodes: 0, movies: 0, watchlist: 0, follows: 0 },
    skippedDuplicates: 0,
    recoveredByEpisodeId: 0,
    errors: [],
    episodeMismatches: [],
    unmatched: { shows: matched.unmatchedShows, movies: matched.unmatchedMovies },
  };

  const showMap = matchedShowMap(matched);
  const followByTvdb = new Map<number, ShowFollow>();
  for (const f of parsed.showFollows) followByTvdb.set(f.tvdbSeriesId, f);

  // episode watches grouped by tvdb series id, preserving export order
  const watchesByTvdb = new Map<number, ParsedExport['episodeWatches']>();
  for (const e of parsed.episodeWatches) {
    const list = watchesByTvdb.get(e.tvdbSeriesId) ?? [];
    list.push(e);
    watchesByTvdb.set(e.tvdbSeriesId, list);
  }

  // --- shows (with their episode watches) --------------------------------
  for (const show of matched.shows) {
    if (show.tmdbId === null) continue;
    const follow = followByTvdb.get(show.tvdbSeriesId);
    try {
      await addShow(show.tmdbId, statusFromFollow(follow));
      report.imported.shows++;
      if (follow) report.imported.follows++;
      onProgress?.(`Imported show ${show.seriesName}`);
      const showWatches = watchesByTvdb.get(show.tvdbSeriesId) ?? [];
      await importShowEpisodes(show.tmdbId, show.seriesName, showWatches, report);
    } catch (err) {
      report.errors.push(`${show.seriesName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // --- movies: watched first (so watchlist never downgrades) -------------
  const movieMap = matchedMovieMap(matched);
  const db = getDb();

  const watchedByTmdb = new Map<number, { earliest: string; rewatchCount: number }>();
  for (const m of parsed.movieWatches) {
    const id = movieMap.get(movieKey(m.movieName, m.releaseYear));
    if (id === undefined) continue;
    const cur = watchedByTmdb.get(id);
    if (!cur) {
      watchedByTmdb.set(id, { earliest: m.watchedAt, rewatchCount: m.rewatchCount });
    } else {
      if (m.watchedAt < cur.earliest) cur.earliest = m.watchedAt;
      if (m.rewatchCount > cur.rewatchCount) cur.rewatchCount = m.rewatchCount;
    }
  }

  for (const [tmdbId, { earliest, rewatchCount }] of watchedByTmdb) {
    try {
      await addMovie(tmdbId, 'watched', earliest);
      setMovieState(tmdbId, 'watched');
      const desired = 1 + (rewatchCount > 0 ? rewatchCount : 0);
      let existing = db.select().from(watches).where(and(eq(watches.kind, 'movie'), eq(watches.movieId, tmdbId))).all().length;
      for (; existing < desired; existing++) {
        db.insert(watches).values({ kind: 'movie', movieId: tmdbId, watchedAt: earliest, rewatchIndex: existing }).run();
      }
      report.imported.movies++;
      onProgress?.(`Imported movie ${tmdbId}`);
    } catch (err) {
      report.errors.push(`movie ${tmdbId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const watchlistTmdb = new Set<number>();
  for (const m of parsed.movieWatchlist) {
    const id = movieMap.get(movieKey(m.movieName, m.releaseYear));
    if (id !== undefined && !watchedByTmdb.has(id)) watchlistTmdb.add(id);
  }
  for (const tmdbId of watchlistTmdb) {
    try {
      await addMovie(tmdbId, 'watchlist');
      report.imported.watchlist++;
    } catch (err) {
      report.errors.push(`movie ${tmdbId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return report;
}
