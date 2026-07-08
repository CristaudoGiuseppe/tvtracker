/**
 * Real-export dry-run validation (Task 6, Step 5).
 *
 * parse -> match -> dryRun against import/extracted-main with the real TMDB
 * token. NO import writes (uses an in-memory db purely so matchExport can read
 * the empty overrides table). Also prints the vote_key suffix distribution from
 * ratings-3-prod-episode_votes.csv as evidence for the ratings-import decision.
 *
 *   npx tsx scripts/import-real.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';

// Load .env for TMDB_READ_TOKEN and keep all db access off the real data dir.
process.loadEnvFile();
process.env.DATA_DIR = ':memory:';

import { parseExport } from '../src/lib/importer/parse';
import { matchExport } from '../src/lib/importer/match';
import { dryRun } from '../src/lib/importer/run';

const DIR = 'import/extracted-main';

function voteSuffixDistribution(): void {
  const raw = readFileSync(join(DIR, 'ratings-3-prod-episode_votes.csv'), 'utf8');
  const rows = parseCsv(raw, { columns: true, skip_empty_lines: true, bom: true }) as Record<string, string>[];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const vk = row.vote_key ?? '';
    if (!vk) continue;
    const suffix = vk.split('-').pop()!;
    counts.set(suffix, (counts.get(suffix) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n=== ratings-3 vote_key suffix distribution (${rows.length} rows, ${counts.size} distinct suffixes) ===`);
  for (const [suffix, n] of sorted.slice(0, 15)) {
    console.log(`  ${suffix.padStart(4)} : ${n}`);
  }
}

async function main(): Promise<void> {
  console.time('total');
  const parsed = parseExport(DIR);
  console.log('=== parsed ===');
  console.log(`  episodeWatches : ${parsed.episodeWatches.length}`);
  console.log(`  showFollows    : ${parsed.showFollows.length}`);
  console.log(`  movieWatches   : ${parsed.movieWatches.length}`);
  console.log(`  movieWatchlist : ${parsed.movieWatchlist.length}`);
  console.log(`  warnings       : ${parsed.warnings.length}`);

  const distinctShows = new Set<number>();
  for (const e of parsed.episodeWatches) distinctShows.add(e.tvdbSeriesId);
  for (const f of parsed.showFollows) distinctShows.add(f.tvdbSeriesId);
  console.log(`  distinct shows : ${distinctShows.size}`);

  console.log('\nMatching (throttled TMDB client, may take a few minutes)...');
  const matched = await matchExport(parsed);
  const preview = dryRun(parsed, matched);

  console.log('\n=== dryRun preview ===');
  console.log(`  shows     : ${preview.shows}`);
  console.log(`  episodes  : ${preview.episodes}`);
  console.log(`  follows   : ${preview.follows}`);
  console.log(`  movies    : ${preview.movies}`);
  console.log(`  watchlist : ${preview.watchlist}`);
  console.log(`  unmatched shows  : ${preview.unmatchedShows.length}`);
  console.log(`  unmatched movies : ${preview.unmatchedMovies.length}`);

  if (preview.unmatchedShows.length) {
    console.log('\n  unmatched show names:');
    for (const s of preview.unmatchedShows) console.log(`    - ${s}`);
  }
  if (preview.unmatchedMovies.length) {
    console.log('\n  unmatched movie names:');
    for (const m of preview.unmatchedMovies) console.log(`    - ${m}`);
  }

  if (parsed.warnings.length) {
    console.log(`\n  first 10 warnings (of ${parsed.warnings.length}):`);
    for (const w of parsed.warnings.slice(0, 10)) console.log(`    - ${w}`);
  }

  voteSuffixDistribution();
  console.timeEnd('total');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
