import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso, daysUntil } from '../db/connection.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound, pageResponse, paginationFrom, WhereBuilder, likeParam } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';

export const fundingRouter = Router();
fundingRouter.use(requireAuth);

const opportunitySchema = z.object({
  title: z.string().min(5, 'Opportunity title must be at least 5 characters'),
  organization: z.string().min(3, 'Funding organization is required'),
  category: z.enum(['RESEARCH', 'STARTUP', 'BOTH']),
  domain: z.string().optional().default(''),
  amountMin: z.coerce.number().min(0).optional().nullable(),
  amountMax: z.coerce.number().min(0).optional().nullable(),
  eligibility: z.string().min(10, 'Eligibility summary is required'),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  opensOn: z.string().optional().default(''),
  closesOn: z.string().min(1, 'Application deadline is required'),
  externalUrl: z.string().url('Enter a valid URL').optional().or(z.literal('')),
  internalNotes: z.string().optional().default(''),
  status: z.enum(['UPCOMING', 'OPEN', 'CLOSED']).optional(),
});

function nextOpportunityCode(): string {
  const row = db.prepare('SELECT COUNT(*) AS c FROM funding_opportunities').get() as any;
  return `FO-${String(300 + row.c + 1)}`;
}

fundingRouter.get(
  '/opportunities',
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const meta = paginationFrom(q, 9);
    const wb = new WhereBuilder();

    if (q.search) {
      const t = likeParam(q.search);
      wb.add('(lower(f.title) LIKE ? OR lower(f.code) LIKE ? OR lower(f.organization) LIKE ?)', t, t, t);
    }
    if (q.category) wb.add('(f.category = ? OR f.category = ?)', q.category, 'BOTH');
    if (q.organization) wb.add('lower(f.organization) = lower(?)', q.organization);
    if (q.domain) wb.add('lower(f.domain) = lower(?)', q.domain);
    if (q.status) wb.add('f.status = ?', q.status);
    if (q.minAmount) wb.add('COALESCE(f.amount_max, f.amount_min) >= ?', Number(q.minAmount));
    if (q.maxAmount) wb.add('COALESCE(f.amount_min, f.amount_max) <= ?', Number(q.maxAmount));
    if (q.eligibility) wb.add('lower(f.eligibility) LIKE ?', likeParam(q.eligibility));
    if (q.deadlineBefore) wb.add('date(f.closes_on) <= date(?)', q.deadlineBefore);
    if (q.deadlineAfter) wb.add('date(f.closes_on) >= date(?)', q.deadlineAfter);

    const where = wb.sql();
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM funding_opportunities f ${where}`).get(...wb.values) as any
    ).c as number;

    const rows = db
      .prepare(
        `SELECT f.*, (SELECT COUNT(*) FROM funding_applications fa WHERE fa.opportunity_id = f.id) AS application_count,
                (SELECT COALESCE(SUM(fa.requested_amount),0) FROM funding_applications fa WHERE fa.opportunity_id = f.id) AS requested_total
           FROM funding_opportunities f ${where}
          ORDER BY CASE f.status WHEN 'OPEN' THEN 0 WHEN 'UPCOMING' THEN 1 ELSE 2 END, date(f.closes_on) ASC
          LIMIT ? OFFSET ?`,
      )
      .all(...wb.values, meta.pageSize, (meta.page - 1) * meta.pageSize) as any[];

    res.json(
      pageResponse(
        rows.map((r) => ({ ...r, days_to_close: r.closes_on ? daysUntil(r.closes_on) : null })),
        { ...meta, total },
      ),
    );
  }),
);

fundingRouter.get(
  '/opportunities/meta',
  asyncHandler(async (_req, res) => {
    res.json({
      organizations: db.prepare('SELECT DISTINCT organization FROM funding_opportunities ORDER BY organization').all(),
      domains: db.prepare(`SELECT DISTINCT domain FROM funding_opportunities WHERE domain IS NOT NULL AND domain <> '' ORDER BY domain`).all(),
      categories: ['RESEARCH', 'STARTUP', 'BOTH'],
      statuses: ['UPCOMING', 'OPEN', 'CLOSED'],
    });
  }),
);

fundingRouter.get(
  '/opportunities/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const opportunity = db.prepare('SELECT * FROM funding_opportunities WHERE id = ?').get(id) as any;
    if (!opportunity) notFound('Funding opportunity not found.');

    const applications = db
      .prepare(
        `SELECT fa.*, CASE fa.subject_type
                   WHEN 'PROJECT' THEN (SELECT p.project_code FROM research_projects p WHERE p.id = fa.subject_id)
                   ELSE (SELECT s.startup_code FROM startups s WHERE s.id = fa.subject_id) END AS subject_code,
                CASE fa.subject_type
                   WHEN 'PROJECT' THEN (SELECT p.title FROM research_projects p WHERE p.id = fa.subject_id)
                   ELSE (SELECT s.name FROM startups s WHERE s.id = fa.subject_id) END AS subject_title
           FROM funding_applications fa WHERE fa.opportunity_id = ? ORDER BY fa.created_at DESC`,
      )
      .all(id) as any[];

    const documents = db
      .prepare(
        `SELECT d.id, d.name, d.category, d.file_type, d.file_size, d.upload_date, u.full_name AS uploaded_by_name
           FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
          WHERE d.related_type='FUNDING' AND d.related_id = ? ORDER BY d.upload_date DESC`,
      )
      .all(id) as any[];

    res.json({
      opportunity: { ...opportunity, days_to_close: opportunity.closes_on ? daysUntil(opportunity.closes_on) : null },
      applications,
      documents,
      permissions: { canManage: can(req.user, 'funding.manage'), canApply: can(req.user, 'funding.apply') },
      notice:
        'Catalogue entries are illustrative sample data maintained inside this system. No external application is submitted by this platform.',
    });
  }),
);

fundingRouter.post(
  '/opportunities',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'funding.manage')) forbidden('Your role cannot manage funding opportunities.');
    const data = opportunitySchema.parse(req.body);
    const amountMin = data.amountMin ?? null;
    const amountMax = data.amountMax ?? null;
    if (amountMax !== null && amountMin !== null && amountMax < amountMin) {
      badRequest('Maximum amount must be greater than or equal to the minimum amount.');
    }
    if (data.opensOn && data.closesOn && data.closesOn < data.opensOn) {
      badRequest('Closing date cannot be earlier than the opening date.');
    }
    const code = nextOpportunityCode();
    const result = db
      .prepare(
        `INSERT INTO funding_opportunities
          (code, title, organization, category, domain, amount_min, amount_max, eligibility, description,
           opens_on, closes_on, external_url, status, internal_notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        code,
        data.title,
        data.organization,
        data.category,
        data.domain,
        amountMin,
        amountMax,
        data.eligibility,
        data.description,
        data.opensOn || null,
        data.closesOn,
        data.externalUrl || null,
        data.status ?? 'OPEN',
        data.internalNotes,
        req.user!.id,
        nowIso(),
        nowIso(),
      );
    audit({
      entityType: 'FUNDING',
      entityId: Number(result.lastInsertRowid),
      entityCode: code,
      action: 'OPPORTUNITY_CREATED',
      actorId: req.user!.id,
      details: data.title,
    });
    res.status(201).json({ id: Number(result.lastInsertRowid), code, message: 'Funding opportunity added.' });
  }),
);

fundingRouter.put(
  '/opportunities/:id',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'funding.manage')) forbidden('Your role cannot manage funding opportunities.');
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM funding_opportunities WHERE id = ?').get(id) as any;
    if (!existing) notFound('Funding opportunity not found.');
    const data = opportunitySchema.partial().parse(req.body);
    db.prepare(
      `UPDATE funding_opportunities SET title = ?, organization = ?, category = ?, domain = ?,
         amount_min = ?, amount_max = ?, eligibility = ?, description = ?, opens_on = ?, closes_on = ?,
         external_url = ?, status = ?, internal_notes = ?, updated_at = ? WHERE id = ?`,
    ).run(
      data.title ?? existing.title,
      data.organization ?? existing.organization,
      data.category ?? existing.category,
      data.domain ?? existing.domain,
      data.amountMin ?? existing.amount_min,
      data.amountMax ?? existing.amount_max,
      data.eligibility ?? existing.eligibility,
      data.description ?? existing.description,
      data.opensOn ?? existing.opens_on,
      data.closesOn ?? existing.closes_on,
      data.externalUrl ?? existing.external_url,
      data.status ?? existing.status,
      data.internalNotes ?? existing.internal_notes,
      nowIso(),
      id,
    );
    audit({ entityType: 'FUNDING', entityId: id, entityCode: existing.code, action: 'OPPORTUNITY_UPDATED', actorId: req.user!.id });
    res.json({ message: 'Opportunity updated.' });
  }),
);

fundingRouter.delete(
  '/opportunities/:id',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'funding.manage')) forbidden('Your role cannot manage funding opportunities.');
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM funding_opportunities WHERE id = ?').get(id) as any;
    if (!existing) notFound('Funding opportunity not found.');
    const apps = db.prepare('SELECT COUNT(*) AS c FROM funding_applications WHERE opportunity_id = ?').get(id) as any;
    if (apps.c > 0) conflict('This opportunity has linked funding applications and cannot be deleted.');
    db.prepare('DELETE FROM funding_opportunities WHERE id = ?').run(id);
    audit({ entityType: 'FUNDING', entityId: id, entityCode: existing.code, action: 'OPPORTUNITY_DELETED', actorId: req.user!.id });
    res.json({ message: 'Opportunity deleted.' });
  }),
);

// ----------------------------------------------------------- funding records
fundingRouter.get(
  '/records',
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const wb = new WhereBuilder();
    if (q.subjectType) wb.add('f.subject_type = ?', q.subjectType);
    if (q.subjectId) wb.add('f.subject_id = ?', Number(q.subjectId));
    if (q.status) wb.add('f.status = ?', q.status);
    if (q.source) wb.add('lower(f.source) LIKE ?', likeParam(q.source));

    const where = wb.sql();
    const rows = db
      .prepare(
        `SELECT f.*, fo.code AS opportunity_code, fo.title AS opportunity_title,
                CASE f.subject_type
                  WHEN 'PROJECT' THEN (SELECT p.project_code FROM research_projects p WHERE p.id = f.subject_id)
                  ELSE (SELECT s.startup_code FROM startups s WHERE s.id = f.subject_id) END AS subject_code,
                CASE f.subject_type
                  WHEN 'PROJECT' THEN (SELECT p.title FROM research_projects p WHERE p.id = f.subject_id)
                  ELSE (SELECT s.name FROM startups s WHERE s.id = f.subject_id) END AS subject_title
           FROM funding_records f
      LEFT JOIN funding_opportunities fo ON fo.id = f.opportunity_id
           ${where}
          ORDER BY f.created_at DESC`,
      )
      .all(...wb.values) as any[];

    const totals = db
      .prepare(
        `SELECT COALESCE(SUM(requested_amount),0) AS requested,
                COALESCE(SUM(approved_amount),0) AS approved,
                COALESCE(SUM(received_amount),0) AS received,
                COUNT(*) AS records
           FROM funding_records`,
      )
      .get() as any;

    res.json({ records: rows, totals });
  }),
);

const recordSchema = z.object({
  subjectType: z.enum(['PROJECT', 'STARTUP']),
  subjectId: z.coerce.number().int().positive(),
  source: z.string().min(3, 'Funding source is required'),
  opportunityId: z.coerce.number().int().positive().optional().nullable(),
  requestedAmount: z.coerce.number().min(0),
  approvedAmount: z.coerce.number().min(0).optional().default(0),
  receivedAmount: z.coerce.number().min(0).optional().default(0),
  applicationDate: z.string().optional().default(''),
  decisionDate: z.string().optional().default(''),
  status: z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'PARTIALLY_RECEIVED', 'RECEIVED']).optional(),
  notes: z.string().optional().default(''),
});

fundingRouter.post(
  '/records',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'funding.apply')) forbidden('Your role cannot create funding records.');
    const data = recordSchema.parse(req.body);
    if (data.approvedAmount > data.requestedAmount) {
      badRequest('Approved amount cannot exceed the requested amount.');
    }
    if (data.receivedAmount > data.approvedAmount) {
      badRequest('Received amount cannot exceed the approved amount.');
    }
    const table = data.subjectType === 'PROJECT' ? 'research_projects' : 'startups';
    const subject = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(data.subjectId) as any;
    if (!subject) notFound('Related record not found.');

    const result = db
      .prepare(
        `INSERT INTO funding_records
          (subject_type, subject_id, source, opportunity_id, requested_amount, approved_amount,
           received_amount, application_date, decision_date, status, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.subjectType,
        data.subjectId,
        data.source,
        data.opportunityId ?? null,
        data.requestedAmount,
        data.approvedAmount,
        data.receivedAmount,
        data.applicationDate || null,
        data.decisionDate || null,
        data.status ?? 'REQUESTED',
        data.notes,
        nowIso(),
      );

    if (data.opportunityId) {
      db.prepare(
        `INSERT INTO funding_applications
          (opportunity_id, subject_type, subject_id, requested_amount, application_date, status, approved_amount, decision_date, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        data.opportunityId,
        data.subjectType,
        data.subjectId,
        data.requestedAmount,
        data.applicationDate || null,
        data.status === 'APPROVED' ? 'APPROVED' : data.status === 'REJECTED' ? 'REJECTED' : 'REQUESTED',
        data.approvedAmount,
        data.decisionDate || null,
        data.notes,
        nowIso(),
      );
    }

    audit({
      entityType: 'FUNDING_RECORD',
      entityId: Number(result.lastInsertRowid),
      action: 'FUNDING_RECORD_CREATED',
      actorId: req.user!.id,
      toStatus: data.status ?? 'REQUESTED',
      details: `${data.source} — requested ${data.requestedAmount}`,
    });
    res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Funding record created.' });
  }),
);

fundingRouter.put(
  '/records/:id',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'funding.manage')) forbidden('Only administrators can update funding records.');
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM funding_records WHERE id = ?').get(id) as any;
    if (!existing) notFound('Funding record not found.');
    const data = recordSchema.partial().parse(req.body);
    const merged = {
      ...existing,
      ...data,
      requested_amount: data.requestedAmount ?? existing.requested_amount,
      approved_amount: data.approvedAmount ?? existing.approved_amount,
      received_amount: data.receivedAmount ?? existing.received_amount,
    };
    if (merged.approved_amount > merged.requested_amount) {
      badRequest('Approved amount cannot exceed the requested amount.');
    }
    if (merged.received_amount > merged.approved_amount) {
      badRequest('Received amount cannot exceed the approved amount.');
    }
    db.prepare(
      `UPDATE funding_records SET source = ?, requested_amount = ?, approved_amount = ?, received_amount = ?,
         application_date = ?, decision_date = ?, status = ?, notes = ? WHERE id = ?`,
    ).run(
      merged.source,
      merged.requested_amount,
      merged.approved_amount,
      merged.received_amount,
      data.applicationDate ?? existing.application_date,
      data.decisionDate ?? existing.decision_date,
      data.status ?? existing.status,
      data.notes ?? existing.notes,
      id,
    );
    audit({
      entityType: 'FUNDING_RECORD',
      entityId: id,
      action: 'FUNDING_RECORD_UPDATED',
      actorId: req.user!.id,
      fromStatus: existing.status,
      toStatus: data.status ?? existing.status,
    });
    res.json({ message: 'Funding record updated.' });
  }),
);

fundingRouter.delete(
  '/records/:id',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'funding.manage')) forbidden('Only administrators can delete funding records.');
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM funding_records WHERE id = ?').get(id) as any;
    if (!existing) notFound('Funding record not found.');
    db.prepare('DELETE FROM funding_records WHERE id = ?').run(id);
    audit({ entityType: 'FUNDING_RECORD', entityId: id, action: 'FUNDING_RECORD_DELETED', actorId: req.user!.id });
    res.json({ message: 'Funding record deleted.' });
  }),
);
