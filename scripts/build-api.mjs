/**
 * Bundles the Express API into a single CommonJS file for serverless hosting.
 *
 * Vercel's function runtime does not run our TypeScript sources directly, and
 * the server uses `tsx`-style `.js` import specifiers that point at `.ts` files.
 * Bundling with esbuild sidesteps both problems and lets us embed `schema.sql`
 * into the output so the function never depends on a file next to it on disk.
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../server/src/lambda.ts', import.meta.url));
const outfile = fileURLToPath(new URL('../api/_bundle.cjs', import.meta.url));
const schema = readFileSync(new URL('../server/src/db/schema.sql', import.meta.url), 'utf8');
const absWorkingDir = fileURLToPath(new URL('..', import.meta.url));

mkdirSync(fileURLToPath(new URL('../api', import.meta.url)), { recursive: true });

await build({
  entryPoints: [entry],
  outfile,
  absWorkingDir,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  // `node:sqlite` and the other node: builtins stay external automatically.
  define: {
    __EMBEDDED_SCHEMA__: JSON.stringify(schema),
  },
  logLevel: 'info',
});
