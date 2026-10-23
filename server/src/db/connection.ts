import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SERVER_ROOT = resolve(__dirname, '..', '..');
export const DATA_DIR = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(SERVER_ROOT, 'data');
export const UPLOAD_DIR = process.env.UPLOAD_DIR ? resolve(process.env.UPLOAD_DIR) : join(SERVER_ROOT, 'uploads');
export const DB_PATH = process.env.DB_PATH ? resolve(process.env.DB_PATH) : join(DATA_DIR, 'rih.sqlite');

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

/** Applies the schema. Safe to call repeatedly (all statements are IF NOT EXISTS). */
export function applySchema(): void {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
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
