/**
 * Bundles the server for production.
 *
 * `tsc` alone is not enough. The server imports `@goodform/shared`, a workspace
 * package whose entry point is TypeScript source, so compiled output still
 * carries a bare `@goodform/shared` specifier that Node resolves to a `.ts`
 * file and refuses to load. Bundling resolves those imports at build time.
 *
 * It also suits where this runs: a 512MB VPS. One file per entry point and no
 * `node_modules` to install means deploys copy a few megabytes and start
 * instantly, and the box never has to run a package manager.
 */
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

const outdir = 'dist';
await rm(outdir, { recursive: true, force: true });

await build({
  entryPoints: {
    // The API and SPA host.
    index: 'src/index.ts',
    // Run before starting a new release.
    migrate: 'src/db/migrate.ts',
    // Idempotent; refreshes the shared food library.
    seed: 'src/db/seed.ts',
  },
  outdir,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // Optional native accelerators that pg and its transitive deps probe for at
  // runtime inside try/catch. They are not installed and are not needed;
  // leaving them external keeps esbuild from failing on the missing modules.
  external: ['pg-native', 'cpu-features'],
  // Some dependencies are CJS and expect these to exist. ESM output has
  // neither, so provide them from `node:` equivalents.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __pathDirname } from 'node:path';",
      'const require = __createRequire(import.meta.url);',
      'const __filename = __fileURLToPath(import.meta.url);',
      'const __dirname = __pathDirname(__filename);',
    ].join('\n'),
  },
  logLevel: 'info',
});
