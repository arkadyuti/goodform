import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Enough environment to import the app without reaching a database.
    // `pg.Pool` is lazy — it connects on the first query, and the guard tests
    // never get that far because auth rejects them first.
    setupFiles: ['./src/test-setup.ts'],
  },
});
