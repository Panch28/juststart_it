import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, pageResponse, paginationFrom, toCsv } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../lib/permissions.js';
import { findSimilar } from '../lib/similarity.js';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

function filterScope(q: Record<string, string>) {
  const where: string[] = [];
  const params: any[] = [];
  if (q.departmentId) {
    where.push('p.department_id = ?');
    params.push(Number(q.departmentId));
  }
  if (q.domain) {
    where.push('p.domain = ?');
    params.push(q.domain);
  }
  if (q.status) {
    where.push('p.status = ?');
    params.push(q.status);
  }
  if (q.from) {
    where.push('date(COALESCE(p.submitted_at, p.created_at)) >= date(?)');
    params.push(q.from);
  }
  if (q.to) {
    where.push('date(COALESCE(p.submitted_at, p.created_at)) <= date(?)');
    params.push(q.to);
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

analyticsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'analytics.view')) {
      res.status(403).json({ error: 'Your role does not include access to institutional analytics.', code: 'FORBIDDEN' });
      return;
    }
    const q = req.query as Record<string, string>;
    const scope = filterScope(q);

    // 1. Research output by department ------------------------------------
    const byDepartment = db
      .prepare(
        `SELECT d.name AS department, d.code,
                COUNT(p.id) AS projects,
                SUM(CASE WHEN p.status IN ('APPROVED','ACTIVE','COMPLETED') THEN 1 ELSE 0 END) AS approved,
                SUM(CASE WHEN p.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
                COALESCE(SUM(p.funding_required), 0) AS funding_requested
           FROM departments d LEFT JOIN research_projects p ON p.department_id = d.id
          GROUP BY d.id ORDER BY projects DESC`,
      )
      .all() as any[];

    // 2/3. Completion rate and approval processing time --------------------
    const totals = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN status IN ('APPROVED','ACTIVE','COMPLETED') THEN 1 ELSE 0 END) AS approved
           FROM research_projects p ${scope.sql}`,
      )
      .get(...scope.params) as any;

    const completionRate = totals.total ? Number(((totals.completed ?? 0) / totals.total) * 100).toFixed(1) : 0;

    const approvalTimes = db
      .prepare(
        `SELECT CAST(julianday(a.decided_at) - julianday(a.submitted_at) AS INTEGER) AS days
           FROM approval_requests a
          WHERE a.decided_at IS NOT NULL AND a.submitted_at IS NOT NULL`,
      )
      .all() as any[];
    const dayList = approvalTimes.map((r) => r.days).filter((d: number | null) => d !== null && d >= 0);
    const avgApprovalDays = dayList.length
      ? Number((dayList.reduce((s: number, d: number) => s + d, 0) / dayList.length).toFixed(1))
      : 0;
    const sortedDays = [...dayList].sort((a, b) => a - b);
    const medianApprovalDays = sortedDays.length
      ? Number(
          (sortedDays.length % 2
            ? sortedDays[(sortedDays.length - 1) / 2]
            : (sortedDays[sortedDays.length / 2 - 1] + sortedDays[sortedDays.length / 2]) / 2
          ).toFixed(1),
        )
      : 0;

    // 4. Pending and overdue approval cases --------------------------------
    const pendingCases = db
      .prepare(
        `SELECT a.id, a.request_code, a.subject_type, a.current_stage, a.submitted_at, a.priority,
                CAST(julianday('now') - julianday(a.submitted_at) AS INTEGER) AS days_pending,
                u.full_name AS reviewer_name
           FROM approval_requests a LEFT JOIN users u ON u.id = a.assigned_reviewer_id
          WHERE a.status IN ('PENDING','IN_REVIEW')
          ORDER BY days_pending DESC`,
      )
      .all() as any[];
    const overdueCases = pendingCases.filter((c) => c.days_pending > 14);

    // 5. IPR portfolio by status and type -----------------------------------
    const iprByStatus = db
      .prepare(`SELECT status AS name, COUNT(*) AS value FROM ipr_records GROUP BY status ORDER BY value DESC`)
      .all() as any[];
    const iprByType = db
      .prepare(`SELECT ipr_type AS name, COUNT(*) AS value FROM ipr_records GROUP BY ipr_type ORDER BY value DESC`)
      .all() as any[];

    // 6. Upcoming IPR deadlines ---------------------------------------------
    const iprDeadlines = db
      .prepare(
        `SELECT i.id, i.ipr_code, i.title, i.ipr_type, i.next_deadline, i.status,
                CAST(julianday(i.next_deadline) - julianday('now') AS INTEGER) AS days_remaining
           FROM ipr_records i
          WHERE i.next_deadline IS NOT NULL AND i.status NOT IN ('GRANTED','CLOSED','REJECTED')
          ORDER BY date(i.next_deadline) ASC`,
      )
      .all() as any[];

    // 7. Startup incubation progress ---------------------------------------
    const startupByStage = db
      .prepare(`SELECT stage AS name, COUNT(*) AS value FROM startups GROUP BY stage ORDER BY value DESC`)
      .all() as any[];
    const startupProgress = db
      .prepare(
        `SELECT s.id, s.startup_code, s.name, s.stage, s.progress,
                (SELECT COUNT(*) FROM startup_milestones m WHERE m.startup_id = s.id) AS milestones,
                (SELECT COUNT(*) FROM startup_milestones m WHERE m.startup_id = s.id AND m.status='COMPLETED') AS milestones_done
           FROM startups s ORDER BY s.created_at DESC`,
      )
      .all() as any[];

    // 8. Funding requested versus approved ---------------------------------
    const fundingBySource = db
      .prepare(
        `SELECT source AS name,
                SUM(requested_amount) AS requested,
                SUM(approved_amount) AS approved,
                SUM(received_amount) AS received,
                COUNT(*) AS records
           FROM funding_records GROUP BY source ORDER BY requested DESC`,
      )
      .all() as any[];
    const fundingTotals = db
      .prepare(
        `SELECT COALESCE(SUM(requested_amount),0) AS requested,
                COALESCE(SUM(approved_amount),0) AS approved,
                COALESCE(SUM(received_amount),0) AS received
           FROM funding_records`,
      )
      .get() as any;

    // 9. Submission trends ---------------------------------------------------
    const monthlyTrend = db
      .prepare(
        `SELECT strftime('%Y-%m', COALESCE(submitted_at, created_at)) AS period,
                COUNT(*) AS submissions,
                SUM(CASE WHEN status IN ('APPROVED','ACTIVE','COMPLETED') THEN 1 ELSE 0 END) AS approved,
                SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected
           FROM research_projects p ${scope.sql}
          GROUP BY period ORDER BY period`,
      )
      .all(...scope.params) as any[];

    const yearlyTrend = db
      .prepare(
        `SELECT strftime('%Y', COALESCE(submitted_at, created_at)) AS period, COUNT(*) AS submissions,
                SUM(CASE WHEN status IN ('APPROVED','ACTIVE','COMPLETED') THEN 1 ELSE 0 END) AS approved
           FROM research_projects p ${scope.sql}
          GROUP BY period ORDER BY period`,
      )
      .all(...scope.params) as any[];

    const fundingApps = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status='APPROVED' THEN 1 ELSE 0 END) AS approved,
                SUM(CASE WHEN status='REJECTED' THEN 1 ELSE 0 END) AS rejected,
                SUM(CASE WHEN status IN ('REQUESTED','SUBMITTED') THEN 1 ELSE 0 END) AS open
           FROM funding_applications`,
      )
      .get() as any;

    res.json({
      researchOutputByDepartment: byDepartment,
      completionRate: {
        rate: completionRate,
        completed: totals.completed ?? 0,
        total: totals.total ?? 0,
        approved: totals.approved ?? 0,
        definition: 'Completed projects divided by total projects matching the current filters.',
      },
      approvalProcessingTime: {
        averageDays: avgApprovalDays,
        medianDays: medianApprovalDays,
        decidedCount: dayList.length,
        definition: 'Calendar days between submission and the final decision on decided requests.',
      },
      pendingApprovals: {
        total: pendingCases.length,
        overdue: overdueCases.length,
        definition: 'Overdue = pending for more than 14 days.',
        cases: pendingCases,
        overdueCases,
      },
      iprPortfolio: { byStatus: iprByStatus, byType: iprByType },
      upcomingIprDeadlines: iprDeadlines,
      startupIncubation: { byStage: startupByStage, progress: startupProgress },
      funding: { bySource: fundingBySource, totals: fundingTotals, applications: fundingApps },
      submissionTrends: { monthly: monthlyTrend, yearly: yearlyTrend },
      filters: {
        departments: db.prepare('SELECT id, name FROM departments ORDER BY name').all(),
        domains: db.prepare('SELECT DISTINCT domain FROM research_projects ORDER BY domain').all(),
        projectStatuses: db.prepare('SELECT DISTINCT status FROM research_projects ORDER BY status').all(),
        iprTypes: db.prepare('SELECT DISTINCT ipr_type FROM ipr_records ORDER BY ipr_type').all(),
        startupStages: db.prepare('SELECT DISTINCT stage FROM startups ORDER BY stage').all(),
      },
    });
  }),
);

/** Exports the current analytics dataset as CSV. */
analyticsRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'analytics.view')) {
      res.status(403).json({ error: 'Your role does not include access to institutional analytics.', code: 'FORBIDDEN' });
      return;
    }
    const q = req.query as Record<string, string>;
    const scope = filterScope(q);
    const rows = db
      .prepare(
        `SELECT p.project_code, p.title, p.domain, p.category, d.name AS department,
                u.full_name AS principal_investigator, p.status, p.progress, p.funding_required,
                COALESCE(p.submitted_at, p.created_at) AS submitted_date,
                (SELECT COUNT(*) FROM ipr_records i WHERE i.project_id = p.id) AS ipr_records
           FROM research_projects p
           JOIN departments d ON d.id = p.department_id
           JOIN users u ON u.id = p.principal_investigator_id
           ${scope.sql}
          ORDER BY d.name, p.title`,
      )
      .all(...scope.params) as any[];

    const csv = toCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="research-analytics.csv"`);
    res.send(csv || 'project_code,title\n');
  }),
);

/**
 * Similarity screening for a project (TF-IDF + cosine similarity).
 * Results are suggestions for human review, not a plagiarism or novelty verdict.
 */
analyticsRouter.get(
  '/similar/:projectId',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.projectId);
    const project = db
      .prepare('SELECT id, project_code, title, description, status FROM research_projects WHERE id = ?')
      .get(id) as any;
    if (!project) {
      res.status(404).json({ error: 'Research project not found.', code: 'NOT_FOUND' });
      return;
    }
    const others = db
      .prepare(
        `SELECT id, project_code AS code, title, description, status FROM research_projects WHERE id <> ?`,
      )
      .all(id) as any[];
    const similar = findSimilar(project, others);
    res.json({
      project,
      similar,
      notice:
        'Similarity scores are computed with TF-IDF and cosine similarity. They are screening aids for human review and are not evidence of plagiarism or of patent novelty.',
    });
  }),
);
