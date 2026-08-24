import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../env.js';
import * as schema from './schema.js';

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  // Without this a request made while Postgres is unreachable waits for ever —
  // including the one /api/health makes, which is what the deploy gate polls.
  // A hung health check reads as a failed release and triggers a rollback.
  connectionTimeoutMillis: 5_000,
  // A runaway query cannot hold a connection open indefinitely.
  statement_timeout: 10_000,
});

/**
 * Postgres restarts should not take the app with them.
 *
 * node-postgres emits `error` on the pool when an *idle* client's connection
 * dies — a database restart, a `pg_terminate_backend`, a NAT timeout. An
 * unhandled `error` on an EventEmitter throws synchronously, which the
 * unhandledRejection handler cannot catch, so ordinary database maintenance
 * killed the process with nothing in the journal naming the cause. The pool
 * discards the dead client and carries on; all this has to do is not crash.
 */
pool.on('error', (error) => {
  console.error('Postgres pool error (idle client):', error);
});
export const db = drizzle(pool, { schema });
export { schema };
