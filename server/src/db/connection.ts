import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Injected by `scripts/build-api.mjs` when compiling the serverless bundle.
 * Locally this identifier is never defined, so `typeof` below evaluates to
 * `'undefined'` and the schema is read from disk as usual.
 */
declare const __EMBEDDED_SCHEMA__: string | undefined;

const MODULE_DIR = (() => {
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    // The CJS serverless bundle has no import.meta.url; fall back to the cwd.
    return process.cwd();
  }
})();

/**
 * True when running inside a serverless platform (Vercel). Those environments
 * only allow writes under /tmp and give every instance its own filesystem, so
 * the database lives in memory and uploads go to /tmp.
 */
const IS_SERVERLESS = process.env.VERCEL === '1' || process.env.DB_PATH === ':memory:';

export const SERVER_ROOT = resolve(MODULE_DIR, '..', '..');
export const DATA_DIR = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(SERVER_ROOT, 'data');
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? resolve(process.env.UPLOAD_DIR)
  : IS_SERVERLESS
    ? join('/tmp', 'uploads')
    : join(SERVER_ROOT, 'uploads');
export const DB_PATH = IS_SERVERLESS
  ? ':memory:'
  : process.env.DB_PATH
    ? resolve(process.env.DB_PATH)
    : join(DATA_DIR, 'rih.sqlite');

if (!IS_SERVERLESS) mkdirSync(DATA_DIR, { recursive: true });
// /tmp is writable on serverless platforms, so this is safe there too.
mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
if (!IS_SERVERLESS) {
  db.exec('PRAGMA journal_mode = WAL;');
}
db.exec('PRAGMA foreign_keys = ON;');

/**
 * Applies the schema. Safe to call repeatedly (all statements are IF NOT EXISTS).
 *
 * In the serverless bundle the SQL is embedded at build time, because a bundled
 * function cannot rely on `schema.sql` being present next to it on disk.
 */
export function applySchema(): void {
  if (typeof __EMBEDDED_SCHEMA__ !== 'undefined') {
    db.exec(__EMBEDDED_SCHEMA__);
    return;
  }

  const candidates = [
    join(MODULE_DIR, 'schema.sql'),
    join(process.cwd(), 'server', 'src', 'db', 'schema.sql'),
    join(process.cwd(), '..', 'server', 'src', 'db', 'schema.sql'),
  ];
  const schemaPath = candidates.find((path) => existsSync(path));
  if (!schemaPath) {
    throw new Error(`Unable to locate schema.sql (looked in: ${candidates.join(', ')})`);
  }
  db.exec(readFileSync(schemaPath, 'utf8'));
}

export function nowIso(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Adds `days` days to an ISO date string (date-only or datetime). */
export function addDays(date: string | Date, days: number): string {
  const d = typeof date === 'string' ? new Date(date.replace(' ', 'T')) : new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** Whole days between today and the given date (negative = overdue). */
export function daysUntil(date: string): number {
  const target = new Date(date.replace(' ', 'T')).getTime();
  const base = new Date(`${today()}T00:00:00Z`).getTime();
  return Math.round((target - base) / 86_400_000);
}

export function isOverdue(date: string | null | undefined): boolean {
  if (!date) return false;
  return daysUntil(date) < 0;
}
