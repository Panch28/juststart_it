import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso, daysUntil } from '../db/connection.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound, pageResponse, paginationFrom, WhereBuilder, likeParam } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../lib/permissions.js';
import { audit, timelineFor } from '../lib/audit.js';
import { notifyMany } from '../lib/notifications.js';
import { canTransitionIpr, IPR_TRANSITIONS } from '../lib/workflow.js';
import { IPR_STATUSES, IPR_TYPES, type IprStatus } from '../types/index.js';

export const iprRouter = Router();
iprRouter.use(requireAuth);

const iprSchema = z.object({
  projectId: z.coerce.number().int().positive().optional().nullable(),
  title: z.string().min(5, 'IPR title must be at least 5 characters'),
  iprType: z.enum(IPR_TYPES),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  inventors: z
    .array(
      z.object({
        name: z.string().min(2, 'Inventor name is required'),
        email: z.string().email().optional().or(z.literal('')),
        userId: z.coerce.number().int().positive().optional().nullable(),
        order: z.coerce.number().int().positive().optional(),
      }),
    )
    .min(1, 'At least one inventor or creator is required'),
  disclosureDate: z.string().optional().default(''),
  filingDate: z.string().optional().default(''),
  nextDeadline: z.string().optional().default(''),
  status: z.enum(IPR_STATUSES).optional(),
  iprOfficerId: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().optional().default(''),
});

function nextIprCode(): string {
  const row = db.prepare('SELECT COUNT(*) AS c FROM ipr_records').get() as any;
  return `IPR-${String(500 + row.c + 1)}`;
}

iprRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const meta = paginationFrom(q, 10);
    const wb = new WhereBuilder();

    if (q.search) {
      const t = likeParam(q.search);
      wb.add('(lower(i.title) LIKE ? OR lower(i.ipr_code) LIKE ?)', t, t);
    }
    if (q.type) wb.add('i.ipr_type = ?', q.type);
    if (q.status) wb.add('i.status = ?', q.status);
    if (q.departmentId) wb.add('p.department_id = ?', Number(q.departmentId));
    if (q.officerId) wb.add('i.ipr_officer_id = ?', Number(q.officerId));
    if (q.projectId) wb.add('i.project_id = ?', Number(q.projectId));
    if (q.inventor) {
      wb.addRaw(
        'i.id IN (SELECT ipr_id FROM ipr_inventors WHERE lower(name) LIKE ? OR lower(COALESCE(email,\'\')) LIKE ?)',
        likeParam(q.inventor),
        likeParam(q.inventor),
      );
    }
    if (q.deadlineFrom) wb.add('date(i.next_deadline) >= date(?)', q.deadlineFrom);
    if (q.deadlineTo) wb.add('date(i.next_deadline) <= date(?)', q.deadlineTo);

    const where = wb.sql();
    const total = (
      db.prepare(
        `SELECT COUNT(*) AS c FROM ipr_records i LEFT JOIN research_projects p ON p.id = i.project_id ${where}`,
      ).get(...wb.values) as any
    ).c as number;

    const rows = db
      .prepare(
        `SELECT i.*, p.project_code, p.title AS project_title, u.full_name AS officer_name,
                d.name AS department_name,
                (SELECT GROUP_CONCAT(name, ', ') FROM ipr_inventors inv WHERE inv.ipr_id = i.id) AS inventor_names,
                (SELECT COUNT(*) FROM documents doc WHERE doc.related_type = 'IPR' AND doc.related_id = i.id) AS document_count
           FROM ipr_records i
      LEFT JOIN research_projects p ON p.id = i.project_id
      LEFT JOIN users u ON u.id = i.ipr_officer_id
      LEFT JOIN departments d ON d.id = p.department_id
           ${where}
          ORDER BY COALESCE(i.next_deadline, i.created_at) ASC
          LIMIT ? OFFSET ?`,
      )
      .all(...wb.values, meta.pageSize, (meta.page - 1) * meta.pageSize) as any[];

    res.json(
      pageResponse(
        rows.map((r) => ({
          ...r,
          days_to_deadline: r.next_deadline ? daysUntil(r.next_deadline) : null,
          deadline_state:
            !r.next_deadline ? 'NONE' : daysUntil(r.next_deadline) < 0 ? 'OVERDUE' : daysUntil(r.next_deadline) <= 7 ? 'URGENT' : 'UPCOMING',
        })),
        { ...meta, total },
      ),
    );
  }),
);

iprRouter.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    res.json({
      types: IPR_TYPES,
      statuses: IPR_STATUSES,
      transitions: IPR_TRANSITIONS,
      officers: db
        .prepare(`SELECT id, full_name, email FROM users WHERE role IN ('IPR_OFFICER','ADMINISTRATOR') AND status='ACTIVE'`)
        .all(),
      eligibleProjects: db
        .prepare(
          `SELECT id, project_code, title, status FROM research_projects
            WHERE status IN ('APPROVED','ACTIVE','COMPLETED') ORDER BY title`,
        )
        .all(),
    });
  }),
);

iprRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const record = db
      .prepare(
        `SELECT i.*, p.project_code, p.title AS project_title, p.status AS project_status,
                u.full_name AS officer_name, d.name AS department_name,
                (SELECT GROUP_CONCAT(name, ', ') FROM ipr_inventors inv WHERE inv.ipr_id = i.id) AS inventor_names
           FROM ipr_records i
      LEFT JOIN research_projects p ON p.id = i.project_id
      LEFT JOIN users u ON u.id = i.ipr_officer_id
      LEFT JOIN departments d ON d.id = p.department_id
          WHERE i.id = ?`,
      )
      .get(id) as any;
    if (!record) notFound('IPR record not found.');

    const inventors = db
      .prepare(
        `SELECT inv.*, u.full_name AS user_name FROM ipr_inventors inv
      LEFT JOIN users u ON u.id = inv.user_id WHERE inv.ipr_id = ? ORDER BY inv.creator_order`,
      )
      .all(id) as any[];

    const documents = db
      .prepare(
        `SELECT d.id, d.name, d.category, d.file_type, d.file_size, d.upload_date, d.version, d.status,
                u.full_name AS uploaded_by_name
           FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
          WHERE d.related_type = 'IPR' AND d.related_id = ? ORDER BY d.upload_date DESC`,
      )
      .all(id) as any[];

    const timeline = timelineFor('IPR', id);

    const comments = db
      .prepare(
        `SELECT a.*, u.full_name AS reviewer_name FROM approval_decisions a
      LEFT JOIN users u ON u.id = a.reviewer_id
          WHERE a.request_id IN (SELECT id FROM approval_requests WHERE subject_type='IPR' AND subject_id = ?)
          ORDER BY a.created_at DESC`,
      )
      .all(id) as any[];

    const approvals = db
      .prepare(
        `SELECT a.id, a.request_code, a.request_type, a.current_stage, a.status, a.submitted_at,
                u.full_name AS reviewer_name
           FROM approval_requests a LEFT JOIN users u ON u.id = a.assigned_reviewer_id
          WHERE a.subject_type = 'IPR' AND a.subject_id = ? ORDER BY a.created_at DESC`,
      )
      .all(id) as any[];

    const isOfficer = record.ipr_officer_id === req.user!.id;
    const canUpdate = can(req.user, 'ipr.update.any') || (can(req.user, 'ipr.update.assigned') && isOfficer);

    res.json({
      record: {
        ...record,
        days_to_deadline: record.next_deadline ? daysUntil(record.next_deadline) : null,
        deadline_state: !record.next_deadline
          ? 'NONE'
          : daysUntil(record.next_deadline) < 0
            ? 'OVERDUE'
            : daysUntil(record.next_deadline) <= 7
              ? 'URGENT'
              : 'UPCOMING',
      },
      inventors,
      documents,
      timeline,
      comments,
      approvals,
      permissions: {
        canUpdate,
        canDelete: can(req.user, 'ipr.update.any'),
        allowedTransitions: canUpdate ? IPR_TRANSITIONS[record.status as IprStatus] : [],
        canUpload: can(req.user, 'document.upload'),
      },
      notice:
        'Administrative tracking only. Statuses reflect internal workflow state and do not represent a legal determination of patentability or filing eligibility.',
    });
  }),
);

iprRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'ipr.create')) forbidden('Your role cannot create IPR records.');
    const data = iprSchema.parse(req.body);

    if (data.projectId) {
      const project = db.prepare('SELECT * FROM research_projects WHERE id = ?').get(data.projectId) as any;
      if (!project) notFound('Related research project not found.');
      if (!['APPROVED', 'ACTIVE', 'COMPLETED'].includes(project.status)) {
        badRequest('An IPR record can only be linked to an approved, active or completed project.');
      }
    }
    if (data.filingDate && data.disclosureDate && data.filingDate < data.disclosureDate) {
      badRequest('Filing date cannot be earlier than the disclosure date.');
    }

    const code = nextIprCode();
    const result = db
      .prepare(
        `INSERT INTO ipr_records
          (ipr_code, project_id, title, ipr_type, description, disclosure_date, filing_date,
           next_deadline, status, ipr_officer_id, notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        code,
        data.projectId ?? null,
        data.title,
        data.iprType,
        data.description,
        data.disclosureDate || null,
        data.filingDate || null,
        data.nextDeadline || null,
        data.status ?? 'DRAFT',
        data.iprOfficerId ?? null,
        data.notes,
        req.user!.id,
        nowIso(),
        nowIso(),
      );
    const iprId = Number(result.lastInsertRowid);

    for (const [idx, inv] of data.inventors.entries()) {
      db.prepare(
        `INSERT INTO ipr_inventors (ipr_id, user_id, name, email, creator_order) VALUES (?, ?, ?, ?, ?)`,
      ).run(iprId, inv.userId ?? null, inv.name, inv.email || null, inv.order ?? idx + 1);
    }

    audit({
      entityType: 'IPR',
      entityId: iprId,
      entityCode: code,
      action: 'IPR_CREATED',
      actorId: req.user!.id,
      toStatus: data.status ?? 'DRAFT',
      details: data.title,
    });

    res.status(201).json({ id: iprId, iprCode: code, message: 'IPR record created.' });
  }),
);

iprRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM ipr_records WHERE id = ?').get(id) as any;
    if (!existing) notFound('IPR record not found.');
    const isOfficer = existing.ipr_officer_id === req.user!.id;
    if (!can(req.user, 'ipr.update.any') && !(can(req.user, 'ipr.update.assigned') && isOfficer)) {
      forbidden('You cannot edit this IPR record.');
    }
    const data = iprSchema.partial().parse(req.body);

    if (data.status && data.status !== existing.status) {
      if (!canTransitionIpr(existing.status as IprStatus, data.status as IprStatus)) {
        conflict(`Cannot move an IPR record from ${existing.status} to ${data.status}.`);
      }
    }

    db.prepare(
      `UPDATE ipr_records SET project_id = ?, title = ?, ipr_type = ?, description = ?,
         disclosure_date = ?, filing_date = ?, next_deadline = ?, status = ?, ipr_officer_id = ?,
         notes = ?, updated_at = ? WHERE id = ?`,
    ).run(
      data.projectId ?? existing.project_id,
      data.title ?? existing.title,
      data.iprType ?? existing.ipr_type,
      data.description ?? existing.description,
      data.disclosureDate ?? existing.disclosure_date,
      data.filingDate ?? existing.filing_date,
      data.nextDeadline ?? existing.next_deadline,
      data.status ?? existing.status,
      data.iprOfficerId ?? existing.ipr_officer_id,
      data.notes ?? existing.notes,
      nowIso(),
      id,
    );

    if (data.inventors) {
      db.prepare('DELETE FROM ipr_inventors WHERE ipr_id = ?').run(id);
      for (const [idx, inv] of data.inventors.entries()) {
        db.prepare(
          `INSERT INTO ipr_inventors (ipr_id, user_id, name, email, creator_order) VALUES (?, ?, ?, ?, ?)`,
        ).run(id, inv.userId ?? null, inv.name, inv.email || null, inv.order ?? idx + 1);
      }
    }

    audit({
      entityType: 'IPR',
      entityId: id,
      entityCode: existing.ipr_code,
      action: data.status && data.status !== existing.status ? 'IPR_STATUS_CHANGED' : 'IPR_UPDATED',
      actorId: req.user!.id,
      fromStatus: existing.status,
      toStatus: data.status ?? existing.status,
    });

    res.json({ id, message: 'IPR record updated.' });
  }),
);

iprRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'ipr.update.any')) forbidden('You cannot delete IPR records.');
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM ipr_records WHERE id = ?').get(id) as any;
    if (!existing) notFound('IPR record not found.');
    if (existing.status !== 'DRAFT') {
      conflict('Only draft IPR records can be deleted. Close the record instead.');
    }
    db.prepare('DELETE FROM ipr_records WHERE id = ?').run(id);
    audit({ entityType: 'IPR', entityId: id, entityCode: existing.ipr_code, action: 'IPR_DELETED', actorId: req.user!.id });
    res.json({ message: 'Draft IPR record deleted.' });
  }),
);

/** Assign / reassign the IPR officer. */
iprRouter.patch(
  '/:id/assign',
  asyncHandler(async (req, res) => {
    const schema = z.object({ iprOfficerId: z.coerce.number().int().positive() });
    const { iprOfficerId } = schema.parse(req.body);
    if (!can(req.user, 'ipr.update.any')) forbidden('Only administrators can reassign IPR officers.');
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM ipr_records WHERE id = ?').get(id) as any;
    if (!existing) notFound('IPR record not found.');
    const officer = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(iprOfficerId) as any;
    if (!officer) notFound('User not found.');
    db.prepare('UPDATE ipr_records SET ipr_officer_id = ?, updated_at = ? WHERE id = ?').run(iprOfficerId, nowIso(), id);
    audit({
      entityType: 'IPR',
      entityId: id,
      entityCode: existing.ipr_code,
      action: 'IPR_REASSIGNED',
      actorId: req.user!.id,
      details: `Assigned to ${officer.full_name}`,
    });
    notifyMany([iprOfficerId], {
      category: 'SYSTEM',
      title: `IPR record assigned: ${existing.ipr_code}`,
      description: existing.title,
      link: `/ipr/${id}`,
    });
    res.json({ message: `Assigned to ${officer.full_name}.` });
  }),
);
