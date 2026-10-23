import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db/connection.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound, pageResponse, paginationFrom, WhereBuilder, likeParam } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';
import { hashPassword } from '../lib/crypto.js';
import { ROLE_LABELS, ROLES, type Role } from '../types/index.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

const userSchema = z.object({
  fullName: z.string().min(3, 'Full name must be at least 3 characters'),
  email: z.string().email('Enter a valid email address'),
  role: z.enum(ROLES),
  departmentId: z.coerce.number().int().positive().optional().nullable(),
  designation: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

usersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'users.manage')) forbidden('Only administrators can manage users.');
    const q = req.query as Record<string, string>;
    const meta = paginationFrom(q, 10);
    const wb = new WhereBuilder();
    if (q.search) {
      const t = likeParam(q.search);
      wb.add('(lower(u.full_name) LIKE ? OR lower(u.email) LIKE ?)', t, t);
    }
    if (q.role) wb.add('u.role = ?', q.role);
    if (q.departmentId) wb.add('u.department_id = ?', Number(q.departmentId));
    if (q.status) wb.add('u.status = ?', q.status);

    const where = wb.sql();
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM users u ${where}`).get(...wb.values) as any
    ).c as number;

    const rows = db
      .prepare(
        `SELECT u.id, u.full_name, u.email, u.role, u.department_id, u.designation, u.phone,
                u.status, u.last_login_at, u.created_at, d.name AS department_name,
                (SELECT COUNT(*) FROM research_projects p WHERE p.principal_investigator_id = u.id) AS projects_leading,
                (SELECT COUNT(*) FROM approval_requests a WHERE a.assigned_reviewer_id = u.id AND a.status IN ('PENDING','IN_REVIEW')) AS pending_reviews
           FROM users u LEFT JOIN departments d ON d.id = u.department_id
           ${where}
          ORDER BY u.full_name
          LIMIT ? OFFSET ?`,
      )
      .all(...wb.values, meta.pageSize, (meta.page - 1) * meta.pageSize) as any[];

    res.json(pageResponse(rows, { ...meta, total }));
  }),
);

usersRouter.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    res.json({
      roles: ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
      departments: db.prepare('SELECT id, code, name FROM departments ORDER BY name').all(),
      statuses: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
    });
  }),
);

usersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const user = db
      .prepare(
        `SELECT u.id, u.full_name, u.email, u.role, u.department_id, u.designation, u.phone,
                u.status, u.last_login_at, u.created_at, d.name AS department_name
           FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`,
      )
      .get(id) as any;
    if (!user) notFound('User not found.');
    const activity = db
      .prepare(
        `SELECT a.* FROM audit_logs a WHERE a.actor_id = ? ORDER BY a.created_at DESC LIMIT 25`,
      )
      .all(id) as any[];
    res.json({ user, activity });
  }),
);

usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'users.manage')) forbidden('Only administrators can add users.');
    const data = userSchema.parse(req.body);
    const existing = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(data.email) as any;
    if (existing) conflict('A user with this email address already exists.');

    const result = db
      .prepare(
        `INSERT INTO users (full_name, email, password_hash, role, department_id, designation, phone, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.fullName,
        data.email,
        hashPassword(data.password ?? 'demo1234'),
        data.role,
        data.departmentId ?? null,
        data.designation || null,
        data.phone || null,
        data.status ?? 'ACTIVE',
        nowIso(),
        nowIso(),
      );
    audit({
      entityType: 'USER',
      entityId: Number(result.lastInsertRowid),
      action: 'USER_CREATED',
      actorId: req.user!.id,
      details: `${data.fullName} (${data.role})`,
    });
    res.status(201).json({ id: Number(result.lastInsertRowid), message: 'User created.' });
  }),
);

usersRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'users.manage')) forbidden('Only administrators can edit users.');
    const data = userSchema.partial().parse(req.body);
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!existing) notFound('User not found.');

    if (existing.id === req.user!.id && data.status && data.status !== 'ACTIVE') {
      badRequest('You cannot deactivate your own account.');
    }
    if (existing.id === req.user!.id && data.role && data.role !== existing.role) {
      badRequest('You cannot change your own role.');
    }
    if (data.email && data.email.toLowerCase() !== existing.email.toLowerCase()) {
      const dupe = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id <> ?').get(data.email, id) as any;
      if (dupe) conflict('A user with this email address already exists.');
    }

    db.prepare(
      `UPDATE users SET full_name = ?, email = ?, role = ?, department_id = ?, designation = ?,
         phone = ?, status = ?, password_hash = ?, updated_at = ? WHERE id = ?`,
    ).run(
      data.fullName ?? existing.full_name,
      data.email ?? existing.email,
      data.role ?? existing.role,
      data.departmentId ?? existing.department_id,
      data.designation ?? existing.designation,
      data.phone ?? existing.phone,
      data.status ?? existing.status,
      data.password ? hashPassword(data.password) : existing.password_hash,
      nowIso(),
      id,
    );

    audit({
      entityType: 'USER',
      entityId: id,
      action: 'USER_UPDATED',
      actorId: req.user!.id,
      details: `${data.fullName ?? existing.full_name}`,
    });
    res.json({ message: 'User updated.' });
  }),
);

usersRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'users.manage')) forbidden('Only administrators can change account status.');
    const schema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']) });
    const { status } = schema.parse(req.body);
    const id = Number(req.params.id);
    if (id === req.user!.id) badRequest('You cannot change the status of your own account.');
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!existing) notFound('User not found.');
    db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
    if (status !== 'ACTIVE') {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
    audit({
      entityType: 'USER',
      entityId: id,
      action: 'USER_STATUS_CHANGED',
      actorId: req.user!.id,
      fromStatus: existing.status,
      toStatus: status,
    });
    res.json({ message: `Account ${status.toLowerCase()}.` });
  }),
);
