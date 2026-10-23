import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { db } from '../db/connection.js';
import { signToken, verifySignedToken } from '../lib/crypto.js';
import { ApiError } from '../lib/http.js';
import type { Role, SessionUser } from '../types/index.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

const SESSION_DAYS = 7;

export function createSession(userId: number): string {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, datetime(\'now\'), ?)').run(
    token,
    userId,
    expires,
  );
  return signToken(token);
}

export function destroySession(signed: string): void {
  const raw = verifySignedToken(signed);
  if (!raw) return;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(raw);
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookieToken = (req as any).cookies?.rih_session;
  if (cookieToken) return cookieToken;
  return null;
}

export function loadUser(token: string): SessionUser | null {
  const raw = verifySignedToken(token);
  if (!raw) return null;
  const row = db
    .prepare(
      `SELECT s.token, s.expires_at, u.id, u.full_name, u.email, u.role, u.department_id,
              u.designation, u.status, d.name AS department_name
         FROM sessions s
         JOIN users u ON u.id = s.user_id
    LEFT JOIN departments d ON d.id = u.department_id
        WHERE s.token = ?`,
    )
    .get(raw) as any;
  if (!row) return null;
  if (new Date(row.expires_at.replace(' ', 'T')).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(raw);
    return null;
  }
  if (row.status !== 'ACTIVE') return null;
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    role: row.role as Role,
    department_id: row.department_id ?? null,
    department_name: row.department_name ?? null,
    designation: row.designation ?? null,
    status: row.status,
  };
}

export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (token) {
    const user = loadUser(token);
    if (user) req.user = user;
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new ApiError(401, 'Authentication required. Please sign in to continue.'));
    return;
  }
  next();
}

/** Route guard for a fixed set of roles. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new ApiError(401, 'Authentication required. Please sign in to continue.'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ApiError(403, `This action requires one of the following roles: ${roles.join(', ')}.`));
      return;
    }
    next();
  };
}
