/**
 * Serverless entry point (Vercel).
 *
 * Vercel functions have no persistent disk, so `connection.ts` switches to an
 * in-memory SQLite database when `VERCEL=1`. The first request in each instance
 * applies the schema and seeds the demo data, then the Express app handles the
 * request unchanged.
 *
 * This makes every instance a complete, self-consistent copy of the demo
 * dataset. Reads always work. Writes are accepted and visible for as long as
 * that instance stays warm, then disappear when it is recycled — acceptable for
 * a demo, and documented in DEPLOY.md.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { applySchema, db } from './db/connection.js';
import { app } from './app.js';

let ready: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      applySchema();
      const row = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
      if (row.c === 0) {
        // Loaded dynamically: the seed script exits the process when the
        // database is already populated, which must never happen inside a
        // warm serverless instance.
        await import('./db/seed.js');
      }
    })();
  }
  return ready;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await ensureReady();
  app(req as never, res as never);
}
