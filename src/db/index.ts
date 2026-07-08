import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from './schema';
import { statements } from './migrations';

let instance: BetterSQLite3Database<typeof schema> | null = null;

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (instance) return instance;
  const dataDir = process.env.DATA_DIR ?? './data';
  let sqlite: Database.Database;
  if (dataDir === ':memory:') sqlite = new Database(':memory:');
  else { mkdirSync(dataDir, { recursive: true }); sqlite = new Database(join(dataDir, 'tvtracker.db')); }
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  instance = drizzle(sqlite, { schema });
  migrate(sqlite);
  return instance;
}

export function resetDbForTests(): void { process.env.DATA_DIR = ':memory:'; instance = null; }

function migrate(sqlite: Database.Database): void {
  // Generated SQL checked in via drizzle-kit; executed idempotently.
  // Run `npx drizzle-kit generate` after any schema.ts change and re-export
  // the statements from src/db/migrations.ts (string[] of CREATE ... IF NOT EXISTS).
  for (const stmt of statements) sqlite.exec(stmt);
}
