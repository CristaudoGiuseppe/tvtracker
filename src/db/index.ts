import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from './schema';
import { statements, alterStatements } from './migrations';

let instance: BetterSQLite3Database<typeof schema> | null = null;
let sqliteHandle: Database.Database | null = null;

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (instance) return instance;
  const dataDir = process.env.DATA_DIR ?? './data';
  let sqlite: Database.Database;
  if (dataDir === ':memory:') sqlite = new Database(':memory:');
  else { mkdirSync(dataDir, { recursive: true }); sqlite = new Database(join(dataDir, 'tvtracker.db')); }
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqliteHandle = sqlite;
  instance = drizzle(sqlite, { schema });
  migrate(sqlite);
  return instance;
}

export function resetDbForTests(): void { sqliteHandle?.close(); sqliteHandle = null; process.env.DATA_DIR = ':memory:'; instance = null; }

function migrate(sqlite: Database.Database): void {
  // Generated SQL checked in via drizzle-kit; executed idempotently.
  // Run `npx drizzle-kit generate` after any schema.ts change and re-export
  // the statements from src/db/migrations.ts (string[] of CREATE ... IF NOT EXISTS).
  for (const stmt of statements) sqlite.exec(stmt);
  // Additive column migrations: SQLite lacks `ADD COLUMN IF NOT EXISTS`, so
  // re-running throws "duplicate column name". Swallow only that error to stay
  // idempotent; anything else is a real failure and must propagate.
  for (const stmt of alterStatements) {
    try {
      sqlite.exec(stmt);
    } catch (err) {
      if (err instanceof Error && /duplicate column name/i.test(err.message)) continue;
      throw err;
    }
  }
}
