import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db/connection.js';
import { asyncHandler, ApiError } from '../lib/http.js';
import { verifyPassword } from '../lib/crypto.js';
import { createSession, destroySession, requireAuth } from '../middleware/auth.js';
import { permissionsFor, NAV_BY_ROLE } from '../lib/permissions.js';
import { ROLE_LABELS, type Role } from '../types/index.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

/** Demo accounts list — clearly flagged as demo data in the response. */
authRouter.get(
  '/demo-accounts',
  asyncHandler(async (_req, res) => {
    const rows = db
      .prepare(
        `SELECT u.id, u.full_name, u.email, u.role, u.designation, d.name AS department_name
           FROM users u LEFT JOIN departments d ON d.id = u.department_id
          WHERE u.status = 'ACTIVE'
          ORDER BY CASE u.role
                     WHEN 'ADMINISTRATOR' THEN 0
                     WHEN 'RESEARCHER' THEN 1
                     WHEN 'IPR_OFFICER' THEN 2
                     WHEN 'APPROVAL_MEMBER' THEN 3
                     WHEN 'INCUBATION_MANAGER' THEN 4
                     ELSE 5 END, u.full_name`,
      )
      .all() as any[];
    res.json({
      demoMode: true,
      notice:
        'Demo mode: credentials are sample accounts seeded for evaluation. Not production authentication.',
      password: 'demo1234',
      accounts: rows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        email: r.email,
        role: r.role,
        roleLabel: ROLE_LABELS[r.role as Role],
        designation: r.designation,
        department: r.department_name,
      })),
    });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = db
      .prepare(
        `SELECT u.*, d.name AS department_name
           FROM users u LEFT JOIN departments d ON d.id = u.department_id
          WHERE lower(u.email) = lower(?)`,
      )
      .get(email) as any;

    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new ApiError(401, 'Incorrect email or password.');
    }
    if (user.status !== 'ACTIVE') {
      throw new ApiError(403, 'This account is not active. Contact the administrator.');
    }

    db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(
      nowIso(),
      nowIso(),
      user.id,
    );

    const token = createSession(user.id);
    res.cookie('rih_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 86_400_000,
    });
    res.json({
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        roleLabel: ROLE_LABELS[user.role as Role],
        departmentId: user.department_id,
        departmentName: user.department_name ?? null,
        designation: user.designation,
        permissions: permissionsFor(user.role),
        modules: NAV_BY_ROLE[user.role as Role],
      },
      demoMode: true,
    });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) destroySession(header.slice(7));
    res.clearCookie('rih_session');
    res.json({ success: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const u = req.user!;
    res.json({
      user: {
        id: u.id,
        fullName: u.full_name,
        email: u.email,
        role: u.role,
        roleLabel: ROLE_LABELS[u.role as Role],
        departmentId: u.department_id,
        departmentName: u.department_name,
        designation: u.designation,
        permissions: permissionsFor(u.role),
        modules: NAV_BY_ROLE[u.role as Role],
      },
      demoMode: true,
    });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    });
    const { currentPassword, newPassword } = schema.parse(req.body);
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as any;
    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      throw new ApiError(400, 'Current password is incorrect.');
    }
    const { hashPassword } = await import('../lib/crypto.js');
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPassword(newPassword),
      nowIso(),
      req.user!.id,
    );
    res.json({ success: true, message: 'Password updated.' });
  }),
);
