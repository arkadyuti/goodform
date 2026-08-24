import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index.js';

/**
 * Finds the migrations folder.
 *
 * This file runs from two different places: through tsx at `src/db/migrate.ts`
 * in development, and as a bundle at `dist/migrate.js` in production. Those sit
 * at different depths, so a fixed relative path is wrong in one of them. Walk
 * up instead, and let a deployment override it outright.
 */
function migrationsFolder(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'drizzle');
    if (existsSync(join(candidate, 'meta', '_journal.json'))) return candidate;
    dir = dirname(dir);
  }
  throw new Error('Could not locate the drizzle migrations folder. Set MIGRATIONS_DIR.');
}

await migrate(db, { migrationsFolder: migrationsFolder() });
console.log('Migrations applied.');
await pool.end();
