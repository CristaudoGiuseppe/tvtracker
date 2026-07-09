import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import AdmZip from 'adm-zip';

export type EpisodeWatch = {
  tvdbSeriesId: number;
  seriesName: string;
  season: number;
  episode: number;
  watchedAt: string;
  isRewatch: boolean;
  /** TVDB episode id from the export's `ep_id` column; null when the column is
   * absent (some export variants) or empty. Used to recover episodes whose
   * (season,episode) numbering disagrees between TVDB and TMDB. */
  tvdbEpisodeId: number | null;
};

export type ShowFollow = {
  tvdbSeriesId: number;
  seriesName: string;
  isForLater: boolean;
  isArchived: boolean;
  followedAt: string;
};

export type MovieWatch = {
  movieName: string;
  releaseYear: number | null;
  runtimeMin: number | null;
  watchedAt: string;
  rewatchCount: number;
};

export type MovieWatchlistEntry = {
  movieName: string;
  releaseYear: number | null;
  addedAt: string;
};

export type ParsedExport = {
  episodeWatches: EpisodeWatch[];
  showFollows: ShowFollow[];
  movieWatches: MovieWatch[];
  movieWatchlist: MovieWatchlistEntry[];
  warnings: string[];
};

type Row = Record<string, string>;

// --- CSV access, tolerant of missing files and header variants -------------

/** Reads the named CSVs from a directory or a .zip path. Missing files -> []. */
function loadCsvs(zipOrDir: string, names: string[]): Map<string, Row[]> {
  const out = new Map<string, Row[]>();
  const isZip = zipOrDir.toLowerCase().endsWith('.zip');

  const contents = new Map<string, string>();
  if (isZip) {
    const zip = new AdmZip(zipOrDir);
    for (const entry of zip.getEntries()) {
      const base = entry.entryName.split('/').pop() ?? entry.entryName;
      contents.set(base, entry.getData().toString('utf8'));
    }
  } else {
    for (const file of readdirSync(zipOrDir)) {
      // read lazily below; store only names we care about
      if (names.includes(file)) contents.set(file, readFileSync(join(zipOrDir, file), 'utf8'));
    }
  }

  for (const name of names) {
    const raw = contents.get(name);
    if (raw === undefined) {
      out.set(name, []);
      continue;
    }
    const rows = parseCsv(raw, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    }) as Row[];
    out.set(name, rows);
  }
  return out;
}

// --- small field helpers ----------------------------------------------------

function toInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

function yearOf(releaseDate: string | undefined): number | null {
  if (!releaseDate) return null;
  const m = releaseDate.trim().match(/^(\d{4})/);
  return m ? Number.parseInt(m[1], 10) : null;
}

function isTrue(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}

// --- parsers per source file ------------------------------------------------

function parseV2(rows: Row[], out: ParsedExport): void {
  for (const row of rows) {
    const episodeStr = (row.episode_number ?? '').trim();
    const key = row.key ?? '';

    if (episodeStr !== '') {
      // episode watch row
      const tvdbSeriesId = toInt(row.s_id);
      const seriesName = (row.series_name ?? '').trim();
      const episode = toInt(episodeStr);
      if (tvdbSeriesId === null || seriesName === '' || episode === null) {
        out.warnings.push(
          `v2: skipped episode row with empty s_id/series_name (uuid=${row.uuid ?? '?'})`,
        );
        continue;
      }
      out.episodeWatches.push({
        tvdbSeriesId,
        seriesName,
        season: toInt(row.season_number) ?? 0,
        episode,
        watchedAt: ((row.created_at ?? '').trim() || (row.updated_at ?? '').trim()),
        isRewatch: key.startsWith('rewatch'),
        tvdbEpisodeId: toInt(row.ep_id),
      });
      continue;
    }

    // non-episode row. Movie rows don't appear in v2 exports; skip anything
    // without a series identity. Otherwise it's a series-level follow record.
    const movieName = (row.movie_name ?? '').trim();
    if (movieName !== '') continue;

    const tvdbSeriesId = toInt(row.s_id);
    const seriesName = (row.series_name ?? '').trim();
    if (tvdbSeriesId === null || seriesName === '') {
      out.warnings.push(`v2: skipped follow row with empty s_id/series_name (uuid=${row.uuid ?? '?'})`);
      continue;
    }
    out.showFollows.push({
      tvdbSeriesId,
      seriesName,
      isForLater: isTrue(row.is_for_later),
      isArchived: isTrue(row.is_archived),
      followedAt: ((row.followed_at ?? '').trim() || (row.created_at ?? '').trim() || (row.updated_at ?? '').trim()),
    });
  }
}

function movieDedupeKey(movieName: string, releaseYear: number | null): string {
  return `${movieName.toLowerCase()}|${releaseYear ?? ''}`;
}

function parseLegacyMovies(rows: Row[], out: ParsedExport): void {
  const followCandidates: MovieWatchlistEntry[] = [];

  for (const row of rows) {
    if ((row.entity_type ?? '').trim() !== 'movie') continue;
    const type = (row.type ?? '').trim();
    const movieName = (row.movie_name ?? '').trim();
    if (movieName === '') {
      out.warnings.push(`legacy: skipped movie row with empty movie_name (uuid=${row.uuid ?? '?'})`);
      continue;
    }
    const releaseYear = yearOf(row.release_date);

    if (type === 'watch') {
      const runtimeSec = toInt(row.runtime);
      out.movieWatches.push({
        movieName,
        releaseYear,
        runtimeMin: runtimeSec === null ? null : Math.round(runtimeSec / 60),
        watchedAt: ((row.watch_date ?? '').trim() || (row.created_at ?? '').trim() || (row.updated_at ?? '').trim()),
        rewatchCount: toInt(row.rewatch_count) ?? 0,
      });
    } else if (type === 'towatch') {
      out.movieWatchlist.push({
        movieName,
        releaseYear,
        addedAt: ((row.created_at ?? '').trim() || (row.updated_at ?? '').trim()),
      });
    } else if (type === 'follow') {
      // Usually a redundant library-membership marker, but it's sometimes the
      // only name-bearing record for a movie (e.g. its watch row lost its
      // movie_name). Recover it as a watchlist candidate; real watch/towatch
      // rows always take precedence (deduped below).
      followCandidates.push({
        movieName,
        releaseYear,
        addedAt: ((row.created_at ?? '').trim() || (row.updated_at ?? '').trim()),
      });
    }
  }

  if (followCandidates.length > 0) {
    const known = new Set<string>();
    for (const m of out.movieWatches) known.add(movieDedupeKey(m.movieName, m.releaseYear));
    for (const m of out.movieWatchlist) known.add(movieDedupeKey(m.movieName, m.releaseYear));

    for (const candidate of followCandidates) {
      const key = movieDedupeKey(candidate.movieName, candidate.releaseYear);
      if (known.has(key)) continue;
      known.add(key);
      out.movieWatchlist.push(candidate);
    }
  }
}

/** Merges followed_tv_show.csv into showFollows. v2 wins; this fills gaps and
 * ORs in the archived flag. */
function mergeFollowedShows(rows: Row[], out: ParsedExport): void {
  const byId = new Map<number, ShowFollow>();
  for (const f of out.showFollows) byId.set(f.tvdbSeriesId, f);

  for (const row of rows) {
    const tvdbSeriesId = toInt(row.tv_show_id);
    if (tvdbSeriesId === null) continue;
    const archived = (row.archived ?? '').trim() === '1';
    const existing = byId.get(tvdbSeriesId);
    if (existing) {
      if (archived) existing.isArchived = true;
      continue;
    }
    const follow: ShowFollow = {
      tvdbSeriesId,
      seriesName: (row.tv_show_name ?? '').trim(),
      isForLater: false,
      isArchived: archived,
      followedAt: ((row.created_at ?? '').trim() || (row.updated_at ?? '').trim()),
    };
    byId.set(tvdbSeriesId, follow);
    out.showFollows.push(follow);
  }
}

const V2_FILE = 'tracking-prod-records-v2.csv';
const LEGACY_FILE = 'tracking-prod-records.csv';
const FOLLOWED_FILE = 'followed_tv_show.csv';

export function parseExport(zipOrDir: string): ParsedExport {
  const out: ParsedExport = {
    episodeWatches: [],
    showFollows: [],
    movieWatches: [],
    movieWatchlist: [],
    warnings: [],
  };

  const csvs = loadCsvs(zipOrDir, [V2_FILE, LEGACY_FILE, FOLLOWED_FILE]);
  parseV2(csvs.get(V2_FILE) ?? [], out);
  parseLegacyMovies(csvs.get(LEGACY_FILE) ?? [], out);
  mergeFollowedShows(csvs.get(FOLLOWED_FILE) ?? [], out);

  return out;
}
