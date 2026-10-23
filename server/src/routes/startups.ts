import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso, daysUntil } from '../db/connection.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound, pageResponse, paginationFrom, WhereBuilder, likeParam } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../lib/permissions.js';
import { audit, timelineFor } from '../lib/audit.js';
import { notifyMany } from '../lib/notifications.js';
import { STARTUP_STAGES } from '../types/index.js';

export const startupsRouter = Router();
startupsRouter.use(requireAuth);

const startupSchema = z.object({
  name: z.string().min(3, 'Startup name must be at least 3 characters'),
  founderUserId: z.coerce.number().int().positive().optional().nullable(),
  founderName: z.string().min(2, 'Founder name is required'),
  founderEmail: z.string().email().optional().or(z.literal('')),
  relatedProjectId: z.coerce.number().int().positive().optional().nullable(),
  industry: z.string().min(2, 'Industry is required'),
  stage: z.enum(STARTUP_STAGES).optional(),
  description: z.string().min(20, 'Business idea description must be at least 20 characters'),
  problem: z.string().min(10, 'Problem statement must be at least 10 characters'),
  solution: z.string().min(10, 'Proposed solution must be at least 10 characters'),
  currentStage: z.string().optional().default(''),
  applicationDate: z.string().optional().default(''),
  supportRequired: z.string().optional().default(''),
  teamMembers: z
    .array(
      z.object({
        name: z.string().min(2, 'Member name is required'),
        email: z.string().email().optional().or(z.literal('')),
        role: z.string().default('MEMBER'),
        userId: z.coerce.number().int().positive().optional().nullable(),
      }),
    )
    .optional()
    .default([]),
});

function nextStartupCode(): string {
  const row = db.prepare('SELECT COUNT(*) AS c FROM startups').get() as any;
  return `SU-${String(100 + row.c + 1)}`;
}

/** Startups the signed-in user is allowed to see. */
function visibility(user: { id: number; role: string }): { clause: string; params: any[] } {
  if (user.role === 'ADMINISTRATOR' || user.role === 'INCUBATION_MANAGER') {
    return { clause: '', params: [] };
  }
  if (user.role === 'MENTOR') {
    return {
      clause: `(s.founder_user_id = ? OR s.id IN (
              SELECT ma.startup_id FROM mentor_assignments ma
                JOIN mentors m ON m.id = ma.mentor_id WHERE m.user_id = ?))`,
      params: [user.id, user.id],
    };
  }
  return { clause: 's.founder_user_id = ?', params: [user.id] };
}

startupsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const meta = paginationFrom(q, 10);
    const wb = new WhereBuilder();
    const vis = visibility(req.user!);

    if (q.search) {
      const t = likeParam(q.search);
      wb.add('(lower(s.name) LIKE ? OR lower(s.startup_code) LIKE ?)', t, t);
    }
    if (q.stage) wb.add('s.stage = ?', q.stage);
    if (q.industry) wb.add('lower(s.industry) = lower(?)', q.industry);
    if (q.projectId) wb.add('s.related_project_id = ?', Number(q.projectId));
    if (q.mentorId) {
      wb.addRaw(
        's.id IN (SELECT ma.startup_id FROM mentor_assignments ma JOIN mentors m ON m.id = ma.mentor_id WHERE m.user_id = ?)',
        Number(q.mentorId),
      );
    }
    if (q.status) wb.add('s.status = ?', q.status);
    // Visibility is a hard filter applied on top of any query filters.
    if (vis.clause) wb.addRaw(vis.clause, ...vis.params);

    const where = wb.sql();
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM startups s ${where}`).get(...wb.values) as any
    ).c as number;

    const rows = db
      .prepare(
        `SELECT s.*, u.full_name AS founder_name, p.project_code, p.title AS project_title,
                d.name AS department_name,
                (SELECT m.user_id FROM mentor_assignments ma JOIN mentors m ON m.id = ma.mentor_id
                  WHERE ma.startup_id = s.id AND ma.status='ACTIVE' LIMIT 1) AS mentor_user_id,
                (SELECT mu.full_name FROM mentor_assignments ma JOIN mentors m ON m.id = ma.mentor_id
                   JOIN users mu ON mu.id = m.user_id WHERE ma.startup_id = s.id AND ma.status='ACTIVE' LIMIT 1) AS mentor_name,
                (SELECT COUNT(*) FROM startup_milestones sm WHERE sm.startup_id = s.id) AS milestone_count,
                (SELECT COUNT(*) FROM startup_milestones sm WHERE sm.startup_id = s.id AND sm.status='COMPLETED') AS milestone_done,
                (SELECT COUNT(*) FROM documents doc WHERE doc.related_type='STARTUP' AND doc.related_id = s.id) AS document_count
           FROM startups s
      LEFT JOIN users u ON u.id = s.founder_user_id
      LEFT JOIN research_projects p ON p.id = s.related_project_id
      LEFT JOIN departments d ON d.id = p.department_id
           ${where}
          ORDER BY s.created_at DESC
          LIMIT ? OFFSET ?`,
      )
      .all(...wb.values, meta.pageSize, (meta.page - 1) * meta.pageSize) as any[];

    res.json(pageResponse(rows, { ...meta, total }));
  }),
);

startupsRouter.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    res.json({
      stages: STARTUP_STAGES,
      industries: db.prepare('SELECT DISTINCT industry FROM startups ORDER BY industry').all(),
      eligibleProjects: db
        .prepare(
          `SELECT id, project_code, title, status FROM research_projects
            WHERE status IN ('APPROVED','ACTIVE','COMPLETED') ORDER BY title`,
        )
        .all(),
      mentors: db
        .prepare(
          `SELECT m.id, u.id AS user_id, u.full_name, m.expertise, m.industries, m.max_startups,
                  (SELECT COUNT(*) FROM mentor_assignments ma WHERE ma.mentor_id = m.id AND ma.status='ACTIVE') AS assigned
             FROM mentors m JOIN users u ON u.id = m.user_id WHERE m.status='ACTIVE' ORDER BY u.full_name`,
        )
        .all(),
    });
  }),
);

startupsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const startup = db
      .prepare(
        `SELECT s.*, u.full_name AS founder_name, u.email AS founder_email,
                p.project_code, p.title AS project_title, d.name AS department_name
           FROM startups s
      LEFT JOIN users u ON u.id = s.founder_user_id
      LEFT JOIN research_projects p ON p.id = s.related_project_id
      LEFT JOIN departments d ON d.id = p.department_id
          WHERE s.id = ?`,
      )
      .get(id) as any;
    if (!startup) notFound('Startup not found.');

    const vis = visibility(req.user!);
    if (vis.clause) {
      const allowed = db
        .prepare(`SELECT COUNT(*) AS c FROM startups s WHERE s.id = ? AND ${vis.clause}`)
        .get(id, ...vis.params) as any;
      if (!allowed.c) forbidden('You do not have access to this startup.');
    }

    const team = db
      .prepare(
        `SELECT tm.*, u.full_name AS user_name FROM startup_team_members tm
      LEFT JOIN users u ON u.id = tm.user_id WHERE tm.startup_id = ? ORDER BY tm.id`,
      )
      .all(id) as any[];

    const milestones = db
      .prepare(
        `SELECT sm.*, CASE WHEN sm.due_date IS NOT NULL THEN CAST(julianday(sm.due_date) - julianday('now') AS INTEGER) END AS days_remaining
           FROM startup_milestones sm WHERE sm.startup_id = ? ORDER BY COALESCE(sm.due_date, sm.created_at) ASC`,
      )
      .all(id) as any[];

    const assignments = db
      .prepare(
        `SELECT ma.*, u.full_name AS mentor_name, u.email AS mentor_email, m.expertise, m.industries,
                m.user_id AS mentor_user_id
           FROM mentor_assignments ma
           JOIN mentors m ON m.id = ma.mentor_id
           JOIN users u ON u.id = m.user_id
          WHERE ma.startup_id = ? ORDER BY ma.assigned_at DESC`,
      )
      .all(id) as any[];

    const meetings = db
      .prepare(
        `SELECT mm.*, u.full_name AS mentor_name FROM mentor_meetings mm
      LEFT JOIN users u ON u.id = mm.mentor_id
          WHERE mm.startup_id = ? ORDER BY mm.meeting_date DESC`,
      )
      .all(id) as any[];

    const documents = db
      .prepare(
        `SELECT d.id, d.name, d.category, d.file_type, d.file_size, d.upload_date, d.version,
                u.full_name AS uploaded_by_name
           FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
          WHERE d.related_type='STARTUP' AND d.related_id = ? ORDER BY d.upload_date DESC`,
      )
      .all(id) as any[];

    const funding = db
      .prepare(
        `SELECT f.*, fo.title AS opportunity_title FROM funding_records f
      LEFT JOIN funding_opportunities fo ON fo.id = f.opportunity_id
          WHERE f.subject_type='STARTUP' AND f.subject_id = ? ORDER BY f.created_at DESC`,
      )
      .all(id) as any[];

    const timeline = timelineFor('STARTUP', id);

    res.json({
      startup,
      team,
      milestones,
      assignments,
      meetings,
      documents,
      funding,
      timeline,
      permissions: {
        canManage: can(req.user, 'startup.manage'),
        canEditMilestones: can(req.user, 'startup.manage') || can(req.user, 'mentor.update.own'),
        canAssignMentor: can(req.user, 'mentor.manage'),
        canUpload: can(req.user, 'document.upload'),
        canDelete: can(req.user, 'startup.manage'),
      },
    });
  }),
);

startupsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'startup.register')) forbidden('Your role cannot register startups.');
    const data = startupSchema.parse(req.body);

    if (data.relatedProjectId) {
      const project = db.prepare('SELECT * FROM research_projects WHERE id = ?').get(data.relatedProjectId) as any;
      if (!project) notFound('Related research project not found.');
      if (!['APPROVED', 'ACTIVE', 'COMPLETED'].includes(project.status)) {
        badRequest('Only approved, active or completed projects can be incubated.');
      }
    }

    const code = nextStartupCode();
    const result = db
      .prepare(
        `INSERT INTO startups
          (startup_code, name, founder_user_id, related_project_id, industry, stage, description,
           problem, solution, support_required, application_date, status, progress, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)`,
      )
      .run(
        code,
        data.name,
        data.founderUserId ?? null,
        data.relatedProjectId ?? null,
        data.industry,
        data.stage ?? 'APPLIED',
        data.description,
        data.problem,
        data.solution,
        data.supportRequired,
        data.applicationDate || nowIso().slice(0, 10),
        req.user!.id,
        nowIso(),
        nowIso(),
      );
    const startupId = Number(result.lastInsertRowid);

    db.prepare(
      `INSERT INTO startup_team_members (startup_id, user_id, name, email, member_role) VALUES (?, ?, ?, ?, ?)`,
    ).run(startupId, data.founderUserId ?? null, data.founderName, data.founderEmail || null, 'FOUNDER');

    for (const m of data.teamMembers ?? []) {
      db.prepare(
        `INSERT INTO startup_team_members (startup_id, user_id, name, email, member_role) VALUES (?, ?, ?, ?, ?)`,
      ).run(startupId, m.userId ?? null, m.name, m.email || null, m.role);
    }

    audit({
      entityType: 'STARTUP',
      entityId: startupId,
      entityCode: code,
      action: 'STARTUP_REGISTERED',
      actorId: req.user!.id,
      toStatus: 'PENDING',
      details: data.name,
    });

    notifyMany(
      db
        .prepare(`SELECT id FROM users WHERE status='ACTIVE' AND role IN ('INCUBATION_MANAGER','ADMINISTRATOR')`)
        .all()
        .map((r: any) => r.id),
      {
        category: 'NEW_APPROVAL',
        title: `Startup application received: ${code}`,
        description: data.name,
        link: `/startups/${startupId}`,
      },
    );

    res.status(201).json({ id: startupId, startupCode: code, message: 'Startup registered.' });
  }),
);

startupsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'startup.manage')) forbidden('Your role cannot update startups.');
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM startups WHERE id = ?').get(id) as any;
    if (!existing) notFound('Startup not found.');
    const data = startupSchema.partial().parse(req.body);

    const merged = {
      name: data.name ?? existing.name,
      industry: data.industry ?? existing.industry,
      stage: data.stage ?? existing.stage,
      description: data.description ?? existing.description,
      problem: data.problem ?? existing.problem,
      solution: data.solution ?? existing.solution,
      support: data.supportRequired ?? existing.support_required,
      applicationDate: data.applicationDate ?? existing.application_date,
      relatedProjectId: data.relatedProjectId ?? existing.related_project_id,
      founderUserId: data.founderUserId ?? existing.founder_user_id,
      status: data.stage ?? existing.status,
    };

    db.prepare(
      `UPDATE startups SET name = ?, founder_user_id = ?, related_project_id = ?, industry = ?, stage = ?,
         description = ?, problem = ?, solution = ?, support_required = ?, application_date = ?,
         status = ?, updated_at = ? WHERE id = ?`,
    ).run(
      merged.name,
      merged.founderUserId,
      merged.relatedProjectId,
      merged.industry,
      merged.stage,
      merged.description,
      merged.problem,
      merged.solution,
      merged.support,
      merged.applicationDate,
      merged.status,
      nowIso(),
      id,
    );

    audit({
      entityType: 'STARTUP',
      entityId: id,
      entityCode: existing.startup_code,
      action: 'STARTUP_UPDATED',
      actorId: req.user!.id,
      fromStatus: existing.stage,
      toStatus: merged.stage,
    });
    res.json({ id, message: 'Startup updated.' });
  }),
);

startupsRouter.patch(
  '/:id/stage',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      stage: z.enum(STARTUP_STAGES),
      progress: z.coerce.number().min(0).max(100).optional(),
    });
    const { stage, progress } = schema.parse(req.body);
    if (!can(req.user, 'startup.manage')) forbidden('Your role cannot change the incubation stage.');
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM startups WHERE id = ?').get(id) as any;
    if (!existing) notFound('Startup not found.');
    db.prepare('UPDATE startups SET stage = ?, progress = COALESCE(?, progress), updated_at = ? WHERE id = ?').run(
      stage,
      progress ?? null,
      nowIso(),
      id,
    );
    audit({
      entityType: 'STARTUP',
      entityId: id,
      entityCode: existing.startup_code,
      action: 'STAGE_CHANGED',
      actorId: req.user!.id,
      fromStatus: existing.stage,
      toStatus: stage,
    });
    res.json({ id, stage, message: 'Incubation stage updated.' });
  }),
);

startupsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'startup.manage')) forbidden('You cannot delete startups.');
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM startups WHERE id = ?').get(id) as any;
    if (!existing) notFound('Startup not found.');
    if (existing.stage !== 'APPLIED') {
      conflict('Only applications that have not entered incubation can be deleted.');
    }
    db.prepare('DELETE FROM startups WHERE id = ?').run(id);
    audit({ entityType: 'STARTUP', entityId: id, entityCode: existing.startup_code, action: 'STARTUP_DELETED', actorId: req.user!.id });
    res.json({ message: 'Startup application deleted.' });
  }),
);

// --------------------------------------------------------------- milestones
startupsRouter.post(
  '/:id/milestones',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      title: z.string().min(3, 'Milestone title is required'),
      description: z.string().optional().default(''),
      dueDate: z.string().optional().default(''),
      notes: z.string().optional().default(''),
    });
    const data = schema.parse(req.body);
    if (!can(req.user, 'startup.manage') && !can(req.user, 'mentor.update.own')) {
      forbidden('Your role cannot add milestones.');
    }
    const id = Number(req.params.id);
    const startup = db.prepare('SELECT * FROM startups WHERE id = ?').get(id) as any;
    if (!startup) notFound('Startup not found.');
    const result = db
      .prepare(
        `INSERT INTO startup_milestones (startup_id, title, description, due_date, status, progress, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)`,
      )
      .run(id, data.title, data.description, data.dueDate || null, data.notes, nowIso(), nowIso());
    audit({
      entityType: 'STARTUP',
      entityId: id,
      entityCode: startup.startup_code,
      action: 'MILESTONE_ADDED',
      actorId: req.user!.id,
      details: data.title,
    });
    res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Milestone added.' });
  }),
);

startupsRouter.patch(
  '/:id/milestones/:milestoneId',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'BLOCKED']).optional(),
      progress: z.coerce.number().min(0).max(100).optional(),
      notes: z.string().optional(),
      dueDate: z.string().optional(),
      title: z.string().optional(),
    });
    const data = schema.parse(req.body);
    if (!can(req.user, 'startup.manage') && !can(req.user, 'mentor.update.own')) {
      forbidden('Your role cannot update milestones.');
    }
    const startupId = Number(req.params.id);
    const msId = Number(req.params.milestoneId);
    const ms = db.prepare('SELECT * FROM startup_milestones WHERE id = ? AND startup_id = ?').get(msId, startupId) as any;
    if (!ms) notFound('Milestone not found.');
    db.prepare(
      `UPDATE startup_milestones SET title = ?, status = ?, progress = ?, notes = ?, due_date = ?, updated_at = ? WHERE id = ?`,
    ).run(
      data.title ?? ms.title,
      data.status ?? ms.status,
      data.progress ?? ms.progress,
      data.notes ?? ms.notes,
      data.dueDate ?? ms.due_date,
      nowIso(),
      msId,
    );
    audit({
      entityType: 'STARTUP',
      entityId: startupId,
      action: 'MILESTONE_UPDATED',
      actorId: req.user!.id,
      fromStatus: ms.status,
      toStatus: data.status ?? ms.status,
      details: ms.title,
    });
    res.json({ message: 'Milestone updated.' });
  }),
);
