import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db/connection.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound, pageResponse, paginationFrom, WhereBuilder, likeParam } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';
import { notify, notifyMany } from '../lib/notifications.js';
import { APPROVAL_STAGE_ORDER, nextStage } from '../lib/workflow.js';
import { APPROVAL_STATUSES } from '../types/index.js';

export const approvalsRouter = Router();
approvalsRouter.use(requireAuth);

const SUBJECT_TABLES: Record<string, string> = {
  PROJECT: 'research_projects',
  IPR: 'ipr_records',
  STARTUP: 'startups',
};

function subjectTitle(subjectType: string, subjectId: number): string {
  const table = SUBJECT_TABLES[subjectType];
  if (!table) return `Record #${subjectId}`;
  const col = subjectType === 'PROJECT' ? 'title' : 'title';
  const row = db.prepare(`SELECT ${col} AS title FROM ${table} WHERE id = ?`).get(subjectId) as any;
  return row?.title ?? `Record #${subjectId}`;
}

function subjectCode(subjectType: string, subjectId: number): string {
  const table = SUBJECT_TABLES[subjectType];
  if (!table) return `#${subjectId}`;
  const col =
    subjectType === 'PROJECT' ? 'project_code' : subjectType === 'IPR' ? 'ipr_code' : 'startup_code';
  const row = db.prepare(`SELECT ${col} AS code FROM ${table} WHERE id = ?`).get(subjectId) as any;
  return row?.code ?? `#${subjectId}`;
}

approvalsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const meta = paginationFrom(q, 10);
    const wb = new WhereBuilder();
    const user = req.user!;

    if (q.search) {
      const t = likeParam(q.search);
      wb.add('(lower(a.request_code) LIKE ? OR lower(a.request_type) LIKE ?)', t, t);
    }
    if (q.status) wb.add('a.status = ?', q.status);
    if (q.subjectType) wb.add('a.subject_type = ?', q.subjectType);
    if (q.stage) wb.add('a.current_stage = ?', q.stage);
    if (q.reviewerId) wb.add('a.assigned_reviewer_id = ?', Number(q.reviewerId));
    if (q.from) wb.add('date(a.submitted_at) >= date(?)', q.from);
    if (q.to) wb.add('date(a.submitted_at) <= date(?)', q.to);

    // Tab scoping — "my pending tasks" shows only requests assigned to me.
    const tab = q.tab ?? 'all';
    if (tab === 'mine') {
      wb.add('a.assigned_reviewer_id = ?', user.id);
      wb.addRaw("a.status IN ('PENDING','IN_REVIEW')");
    } else if (!can(user, 'approval.view.all')) {
      // Users without global visibility only see their own assignments or submissions.
      wb.addRaw('(a.assigned_reviewer_id = ? OR a.submitted_by = ?)', user.id, user.id);
    }

    const where = wb.sql();
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM approval_requests a ${where}`).get(...wb.values) as any
    ).c as number;

    const rows = db
      .prepare(
        `SELECT a.*, u.full_name AS reviewer_name, s.full_name AS submitted_by_name,
                CAST(julianday('now') - julianday(a.submitted_at) AS INTEGER) AS days_pending,
                (SELECT COUNT(*) FROM documents doc WHERE doc.related_type='APPROVAL' AND doc.related_id = a.id) AS document_count,
                (SELECT COUNT(*) FROM approval_decisions ad WHERE ad.request_id = a.id) AS decision_count
           FROM approval_requests a
           JOIN users u ON u.id = a.assigned_reviewer_id
           JOIN users s ON s.id = a.submitted_by
           ${where}
          ORDER BY CASE a.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
                   a.submitted_at ASC
          LIMIT ? OFFSET ?`,
      )
      .all(...wb.values, meta.pageSize, (meta.page - 1) * meta.pageSize) as any[];

    res.json(
      pageResponse(
        rows.map((r) => ({
          ...r,
          subject_title: subjectTitle(r.subject_type, r.subject_id),
          subject_code: subjectCode(r.subject_type, r.subject_id),
        })),
        { ...meta, total },
      ),
    );
  }),
);

approvalsRouter.get(
  '/meta',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const counts = db
      .prepare(
        `SELECT
           SUM(CASE WHEN status IN ('PENDING','IN_REVIEW') AND assigned_reviewer_id = ? THEN 1 ELSE 0 END) AS mine,
           SUM(CASE WHEN status IN ('PENDING','IN_REVIEW') THEN 1 ELSE 0 END) AS all_pending,
           SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approved,
           SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected,
           SUM(CASE WHEN status = 'RETURNED_FOR_CORRECTION' THEN 1 ELSE 0 END) AS returned
         FROM approval_requests`,
      )
      .get(user.id) as any;

    res.json({
      counts,
      statuses: APPROVAL_STATUSES,
      stages: APPROVAL_STAGE_ORDER,
      reviewers: db
        .prepare(`SELECT id, full_name, email FROM users WHERE role IN ('APPROVAL_MEMBER','ADMINISTRATOR') AND status='ACTIVE'`)
        .all(),
      canReview: can(user, 'approval.review'),
      canViewAll: can(user, 'approval.view.all'),
    });
  }),
);

approvalsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const request = db
      .prepare(
        `SELECT a.*, u.full_name AS reviewer_name, u.email AS reviewer_email,
                s.full_name AS submitted_by_name, s.email AS submitted_by_email,
                CAST(julianday('now') - julianday(a.submitted_at) AS INTEGER) AS days_pending
           FROM approval_requests a
      LEFT JOIN users u ON u.id = a.assigned_reviewer_id
      JOIN users s ON s.id = a.submitted_by
          WHERE a.id = ?`,
      )
      .get(id) as any;
    if (!request) notFound('Approval request not found.');

    const canSeeAll = can(req.user, 'approval.view.all');
    const isParticipant =
      request.assigned_reviewer_id === req.user!.id || request.submitted_by === req.user!.id;
    if (!canSeeAll && !isParticipant) {
      forbidden('You do not have access to this approval request.');
    }

    const decisions = db
      .prepare(
        `SELECT d.*, u.full_name AS reviewer_name, u.role AS reviewer_role
           FROM approval_decisions d LEFT JOIN users u ON u.id = d.reviewer_id
          WHERE d.request_id = ? ORDER BY d.created_at ASC`,
      )
      .all(id) as any[];

    const documents = db
      .prepare(
        `SELECT d.id, d.name, d.category, d.file_type, d.file_size, d.upload_date, d.version,
                u.full_name AS uploaded_by_name
           FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
          WHERE d.related_type='APPROVAL' AND d.related_id = ? ORDER BY d.upload_date DESC`,
      )
      .all(id) as any[];

    const relatedProject =
      request.subject_type === 'PROJECT'
        ? db.prepare('SELECT * FROM research_projects WHERE id = ?').get(request.subject_id)
        : null;

    const stages: string[] = JSON.parse(request.stages || '[]');
    const isAssignedReviewer = request.assigned_reviewer_id === req.user!.id;
    const isAdmin = can(req.user, 'approval.view.all') && req.user!.role === 'ADMINISTRATOR';

    res.json({
      request: {
        ...request,
        subject_title: subjectTitle(request.subject_type, request.subject_id),
        subject_code: subjectCode(request.subject_type, request.subject_id),
      },
      decisions,
      documents,
      relatedProject,
      stages,
      currentStageIndex: stages.indexOf(request.current_stage),
      permissions: {
        canReview: can(req.user, 'approval.review') && (isAssignedReviewer || isAdmin),
        canComment: can(req.user, 'approval.review') && (isAssignedReviewer || isAdmin),
        canResubmit:
          request.status === 'RETURNED_FOR_CORRECTION' && request.submitted_by === req.user!.id,
        isAssignedReviewer,
      },
    });
  }),
);

/** Creates a new approval request (submission for review). */
approvalsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      subjectType: z.enum(['PROJECT', 'IPR', 'STARTUP']),
      subjectId: z.coerce.number().int().positive(),
      requestType: z.string().min(3, 'Request type is required'),
      description: z.string().optional().default(''),
      priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).optional().default('NORMAL'),
      dueAt: z.string().optional().default(''),
      assignedReviewerId: z.coerce.number().int().positive().optional().nullable(),
    });
    const data = schema.parse(req.body);

    const table = SUBJECT_TABLES[data.subjectType];
    const subject = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(data.subjectId) as any;
    if (!subject) notFound('Related record not found.');

    const existing = db
      .prepare(
        `SELECT id FROM approval_requests WHERE subject_type = ? AND subject_id = ?
            AND status IN ('PENDING','IN_REVIEW')`,
      )
      .get(data.subjectType, data.subjectId) as any;
    if (existing) conflict('This record already has an approval request in progress.');

    const stages = APPROVAL_STAGE_ORDER[data.subjectType];
    const reviewerId = data.assignedReviewerId ?? defaultReviewer(data.subjectType);
    const row = db.prepare('SELECT COUNT(*) AS c FROM approval_requests').get() as any;
    const code = `AR-${String(2000 + row.c + 1)}`;

    const result = db
      .prepare(
        `INSERT INTO approval_requests
          (request_code, subject_type, subject_id, request_type, description, submitted_by,
           assigned_reviewer_id, current_stage, stages, status, priority, due_at, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      )
      .run(
        code,
        data.subjectType,
        data.subjectId,
        data.requestType,
        data.description,
        req.user!.id,
        reviewerId,
        stages[0],
        JSON.stringify(stages),
        data.priority,
        data.dueAt || null,
        nowIso(),
      );
    const requestId = Number(result.lastInsertRowid);

    db.prepare(
      `INSERT INTO approval_decisions (request_id, reviewer_id, stage, decision, comment, created_at)
       VALUES (?, ?, ?, 'COMMENT', ?, ?)`,
    ).run(requestId, req.user!.id, stages[0], 'Request submitted for review.', nowIso());

    audit({
      entityType: 'APPROVAL',
      entityId: requestId,
      entityCode: code,
      action: 'APPROVAL_REQUESTED',
      actorId: req.user!.id,
      toStatus: 'PENDING',
      details: `${data.requestType} for ${subjectCode(data.subjectType, data.subjectId)}`,
    });

    if (reviewerId) {
      notify(reviewerId, {
        category: 'NEW_APPROVAL',
        title: `New approval task: ${code}`,
        description: `${data.requestType} — ${subjectTitle(data.subjectType, data.subjectId)}`,
        link: `/approvals/${requestId}`,
      });
    }

    res.status(201).json({ id: requestId, requestCode: code, message: 'Submitted for review.' });
  }),
);

function defaultReviewer(subjectType: string): number | null {
  const role =
    subjectType === 'IPR' ? 'IPR_OFFICER' : subjectType === 'STARTUP' ? 'INCUBATION_MANAGER' : 'APPROVAL_MEMBER';
  const row = db
    .prepare(`SELECT id FROM users WHERE role = ? AND status='ACTIVE' ORDER BY id LIMIT 1`)
    .get(role) as any;
  if (row) return row.id;
  const admin = db.prepare(`SELECT id FROM users WHERE role='ADMINISTRATOR' AND status='ACTIVE' ORDER BY id LIMIT 1`).get() as any;
  return admin?.id ?? null;
}

/** Records a decision on an approval request. */
approvalsRouter.post(
  '/:id/decisions',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      decision: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'COMMENT']),
      comment: z.string().optional().default(''),
    });
    const { decision, comment } = schema.parse(req.body);
    const id = Number(req.params.id);

    if (!can(req.user, 'approval.review')) forbidden('Your role cannot record approval decisions.');
    const request = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(id) as any;
    if (!request) notFound('Approval request not found.');

    const isAssigned = request.assigned_reviewer_id === req.user!.id;
    const isAdmin = req.user!.role === 'ADMINISTRATOR';
    if (!isAssigned && !isAdmin) {
      forbidden('This approval request is assigned to another reviewer.');
    }
    if (!['PENDING', 'IN_REVIEW'].includes(request.status)) {
      conflict(`This request is already ${request.status.toLowerCase().replace(/_/g, ' ')}.`);
    }
    if ((decision === 'REJECTED' || decision === 'CHANGES_REQUESTED') && comment.trim().length < 5) {
      badRequest('A reason is required when rejecting a request or requesting changes.');
    }

    const stages: string[] = JSON.parse(request.stages || '[]');
    let status = request.status;
    let currentStage = request.current_stage;
    let decidedAt: string | null = null;

    if (decision === 'APPROVED') {
      decidedAt = nowIso();
      const upcoming = nextStage(stages, currentStage);
      if (upcoming) {
        currentStage = upcoming;
        status = 'IN_REVIEW';
        const nextReviewer = defaultReviewer(request.subject_type);
        db.prepare('UPDATE approval_requests SET status = ?, current_stage = ?, updated_at = ? WHERE id = ?').run(
          status,
          currentStage,
          nowIso(),
          id,
        );
        if (nextReviewer) {
          db.prepare('UPDATE approval_requests SET assigned_reviewer_id = ? WHERE id = ?').run(nextReviewer, id);
          notify(nextReviewer, {
            category: 'NEW_APPROVAL',
            title: `Approval moved to next stage: ${request.request_code}`,
            description: `Stage: ${currentStage}`,
            link: `/approvals/${id}`,
          });
        }
      } else {
        status = 'APPROVED';
        db.prepare(
          `UPDATE approval_requests SET status = ?, current_stage = ?, decided_at = ?, updated_at = ? WHERE id = ?`,
        ).run(status, currentStage, decidedAt, nowIso(), id);
      }
    } else if (decision === 'REJECTED') {
      status = 'REJECTED';
      decidedAt = nowIso();
      db.prepare(`UPDATE approval_requests SET status = ?, decided_at = ?, updated_at = ? WHERE id = ?`).run(
        status,
        decidedAt,
        nowIso(),
        id,
      );
    } else if (decision === 'CHANGES_REQUESTED') {
      status = 'RETURNED_FOR_CORRECTION';
      decidedAt = nowIso();
      db.prepare(`UPDATE approval_requests SET status = ?, decided_at = ?, updated_at = ? WHERE id = ?`).run(
        status,
        decidedAt,
        nowIso(),
        id,
      );
    } else {
      db.prepare('UPDATE approval_requests SET status = ?, updated_at = ? WHERE id = ?').run('IN_REVIEW', nowIso(), id);
      status = 'IN_REVIEW';
    }

    db.prepare(
      `INSERT INTO approval_decisions (request_id, reviewer_id, stage, decision, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, req.user!.id, request.current_stage, decision, comment || null, nowIso());

    audit({
      entityType: 'APPROVAL',
      entityId: id,
      entityCode: request.request_code,
      action: `DECISION_${decision}`,
      actorId: req.user!.id,
      fromStatus: request.status,
      toStatus: status,
      details: comment || null,
    });

    notify(request.submitted_by, {
      category:
        decision === 'CHANGES_REQUESTED'
          ? 'RETURNED_FOR_CORRECTION'
          : decision === 'COMMENT'
            ? 'SYSTEM'
            : 'APPROVAL_DECISION',
      title: `${decisionLabel(decision)}: ${request.request_code}`,
      description: comment || `Your request was ${decisionLabel(decision).toLowerCase()}.`,
      link: `/approvals/${id}`,
    });

    res.json({ id, status, currentStage, message: `Decision recorded: ${decisionLabel(decision)}.` });
  }),
);

/** Resubmits a request that was returned for correction. */
approvalsRouter.post(
  '/:id/resubmit',
  asyncHandler(async (req, res) => {
    const schema = z.object({ comment: z.string().optional().default('') });
    const { comment } = schema.parse(req.body);
    const id = Number(req.params.id);
    const request = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(id) as any;
    if (!request) notFound('Approval request not found.');
    if (request.status !== 'RETURNED_FOR_CORRECTION') {
      conflict('Only requests returned for correction can be resubmitted.');
    }
    if (request.submitted_by !== req.user!.id && req.user!.role !== 'ADMINISTRATOR') {
      forbidden('Only the submitter can resubmit this request.');
    }
    const stages: string[] = JSON.parse(request.stages || '[]');
    db.prepare(
      `UPDATE approval_requests SET status = 'PENDING', current_stage = ?, decided_at = NULL, updated_at = ? WHERE id = ?`,
    ).run(stages[0] ?? request.current_stage, nowIso(), id);
    db.prepare(
      `INSERT INTO approval_decisions (request_id, reviewer_id, stage, decision, comment, created_at)
       VALUES (?, ?, ?, 'RESUBMITTED', ?, ?)`,
    ).run(id, req.user!.id, request.current_stage, comment || 'Request resubmitted after correction.', nowIso());
    audit({
      entityType: 'APPROVAL',
      entityId: id,
      entityCode: request.request_code,
      action: 'RESUBMITTED',
      actorId: req.user!.id,
      fromStatus: 'RETURNED_FOR_CORRECTION',
      toStatus: 'PENDING',
    });
    if (request.assigned_reviewer_id) {
      notify(request.assigned_reviewer_id, {
        category: 'NEW_APPROVAL',
        title: `Resubmitted for review: ${request.request_code}`,
        description: comment || 'The submitter resubmitted this request.',
        link: `/approvals/${id}`,
      });
    }
    res.json({ message: 'Request resubmitted for review.' });
  }),
);

/** Assigns or reassigns the reviewer (administrators only). */
approvalsRouter.patch(
  '/:id/assign',
  asyncHandler(async (req, res) => {
    const schema = z.object({ assignedReviewerId: z.coerce.number().int().positive() });
    const { assignedReviewerId } = schema.parse(req.body);
    if (req.user!.role !== 'ADMINISTRATOR') forbidden('Only administrators can reassign reviewers.');
    const id = Number(req.params.id);
    const request = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(id) as any;
    if (!request) notFound('Approval request not found.');
    const reviewer = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(assignedReviewerId) as any;
    if (!reviewer) notFound('User not found.');
    db.prepare('UPDATE approval_requests SET assigned_reviewer_id = ?, updated_at = ? WHERE id = ?').run(
      assignedReviewerId,
      nowIso(),
      id,
    );
    audit({
      entityType: 'APPROVAL',
      entityId: id,
      entityCode: request.request_code,
      action: 'REVIEWER_ASSIGNED',
      actorId: req.user!.id,
      details: `Assigned to ${reviewer.full_name}`,
    });
    notify(assignedReviewerId, {
      category: 'NEW_APPROVAL',
      title: `Approval task assigned: ${request.request_code}`,
      description: subjectTitle(request.subject_type, request.subject_id),
      link: `/approvals/${id}`,
    });
    res.json({ message: `Assigned to ${reviewer.full_name}.` });
  }),
);

function decisionLabel(decision: string): string {
  switch (decision) {
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    case 'CHANGES_REQUESTED':
      return 'Changes requested';
    case 'RESUBMITTED':
      return 'Resubmitted';
    default:
      return 'Comment added';
  }
}
