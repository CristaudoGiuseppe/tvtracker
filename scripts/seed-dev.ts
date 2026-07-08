// Seeds the local dev database with one real show (Breaking Bad) and a few
// episode check-ins, so the three screens have something to render in the
// browser. Hits the real TMDB API using the token in .env.
// Run with: npx tsx scripts/seed-dev.ts
import { and, eq } from 'drizzle-orm';
import { addShow, addMovie, checkInEpisode } from '../src/lib/library';
import { getDb } from '../src/db';
import { episodes, movies } from '../src/db/schema';

process.loadEnvFile('.env');

const BREAKING_BAD = 1396;
const FOUNDATION = 93740; // "Returning Series" — gives the Upcoming screen a chance at real dates
const FIGHT_CLUB = 550; // watched movie
const THE_MATRIX = 603; // watchlist movie
const CHECK_IN_COUNT = 4;

async function main(): Promise<void> {
  console.log('Adding Breaking Bad (1396) as "watching"…');
  await addShow(BREAKING_BAD, 'watching');

  console.log('Adding Foundation (93740) as "watching" (for Upcoming)…');
  await addShow(FOUNDATION, 'watching');

  console.log('Adding Fight Club (550) as watched, The Matrix (603) to watchlist…');
  await addMovie(FIGHT_CLUB, 'watched');
  await addMovie(THE_MATRIX, 'watchlist');

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
  const fightClub = db.select().from(movies).where(eq(movies.tmdbId, FIGHT_CLUB)).get();
  console.log(
    `\nSeeded. ${toCheckIn.length} episodes watched; next up = ` +
      (next ? `S1E${next.episodeNumber} "${next.name}".` : '(none).'),
  );
  console.log(`Fight Club runtime = ${fightClub?.runtime ?? '?'} min (for the stats hand-check).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
