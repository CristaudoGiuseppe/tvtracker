CREATE TABLE `episodes` (
	`tmdb_id` integer PRIMARY KEY NOT NULL,
	`show_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`episode_number` integer NOT NULL,
	`name` text,
	`overview` text,
	`still_path` text,
	`air_date` text,
	`runtime` integer,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`tmdb_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ep_show_se` ON `episodes` (`show_id`,`season_number`,`episode_number`);--> statement-breakpoint
CREATE TABLE `library_movies` (
	`movie_id` integer PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`added_at` text NOT NULL,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`tmdb_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `library_shows` (
	`show_id` integer PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`is_favorite` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`added_at` text NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`tmdb_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `movies` (
	`tmdb_id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`overview` text,
	`poster_path` text,
	`backdrop_path` text,
	`genres` text,
	`runtime` integer,
	`release_date` text,
	`last_synced_at` text
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`target_id` integer NOT NULL,
	`rating` integer NOT NULL,
	`rated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rating_unique` ON `ratings` (`kind`,`target_id`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`show_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`name` text,
	`poster_path` text,
	`episode_count` integer,
	`air_date` text,
	PRIMARY KEY(`show_id`, `season_number`),
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`tmdb_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shows` (
	`tmdb_id` integer PRIMARY KEY NOT NULL,
	`tvdb_id` integer,
	`name` text NOT NULL,
	`overview` text,
	`poster_path` text,
	`backdrop_path` text,
	`status` text,
	`genres` text,
	`episode_run_time` integer,
	`last_synced_at` text
);
--> statement-breakpoint
CREATE TABLE `watches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`episode_id` integer,
	`show_id` integer,
	`movie_id` integer,
	`watched_at` text NOT NULL,
	`rewatch_index` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watch_unique` ON `watches` (`kind`,`episode_id`,`movie_id`,`rewatch_index`);--> statement-breakpoint
CREATE INDEX `watch_show` ON `watches` (`show_id`);