import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db/connection.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';
import { hashPassword } from '../lib/crypto.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

const DEFAULT_SETTINGS: Record<string, unknown> = {
  deadline_reminder_days: [30, 7, 1],
  project_categories: [
    'Basic Research',
    'Applied Research',
    'Interdisciplinary',
    'Clinical Research',
    'Developmental Research',
  ],
  research_domains: [
    'Biotechnology',
    'Environmental Science',
    'Artificial Intelligence',
    'Materials Science',
    'Renewable Energy',
    'Health Sciences',
    'Agricultural Technology',
  ],
  workflow_configuration: {
    project: {
      DRAFT: ['SUBMITTED', 'ON_HOLD'],
      SUBMITTED: ['UNDER_REVIEW', 'DRAFT', 'ON_HOLD'],
      UNDER_REVIEW: ['APPROVED', 'REJECTED', 'RETURNED_FOR_CORRECTION', 'ON_HOLD'],
      APPROVED: ['ACTIVE', 'ON_HOLD'],
      ACTIVE: ['COMPLETED', 'ON_HOLD'],
    },
    ipr: {
      DRAFT: ['UNDER_EVALUATION'],
      UNDER_EVALUATION: ['APPROVED_FOR_FILING', 'REJECTED'],
      APPROVED_FOR_FILING: ['FILED'],
      FILED: ['UNDER_EXAMINATION', 'GRANTED', 'REJECTED'],
      UNDER_EXAMINATION: ['GRANTED', 'REJECTED'],
    },
  },
  notification_preferences: {
    emailEnabled: false,
    inAppEnabled: true,
    categories: ['DEADLINE', 'OVERDUE', 'NEW_APPROVAL', 'APPROVAL_DECISION'],
  },
  system_preferences: {
    institutionName: 'Northgate University',
    systemName: 'Research & Innovation Hub',
    supportEmail: 'research-hub@northgate.edu',
    demoMode: true,
    fileSizeLimitMb: 10,
    sessionDays: 7,
  },
};

function readAll(): Record<string, unknown> {
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as any[];
  const stored: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      stored[r.key] = JSON.parse(r.value);
    } catch {
      stored[r.key] = r.value;
    }
  }
  return { ...DEFAULT_SETTINGS, ...stored };
}

function writeOne(key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value), nowIso());
}

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const settings = readAll();
    res.json({
      settings,
      editableBy: 'ADMINISTRATOR',
      notice:
        'Secrets, API keys and infrastructure credentials are never exposed through this endpoint.',
    });
  }),
);

settingsRouter.put(
  '/:key',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'settings.manage')) forbidden('Only administrators can change system settings.');
    const key = req.params.key;
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
      notFound(`Unknown setting "${key}".`);
    }
    const schema = z.object({ value: z.any() });
    const { value } = schema.parse(req.body);
    writeOne(key, value);
    audit({ entityType: 'SETTINGS', entityCode: key, action: 'SETTING_UPDATED', actorId: req.user!.id });
    res.json({ message: 'Setting saved.', settings: readAll() });
  }),
);

/** Per-user notification preferences and profile fields. */
settingsRouter.put(
  '/profile/me',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      fullName: z.string().min(3, 'Full name must be at least 3 characters').optional(),
      designation: z.string().optional(),
      phone: z.string().optional(),
      notificationPreferences: z.record(z.string(), z.any()).optional(),
    });
    const data = schema.parse(req.body);
    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as any;
    db.prepare(
      `UPDATE users SET full_name = ?, designation = ?, phone = ?, updated_at = ? WHERE id = ?`,
    ).run(
      data.fullName ?? current.full_name,
      data.designation ?? current.designation,
      data.phone ?? current.phone,
      nowIso(),
      req.user!.id,
    );
    if (data.notificationPreferences) {
      writeOne(`notification_prefs:${req.user!.id}`, data.notificationPreferences);
    }
    audit({ entityType: 'USER', entityId: req.user!.id, action: 'PROFILE_UPDATED', actorId: req.user!.id });
    res.json({ message: 'Profile updated.' });
  }),
);

// ------------------------------------------------------------- departments
export const departmentsRouter = Router();
departmentsRouter.use(requireAuth);

departmentsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = db
      .prepare(
        `SELECT d.*, (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id) AS user_count,
                (SELECT COUNT(*) FROM research_projects p WHERE p.department_id = d.id) AS project_count,
                (SELECT GROUP_CONCAT(u.full_name, ', ') FROM users u WHERE u.department_id = d.id AND u.designation LIKE '%Head%') AS hod_name
           FROM departments d ORDER BY d.name`,
      )
      .all() as any[];
    res.json({ departments: rows });
  }),
);

departmentsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'departments.manage')) forbidden('Only administrators can manage departments.');
    const schema = z.object({
      code: z.string().min(2, 'Code is required').max(10),
      name: z.string().min(3, 'Name is required'),
      description: z.string().optional().default(''),
    });
    const data = schema.parse(req.body);
    const dupe = db.prepare('SELECT id FROM departments WHERE code = ? OR name = ?').get(data.code, data.name) as any;
    if (dupe) conflict('A department with this code or name already exists.');
    const result = db
      .prepare('INSERT INTO departments (code, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(data.code, data.name, data.description, nowIso(), nowIso());
    audit({ entityType: 'DEPARTMENT', entityId: Number(result.lastInsertRowid), action: 'DEPARTMENT_CREATED', actorId: req.user!.id });
    res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Department created.' });
  }),
);

departmentsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'departments.manage')) forbidden('Only administrators can manage departments.');
    const schema = z.object({
      name: z.string().min(3).optional(),
      description: z.string().optional(),
      hodUserId: z.coerce.number().int().positive().optional().nullable(),
    });
    const data = schema.parse(req.body);
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM departments WHERE id = ?').get(id) as any;
    if (!existing) notFound('Department not found.');
    db.prepare('UPDATE departments SET name = ?, description = ?, hod_user_id = ?, updated_at = ? WHERE id = ?').run(
      data.name ?? existing.name,
      data.description ?? existing.description,
      data.hodUserId ?? existing.hod_user_id,
      nowIso(),
      id,
    );
    audit({ entityType: 'DEPARTMENT', entityId: id, action: 'DEPARTMENT_UPDATED', actorId: req.user!.id });
    res.json({ message: 'Department updated.' });
  }),
);

departmentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'departments.manage')) forbidden('Only administrators can manage departments.');
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM departments WHERE id = ?').get(id) as any;
    if (!existing) notFound('Department not found.');
    const projects = db.prepare('SELECT COUNT(*) AS c FROM research_projects WHERE department_id = ?').get(id) as any;
    if (projects.c > 0) conflict('This department still has research projects and cannot be removed.');
    db.prepare('DELETE FROM departments WHERE id = ?').run(id);
    audit({ entityType: 'DEPARTMENT', entityId: id, action: 'DEPARTMENT_DELETED', actorId: req.user!.id });
    res.json({ message: 'Department deleted.' });
  }),
);
