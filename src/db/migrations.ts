// Generated from `npx drizzle-kit generate` (see drizzle/0000_lazy_lenny_balinger.sql),
// converted to idempotent `IF NOT EXISTS` statements and executed directly at db open time.
// No migration framework at runtime — regenerate this file after any schema.ts change.

export const statements: string[] = [
  `CREATE TABLE IF NOT EXISTS \`shows\` (
	\`tmdb_id\` integer PRIMARY KEY NOT NULL,
	\`tvdb_id\` integer,
	\`name\` text NOT NULL,
	\`overview\` text,
	\`poster_path\` text,
	\`backdrop_path\` text,
	\`status\` text,
	\`genres\` text,
	\`episode_run_time\` integer,
	\`last_synced_at\` text
)`,
  `CREATE TABLE IF NOT EXISTS \`movies\` (
	\`tmdb_id\` integer PRIMARY KEY NOT NULL,
	\`title\` text NOT NULL,
	\`overview\` text,
	\`poster_path\` text,
	\`backdrop_path\` text,
	\`genres\` text,
	\`runtime\` integer,
	\`release_date\` text,
	\`last_synced_at\` text
)`,
  `CREATE TABLE IF NOT EXISTS \`seasons\` (
	\`show_id\` integer NOT NULL,
	\`season_number\` integer NOT NULL,
	\`name\` text,
	\`poster_path\` text,
	\`episode_count\` integer,
	\`air_date\` text,
	PRIMARY KEY(\`show_id\`, \`season_number\`),
	FOREIGN KEY (\`show_id\`) REFERENCES \`shows\`(\`tmdb_id\`) ON UPDATE no action ON DELETE no action
)`,
  `CREATE TABLE IF NOT EXISTS \`episodes\` (
	\`tmdb_id\` integer PRIMARY KEY NOT NULL,
	\`show_id\` integer NOT NULL,
	\`season_number\` integer NOT NULL,
	\`episode_number\` integer NOT NULL,
	\`name\` text,
	\`overview\` text,
	\`still_path\` text,
	\`air_date\` text,
	\`runtime\` integer,
	FOREIGN KEY (\`show_id\`) REFERENCES \`shows\`(\`tmdb_id\`) ON UPDATE no action ON DELETE no action
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`ep_show_se\` ON \`episodes\` (\`show_id\`,\`season_number\`,\`episode_number\`)`,
  `CREATE TABLE IF NOT EXISTS \`library_shows\` (
	\`show_id\` integer PRIMARY KEY NOT NULL,
	\`status\` text NOT NULL,
	\`is_favorite\` integer DEFAULT 0 NOT NULL,
	\`archived\` integer DEFAULT 0 NOT NULL,
	\`added_at\` text NOT NULL,
	FOREIGN KEY (\`show_id\`) REFERENCES \`shows\`(\`tmdb_id\`) ON UPDATE no action ON DELETE no action
)`,
  `CREATE TABLE IF NOT EXISTS \`library_movies\` (
	\`movie_id\` integer PRIMARY KEY NOT NULL,
	\`state\` text NOT NULL,
	\`added_at\` text NOT NULL,
	FOREIGN KEY (\`movie_id\`) REFERENCES \`movies\`(\`tmdb_id\`) ON UPDATE no action ON DELETE no action
)`,
  `CREATE TABLE IF NOT EXISTS \`watches\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`kind\` text NOT NULL,
	\`episode_id\` integer,
	\`show_id\` integer,
	\`movie_id\` integer,
	\`watched_at\` text NOT NULL,
	\`rewatch_index\` integer DEFAULT 0 NOT NULL
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`watch_unique\` ON \`watches\` (\`kind\`,\`episode_id\`,\`movie_id\`,\`rewatch_index\`)`,
  `CREATE INDEX IF NOT EXISTS \`watch_show\` ON \`watches\` (\`show_id\`)`,
  `CREATE TABLE IF NOT EXISTS \`ratings\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`kind\` text NOT NULL,
	\`target_id\` integer NOT NULL,
	\`rating\` integer NOT NULL,
	\`rated_at\` text NOT NULL
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`rating_unique\` ON \`ratings\` (\`kind\`,\`target_id\`)`,
  `CREATE TABLE IF NOT EXISTS \`settings\` (
	\`key\` text PRIMARY KEY NOT NULL,
	\`value\` text NOT NULL
)`,
];

// Additive ALTER TABLE statements (drizzle/0001+). SQLite has no
// `ADD COLUMN IF NOT EXISTS`, so these are executed with a duplicate-column
// guard in db/index.ts — they must stay idempotent when re-run on an existing db.
export const alterStatements: string[] = [
  `ALTER TABLE \`movies\` ADD \`watch_providers\` text`,
  `ALTER TABLE \`shows\` ADD \`watch_providers\` text`,
];
