/**
 * Environment for the server tests.
 *
 * Importing the app pulls in `env.ts`, which refuses to start without these.
 * None of them is used to reach anything: the connection string is never
 * dialled, because `pg.Pool` connects lazily and the tests that import the app
 * are testing the layer in front of the database.
 */
process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/goodform_test';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-at-least-thirty-two-characters';
process.env.NODE_ENV ??= 'test';
process.env.REMINDER_SCHEDULER ??= 'false';
