import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db/connection.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound, pageResponse, paginationFrom, WhereBuilder, likeParam } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { can, ownsProject } from '../lib/permissions.js';
import { audit, timelineFor } from '../lib/audit.js';
import { notify, notifyMany } from '../lib/notifications.js';
import { canTransitionProject, PROJECT_TRANSITIONS } from '../lib/workflow.js';
import { PROJECT_STATUSES, type ProjectStatus } from '../types/index.js';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const projectBaseSchema = z.object({
  title: z.string().min(5, 'Project title must be at least 5 characters'),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  domain: z.string().min(2, 'Research domain is required'),
  category: z.string().min(2, 'Project category is required'),
  departmentId: z.coerce.number().int().positive('Select a department'),
  principalInvestigatorId: z.coerce.number().int().positive('Select a principal investigator'),
  startDate: z.string().min(1, 'Start date is required'),
  expectedCompletionDate: z.string().min(1, 'Expected completion date is required'),
  fundingRequired: z.coerce.number().min(0, 'Funding cannot be negative'),
  objectives: z.string().min(10, 'Objectives must be at least 10 characters'),
  expectedOutcomes: z.string().optional().default(''),
  teamMembers: z
    .array(
      z.object({
        name: z.string().min(2, 'Member name is required'),
        email: z.string().email().optional().or(z.literal('')),
        role: z.string().default('CO_INVESTIGATOR'),
        contribution: z.string().optional().default(''),
        userId: z.coerce.number().int().positive().optional().nullable(),
      }),
    )
    .optional()
    .default([]),
});

const projectSchema = projectBaseSchema.refine(
  (d) => !d.startDate || !d.expectedCompletionDate || d.expectedCompletionDate >= d.startDate,
  {
    message: 'Expected completion date must be on or after the start date',
    path: ['expectedCompletionDate'],
  },
);

const updateSchema = projectBaseSchema.partial().extend({
  status: z.enum(PROJECT_STATUSES).optional(),
  progress: z.coerce.number().min(0).max(100).optional(),
});

function nextProjectCode(): string {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM research_projects`).get() as any;
  return `RP-${String(1000 + row.c + 1)}`;
}

function projectTeamUserIds(projectId: number): number[] {
  const rows = db
    .prepare('SELECT user_id FROM research_team_members WHERE project_id = ? AND user_id IS NOT NULL')
    .all(projectId) as any[];
  return rows.map((r) => r.user_id);
}

projectsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const meta = paginationFrom(q, 10);
    const wb = new WhereBuilder();

    if (q.search) {
      const t = likeParam(q.search);
      wb.add('(lower(p.title) LIKE ? OR lower(p.project_code) LIKE ?)', t, t);
    }
    if (q.departmentId) wb.add('p.department_id = ?', Number(q.departmentId));
    if (q.investigatorId) wb.add('p.principal_investigator_id = ?', Number(q.investigatorId));
    if (q.status) wb.add('p.status = ?', q.status);
    if (q.category) wb.add('p.category = ?', q.category);
    if (q.domain) wb.add('p.domain = ?', q.domain);
    if (q.from) wb.add('date(COALESCE(p.submitted_at, p.created_at)) >= date(?)', q.from);
    if (q.to) wb.add('date(COALESCE(p.submitted_at, p.created_at)) <= date(?)', q.to);
    if (q.mine === 'true') {
      wb.addRaw(
        '(p.principal_investigator_id = ? OR p.created_by = ? OR p.id IN (SELECT project_id FROM research_team_members WHERE user_id = ?))',
        req.user!.id,
        req.user!.id,
        req.user!.id,
      );
    }

    const where = wb.sql();
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM research_projects p ${where}`).get(...wb.values) as any
    ).c as number;

    const sortMap: Record<string, string> = {
      created: 'COALESCE(p.submitted_at, p.created_at) DESC',
      title: 'p.title ASC',
      status: 'p.status ASC',
      progress: 'p.progress DESC',
      funding: 'p.funding_required DESC',
    };
    const order = sortMap[q.sort ?? 'created'] ?? sortMap.created;

    const rows = db
      .prepare(
        `SELECT p.*, u.full_name AS pi_name, d.name AS department_name, d.code AS department_code,
                (SELECT COUNT(*) FROM research_team_members tm WHERE tm.project_id = p.id) AS team_count,
                (SELECT COUNT(*) FROM documents doc WHERE doc.related_type = 'PROJECT' AND doc.related_id = p.id) AS document_count,
                (SELECT COUNT(*) FROM ipr_records i WHERE i.project_id = p.id) AS ipr_count
           FROM research_projects p
           JOIN users u ON u.id = p.principal_investigator_id
           JOIN departments d ON d.id = p.department_id
           ${where}
          ORDER BY ${order}
          LIMIT ? OFFSET ?`,
      )
      .all(...wb.values, meta.pageSize, (meta.page - 1) * meta.pageSize) as any[];

    res.json(pageResponse(rows, { ...meta, total }));
  }),
);

projectsRouter.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    res.json({
      departments: db.prepare('SELECT id, code, name FROM departments ORDER BY name').all(),
      investigators: db
        .prepare(
          `SELECT u.id, u.full_name, u.email, d.name AS department_name
             FROM users u LEFT JOIN departments d ON d.id = u.department_id
            WHERE u.status = 'ACTIVE' ORDER BY u.full_name`,
        )
        .all(),
      categories: db.prepare('SELECT DISTINCT category FROM research_projects ORDER BY category').all(),
      domains: db.prepare('SELECT DISTINCT domain FROM research_projects ORDER BY domain').all(),
      statuses: PROJECT_STATUSES,
      transitions: PROJECT_TRANSITIONS,
    });
  }),
);

projectsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const project = db
      .prepare(
        `SELECT p.*, u.full_name AS pi_name, u.email AS pi_email, u.designation AS pi_designation,
                d.name AS department_name, d.code AS department_code
           FROM research_projects p
           JOIN users u ON u.id = p.principal_investigator_id
           JOIN departments d ON d.id = p.department_id
          WHERE p.id = ?`,
      )
      .get(id) as any;
    if (!project) notFound('Research project not found.');

    const team = db
      .prepare(
        `SELECT tm.*, u.full_name AS user_name
           FROM research_team_members tm LEFT JOIN users u ON u.id = tm.user_id
          WHERE tm.project_id = ? ORDER BY tm.id`,
      )
      .all(id) as any[];

    const milestones = db
      .prepare('SELECT * FROM project_milestones WHERE project_id = ? ORDER BY COALESCE(due_date, created_at) ASC')
      .all(id) as any[];

    const documents = db
      .prepare(
        `SELECT d.id, d.name, d.category, d.file_type, d.file_size, d.upload_date, d.version,
                u.full_name AS uploaded_by_name, d.related_type, d.related_id
           FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
          WHERE d.related_type = 'PROJECT' AND d.related_id = ? ORDER BY d.upload_date DESC`,
      )
      .all(id) as any[];

    const iprRecords = db
      .prepare(
        `SELECT i.id, i.ipr_code, i.title, i.ipr_type, i.status, i.next_deadline, i.filing_date
           FROM ipr_records i WHERE i.project_id = ? ORDER BY i.created_at DESC`,
      )
      .all(id) as any[];

    const funding = db
      .prepare(
        `SELECT f.*, fo.title AS opportunity_title, fo.organization
           FROM funding_records f LEFT JOIN funding_opportunities fo ON fo.id = f.opportunity_id
          WHERE f.subject_type = 'PROJECT' AND f.subject_id = ? ORDER BY f.created_at DESC`,
      )
      .all(id) as any[];

    const approvals = db
      .prepare(
        `SELECT a.id, a.request_code, a.request_type, a.current_stage, a.status, a.submitted_at,
                u.full_name AS reviewer_name
           FROM approval_requests a LEFT JOIN users u ON u.id = a.assigned_reviewer_id
          WHERE a.subject_type = 'PROJECT' AND a.subject_id = ? ORDER BY a.created_at DESC`,
      )
      .all(id) as any[];

    const timeline = timelineFor('PROJECT', id);

    const isOwner = ownsProject(req.user!, project, projectTeamUserIds(id));
    const editable = can(req.user, 'project.update.any') || (can(req.user, 'project.update.own') && isOwner);
    const canUpdateStatus = can(req.user, 'project.update.status') && (can(req.user, 'project.update.any') || isOwner);

    res.json({
      project,
      team,
      milestones,
      documents,
      iprRecords,
      funding,
      approvals,
      timeline,
      permissions: {
        canEdit: editable,
        canUpdateStatus,
        canDelete: can(req.user, 'project.delete'),
        allowedTransitions: canUpdateStatus ? PROJECT_TRANSITIONS[project.status as ProjectStatus] : [],
        canCreateIpr: can(req.user, 'ipr.create') && ['APPROVED', 'ACTIVE', 'COMPLETED'].includes(project.status),
        canRegisterStartup: can(req.user, 'startup.register'),
        canUpload: can(req.user, 'document.upload'),
        isOwner,
      },
    });
  }),
);

projectsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'project.create')) {
      forbidden('Your role cannot create research projects.');
    }
    const data = projectSchema.parse(req.body);
    const code = nextProjectCode();
    const insert = db.prepare(
      `INSERT INTO research_projects
        (project_code, title, description, domain, category, department_id, principal_investigator_id,
         start_date, expected_completion_date, funding_required, objectives, expected_outcomes,
         status, progress, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 0, ?, ?, ?)`,
    );
    const result = insert.run(
      code,
      data.title,
      data.description,
      data.domain,
      data.category,
      data.departmentId,
      data.principalInvestigatorId,
      data.startDate,
      data.expectedCompletionDate,
      data.fundingRequired,
      data.objectives,
      data.expectedOutcomes ?? '',
      req.user!.id,
      nowIso(),
      nowIso(),
    );
    const projectId = Number(result.lastInsertRowid);

    for (const m of data.teamMembers ?? []) {
      db.prepare(
        `INSERT INTO research_team_members (project_id, user_id, name, email, member_role, contribution)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(projectId, m.userId ?? null, m.name, m.email || null, m.role, m.contribution || null);
    }

    audit({
      entityType: 'PROJECT',
      entityId: projectId,
      entityCode: code,
      action: 'PROJECT_CREATED',
      actorId: req.user!.id,
      toStatus: 'DRAFT',
      details: `Draft created with ${data.teamMembers?.length ?? 0} team member(s).`,
    });

    res.status(201).json({ id: projectId, projectCode: code, message: 'Project saved as draft.' });
  }),
);

projectsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM research_projects WHERE id = ?').get(id) as any;
    if (!existing) notFound('Research project not found.');

    const isOwner = ownsProject(req.user!, existing, projectTeamUserIds(id));
    if (!can(req.user, 'project.update.any') && !(can(req.user, 'project.update.own') && isOwner)) {
      forbidden('You cannot edit this research project.');
    }

    const data = updateSchema.parse(req.body);
    const nextStatus = data.status ?? existing.status;

    if (data.status && data.status !== existing.status) {
      if (!can(req.user, 'project.update.status')) {
        forbidden('You cannot change the status of this project.');
      }
      if (!canTransitionProject(existing.status as ProjectStatus, data.status as ProjectStatus)) {
        conflict(`Cannot move a project from ${existing.status} to ${data.status}.`);
      }
    }

    const merged = { ...existing, ...data };
    if (merged.expected_completion_date < merged.start_date) {
      badRequest('Expected completion date must be on or after the start date.');
    }

    db.prepare(
      `UPDATE research_projects SET
         title = ?, description = ?, domain = ?, category = ?, department_id = ?,
         principal_investigator_id = ?, start_date = ?, expected_completion_date = ?,
         funding_required = ?, objectives = ?, expected_outcomes = ?, status = ?,
         progress = ?, submitted_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      merged.title,
      merged.description,
      merged.domain,
      merged.category,
      merged.department_id,
      merged.principal_investigator_id,
      merged.start_date,
      merged.expected_completion_date,
      merged.funding_required,
      merged.objectives,
      merged.expected_outcomes,
      nextStatus,
      data.progress ?? existing.progress,
      nextStatus !== 'DRAFT' && !existing.submitted_at ? nowIso() : existing.submitted_at,
      nowIso(),
      id,
    );

    if (data.teamMembers) {
      db.prepare('DELETE FROM research_team_members WHERE project_id = ?').run(id);
      for (const m of data.teamMembers) {
        db.prepare(
          `INSERT INTO research_team_members (project_id, user_id, name, email, member_role, contribution)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(id, m.userId ?? null, m.name, m.email || null, m.role, m.contribution || null);
      }
    }

    audit({
      entityType: 'PROJECT',
      entityId: id,
      entityCode: existing.project_code,
      action: data.status && data.status !== existing.status ? 'STATUS_CHANGED' : 'PROJECT_UPDATED',
      actorId: req.user!.id,
      fromStatus: existing.status,
      toStatus: nextStatus,
      details: data.status && data.status !== existing.status ? `Status updated to ${nextStatus}.` : 'Project details updated.',
    });

    res.json({ id, message: 'Project updated.' });
  }),
);

/** Dedicated status transition endpoint (uses the workflow state machine). */
projectsRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      status: z.enum(PROJECT_STATUSES),
      progress: z.coerce.number().min(0).max(100).optional(),
      note: z.string().max(500).optional(),
    });
    const { status, progress, note } = schema.parse(req.body);
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM research_projects WHERE id = ?').get(id) as any;
    if (!existing) notFound('Research project not found.');

    const isOwner = ownsProject(req.user!, existing, projectTeamUserIds(id));
    if (!can(req.user, 'project.update.status')) {
      forbidden('You cannot change the status of this project.');
    }
    if (!can(req.user, 'project.update.any') && !isOwner) {
      forbidden('You cannot change the status of a project you do not own.');
    }
    if (!canTransitionProject(existing.status as ProjectStatus, status as ProjectStatus)) {
      conflict(`Cannot move a project from ${existing.status} to ${status}. Allowed: ${PROJECT_TRANSITIONS[existing.status as ProjectStatus].join(', ') || 'none'}.`);
    }

    db.prepare(
      `UPDATE research_projects SET status = ?, progress = COALESCE(?, progress),
         submitted_at = CASE WHEN ? = 'SUBMITTED' AND submitted_at IS NULL THEN ? ELSE submitted_at END,
         approved_at = CASE WHEN ? = 'APPROVED' THEN ? ELSE approved_at END,
         completed_at = CASE WHEN ? = 'COMPLETED' THEN ? ELSE completed_at END,
         updated_at = ? WHERE id = ?`,
    ).run(status, progress ?? null, status, nowIso(), status, nowIso(), status, nowIso(), nowIso(), id);

    audit({
      entityType: 'PROJECT',
      entityId: id,
      entityCode: existing.project_code,
      action: 'STATUS_CHANGED',
      actorId: req.user!.id,
      fromStatus: existing.status,
      toStatus: status,
      details: note || `Status moved to ${status}.`,
    });

    if (status === 'SUBMITTED') {
      notifyMany(
        db
          .prepare(
            `SELECT id FROM users WHERE status='ACTIVE' AND role IN ('APPROVAL_MEMBER','ADMINISTRATOR')`,
          )
          .all()
          .map((r: any) => r.id),
        {
          category: 'NEW_APPROVAL',
          title: `Project submitted for review: ${existing.project_code}`,
          description: existing.title,
          link: `/projects/${id}`,
        },
      );
    }

    res.json({ id, status, message: `Project status changed to ${status}.` });
  }),
);

projectsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'project.delete')) forbidden('Only administrators can delete projects.');
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM research_projects WHERE id = ?').get(id) as any;
    if (!existing) notFound('Research project not found.');
    if (existing.status !== 'DRAFT') {
      conflict('Only draft projects can be deleted. Reject or close the project instead.');
    }
    db.prepare('DELETE FROM research_projects WHERE id = ?').run(id);
    audit({
      entityType: 'PROJECT',
      entityId: id,
      entityCode: existing.project_code,
      action: 'PROJECT_DELETED',
      actorId: req.user!.id,
    });
    res.json({ message: 'Draft project deleted.' });
  }),
);

// --------------------------------------------------------------- milestones
projectsRouter.post(
  '/:id/milestones',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      title: z.string().min(3, 'Milestone title is required'),
      description: z.string().optional().default(''),
      dueDate: z.string().optional().default(''),
      notes: z.string().optional().default(''),
    });
    const data = schema.parse(req.body);
    const id = Number(req.params.id);
    const project = db.prepare('SELECT * FROM research_projects WHERE id = ?').get(id) as any;
    if (!project) notFound('Research project not found.');
    const isOwner = ownsProject(req.user!, project, projectTeamUserIds(id));
    if (!can(req.user, 'project.update.any') && !(can(req.user, 'project.update.own') && isOwner)) {
      forbidden('You cannot add milestones to this project.');
    }
    const result = db
      .prepare(
        `INSERT INTO project_milestones (project_id, title, description, due_date, status, progress, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)`,
      )
      .run(id, data.title, data.description, data.dueDate || null, data.notes, nowIso(), nowIso());
    audit({
      entityType: 'PROJECT',
      entityId: id,
      entityCode: project.project_code,
      action: 'MILESTONE_ADDED',
      actorId: req.user!.id,
      details: data.title,
    });
    res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Milestone added.' });
  }),
);

projectsRouter.patch(
  '/:id/milestones/:milestoneId',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'BLOCKED']).optional(),
      progress: z.coerce.number().min(0).max(100).optional(),
      notes: z.string().optional(),
      dueDate: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const projectId = Number(req.params.id);
    const milestoneId = Number(req.params.milestoneId);
    const ms = db.prepare('SELECT * FROM project_milestones WHERE id = ? AND project_id = ?').get(milestoneId, projectId) as any;
    if (!ms) notFound('Milestone not found.');
    const project = db.prepare('SELECT * FROM research_projects WHERE id = ?').get(projectId) as any;
    const isOwner = ownsProject(req.user!, project, projectTeamUserIds(projectId));
    if (!can(req.user, 'project.update.any') && !(can(req.user, 'project.update.own') && isOwner)) {
      forbidden('You cannot update milestones on this project.');
    }
    db.prepare(
      `UPDATE project_milestones SET status = ?, progress = ?, notes = ?, due_date = ?, updated_at = ? WHERE id = ?`,
    ).run(
      data.status ?? ms.status,
      data.progress ?? ms.progress,
      data.notes ?? ms.notes,
      data.dueDate ?? ms.due_date,
      nowIso(),
      milestoneId,
    );
    audit({
      entityType: 'PROJECT',
      entityId: projectId,
      entityCode: project.project_code,
      action: 'MILESTONE_UPDATED',
      actorId: req.user!.id,
      fromStatus: ms.status,
      toStatus: data.status ?? ms.status,
      details: ms.title,
    });
    res.json({ message: 'Milestone updated.' });
  }),
);
