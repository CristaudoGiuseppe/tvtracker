// Seeds the local dev database with one real show (Breaking Bad) and a few
// episode check-ins, so the three screens have something to render in the
// browser. Hits the real TMDB API using the token in .env.
// Run with: npx tsx scripts/seed-dev.ts
import { and, eq } from 'drizzle-orm';
import { addShow, checkInEpisode } from '../src/lib/library';
import { getDb } from '../src/db';
import { episodes } from '../src/db/schema';

process.loadEnvFile('.env');

const BREAKING_BAD = 1396;
const CHECK_IN_COUNT = 4;

async function main(): Promise<void> {
  console.log('Adding Breaking Bad (1396) as "watching"…');
  await addShow(BREAKING_BAD, 'watching');

  const db = getDb();
  const season1 = db
    .select()
    .from(episodes)
    .where(and(eq(episodes.showId, BREAKING_BAD), eq(episodes.seasonNumber, 1)))
    .all()
    .sort((a, b) => a.episodeNumber - b.episodeNumber);

  const toCheckIn = season1.slice(0, CHECK_IN_COUNT);
  for (const ep of toCheckIn) {
    checkInEpisode(ep.tmdbId);
    console.log(`  ✓ checked in S1E${ep.episodeNumber} — ${ep.name}`);
  }

  const next = season1[CHECK_IN_COUNT];
  console.log(
    `\nSeeded. ${toCheckIn.length} episodes watched; next up = ` +
      (next ? `S1E${next.episodeNumber} "${next.name}".` : '(none).'),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
