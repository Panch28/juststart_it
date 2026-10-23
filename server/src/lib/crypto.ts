import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';

const SCRYPT_KEYLEN = 64;

/** Hashes a password with a per-user random salt (scrypt). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(hash, 'hex');
    if (candidate.length !== expected.length) return false;
    return timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export function newSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function signToken(payload: string): string {
  const secret = process.env.SESSION_SECRET ?? 'rih-dev-session-secret-change-me';
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifySignedToken(token: string): string | null {
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const payload = token.slice(0, idx);
  const signature = token.slice(idx + 1);
  const secret = process.env.SESSION_SECRET ?? 'rih-dev-session-secret-change-me';
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? payload : null;
}
