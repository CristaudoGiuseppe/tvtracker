// Live smoke test for src/lib/tmdb.ts — hits the real TMDB API using the
// token in .env. Not part of the automated test suite (no network in unit tests).
// Run with: npx tsx scripts/tmdb-smoke.ts
process.loadEnvFile('.env');

import { findByTvdbId, getShowFull } from '../src/lib/tmdb';

async function main() {
  const BREAKING_BAD_TVDB_ID = 81189;
  const { tvId } = await findByTvdbId(BREAKING_BAD_TVDB_ID);
  console.log('findByTvdbId(81189) ->', tvId);

  if (tvId == null) {
    throw new Error('Expected a TMDB match for Breaking Bad (tvdb id 81189)');
  }
  if (tvId !== 1396) {
    console.warn(`Warning: expected TMDB id 1396 for Breaking Bad, got ${tvId}`);
  }

  const show = await getShowFull(tvId);
  console.log('getShowFull name ->', show.name);
  console.log('seasons ->', show.seasons.length);
}

main().catch(err => {
  console.error('tmdb-smoke failed:', err);
  process.exit(1);
});
