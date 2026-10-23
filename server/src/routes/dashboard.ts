import { Router } from 'express';
import { db, daysUntil } from '../db/connection.js';
import { asyncHandler } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

/** Restricts rows to the signed-in user's scope unless they can see everything. */
function scopeClause(user: { id: number; role: string }, deptId: number | null, alias = ''): { sql: string; params: any[] } {
  const p = alias ? `${alias}.` : '';
  if (user.role === 'ADMINISTRATOR') {
    return deptId ? { sql: `${p}department_id = ?`, params: [deptId] } : { sql: '', params: [] };
  }
  if (user.role === 'RESEARCHER') {
    if (deptId) return { sql: `${p}department_id = ?`, params: [deptId] };
    return { sql: '', params: [] };
  }
  if (user.role === 'INCUBATION_MANAGER' || user.role === 'IPR_OFFICER') {
    return deptId ? { sql: `${p}department_id = ?`, params: [deptId] } : { sql: '', params: [] };
  }
  return { sql: '', params: [] };
}

dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const deptId = req.query.departmentId ? Number(req.query.departmentId) : null;
    const days = Number(req.query.days) || 180;
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

    const scope = scopeClause(user, deptId);
    const scopeAnd = scope.sql ? ` AND ${scope.sql}` : '';
    const scopeParams = scope.params;

    // ---- KPI cards --------------------------------------------------------
    const proj = db.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status IN ('APPROVED','ACTIVE') THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status IN ('SUBMITTED','UNDER_REVIEW','RETURNED_FOR_CORRECTION') THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status = 'DRAFT' THEN 1 ELSE 0 END) AS drafts,
         SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected,
         SUM(CASE WHEN status IN ('ACTIVE','COMPLETED') AND submitted_at >= ? THEN 1 ELSE 0 END) AS recent_submissions,
         SUM(CASE WHEN status IN ('ACTIVE','COMPLETED') AND submitted_at >= date(?, '-30 days') THEN 1 ELSE 0 END) AS prior_submissions
       FROM research_projects p WHERE 1=1${scopeAnd}`,
    ).get(since, since, ...scopeParams) as any;

    const ipr = db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status IN ('UNDER_EVALUATION','APPROVED_FOR_FILING','FILED','UNDER_EXAMINATION') THEN 1 ELSE 0 END) AS under_review,
              SUM(CASE WHEN status = 'FILED' THEN 1 ELSE 0 END) AS filed,
              SUM(CASE WHEN status = 'GRANTED' THEN 1 ELSE 0 END) AS granted
         FROM ipr_records`,
    ).get() as any;

    const approvals = db.prepare(
      `SELECT COUNT(*) AS pending FROM approval_requests WHERE status IN ('PENDING','IN_REVIEW')`,
    ).get() as any;

    const startupScope = user.role === 'MENTOR'
      ? ' AND (s.founder_user_id = ? OR s.id IN (SELECT startup_id FROM mentor_assignments WHERE mentor_id = (SELECT id FROM mentors WHERE user_id = ?)))'
      : '';
    const startupParams = user.role === 'MENTOR' ? [user.id, user.id] : [];
    const startup = db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN s.stage IN ('APPLIED','UNDER_REVIEW') THEN 1 ELSE 0 END) AS under_review,
              SUM(CASE WHEN s.stage IN ('INCUBATION','SEED','GROWTH') THEN 1 ELSE 0 END) AS incubated,
              SUM(CASE WHEN s.status = 'ACTIVE' THEN 1 ELSE 0 END) AS active
         FROM startups s WHERE 1=1${startupScope}`,
    ).get(...startupParams) as any;

    const mentorships = db.prepare(
      `SELECT COUNT(*) AS c FROM mentor_assignments ma WHERE ma.status = 'ACTIVE'`,
    ).get() as any;

    const funding = db.prepare(
      `SELECT
         COALESCE(SUM(requested_amount), 0) AS requested,
         COALESCE(SUM(approved_amount), 0) AS approved,
         COALESCE(SUM(received_amount), 0) AS received,
         COUNT(*) AS records
       FROM funding_records`,
    ).get() as any;

    // ---- Charts -----------------------------------------------------------
    const projectsByStatus = db
      .prepare(
        `SELECT status AS name, COUNT(*) AS value FROM research_projects p
          WHERE 1=1${scopeAnd} GROUP BY status ORDER BY value DESC`,
      )
      .all(...scopeParams) as any[];

    const monthlySubmissions = db
      .prepare(
        `SELECT strftime('%Y-%m', COALESCE(submitted_at, created_at)) AS period,
                COUNT(*) AS submissions,
                SUM(CASE WHEN status IN ('APPROVED','ACTIVE','COMPLETED') THEN 1 ELSE 0 END) AS approved
           FROM research_projects p
          WHERE 1=1${scopeAnd}
            AND COALESCE(submitted_at, created_at) >= ?
          GROUP BY period ORDER BY period`,
      )
      .all(since, ...scopeParams) as any[];

    const projectsByDepartment = db
      .prepare(
        `SELECT d.name AS name, d.code AS code, COUNT(p.id) AS value
           FROM departments d
      LEFT JOIN research_projects p ON p.department_id = d.id
          GROUP BY d.id ORDER BY value DESC, d.name`,
      )
      .all() as any[];

    const iprByStatus = db
      .prepare(`SELECT status AS name, COUNT(*) AS value FROM ipr_records GROUP BY status ORDER BY value DESC`)
      .all() as any[];

    const iprByType = db
      .prepare(`SELECT ipr_type AS name, COUNT(*) AS value FROM ipr_records GROUP BY ipr_type ORDER BY value DESC`)
      .all() as any[];

    const startupByStage = db
      .prepare(
        `SELECT s.stage AS name, COUNT(*) AS value FROM startups s WHERE 1=1${startupScope} GROUP BY s.stage ORDER BY value DESC`,
      )
      .all(...startupParams) as any[];

    // ---- Recent research projects ----------------------------------------
    const recentProjects = db
      .prepare(
        `SELECT p.id, p.project_code, p.title, p.status, p.progress, p.submitted_at, p.created_at,
                u.full_name AS pi_name, d.name AS department_name
           FROM research_projects p
           JOIN users u ON u.id = p.principal_investigator_id
           JOIN departments d ON d.id = p.department_id
          WHERE 1=1${scopeAnd}
          ORDER BY COALESCE(p.submitted_at, p.created_at) DESC LIMIT 6`,
      )
      .all(...scopeParams) as any[];

    // ---- Pending approvals ------------------------------------------------
    const pendingApprovals = db
      .prepare(
        `SELECT a.id, a.request_code, a.subject_type, a.subject_id, a.request_type, a.current_stage,
                a.status, a.submitted_at, a.assigned_reviewer_id, u.full_name AS reviewer_name,
                ru.full_name AS submitted_by_name,
                CAST(julianday('now') - julianday(a.submitted_at) AS INTEGER) AS days_pending
           FROM approval_requests a
           JOIN users u ON u.id = a.submitted_by
      LEFT JOIN users ru ON ru.id = a.assigned_reviewer_id
          WHERE a.status IN ('PENDING','IN_REVIEW')
            AND (? = 'ADMINISTRATOR' OR a.assigned_reviewer_id = ?)
          ORDER BY a.submitted_at ASC LIMIT 6`,
      )
      .all(user.role === 'ADMINISTRATOR' ? 'ADMINISTRATOR' : '', user.id) as any[];

    // ---- Upcoming deadlines ----------------------------------------------
    const deadlines = [
      ...(db
        .prepare(
          `SELECT i.id AS record_id, 'IPR' AS record_type, i.ipr_code AS code, i.title, i.next_deadline AS deadline,
                  i.status, 'ipr' AS target
             FROM ipr_records i
            WHERE i.next_deadline IS NOT NULL AND i.status NOT IN ('GRANTED','CLOSED','REJECTED')
              AND date(i.next_deadline) >= date('now','-30 day')`,
        )
        .all() as any[]),
      ...(db
        .prepare(
          `SELECT m.id AS record_id, 'MILESTONE' AS record_type, p.project_code AS code, m.title,
                  m.due_date AS deadline, m.status, 'project' AS target
             FROM project_milestones m JOIN research_projects p ON p.id = m.project_id
            WHERE m.due_date IS NOT NULL AND m.status <> 'COMPLETED'
              AND date(m.due_date) >= date('now','-30 day')`,
        )
        .all() as any[]),
      ...(db
        .prepare(
          `SELECT f.id AS record_id, 'FUNDING' AS record_type, f.code, f.title, f.closes_on AS deadline,
                  f.status, 'funding' AS target
             FROM funding_opportunities f
            WHERE f.closes_on IS NOT NULL AND f.status = 'OPEN'
              AND date(f.closes_on) >= date('now','-30 day')`,
        )
        .all() as any[]),
    ]
      .map((d) => ({ ...d, days_remaining: daysUntil(d.deadline) }))
      .sort((a, b) => a.days_remaining - b.days_remaining)
      .slice(0, 7);

    // ---- Activity feed ----------------------------------------------------
    const activity = db
      .prepare(
        `SELECT a.id, a.entity_type, a.entity_id, a.entity_code, a.action, a.from_status, a.to_status,
                a.details, a.created_at, u.full_name AS actor_name
           FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
          ORDER BY a.created_at DESC, a.id DESC LIMIT 12`,
      )
      .all() as any[];

    res.json({
      kpis: {
        totalProjects: proj.total ?? 0,
        activeProjects: proj.active ?? 0,
        pendingApprovals: approvals.pending ?? 0,
        iprRecords: ipr.total ?? 0,
        activeStartups: (startup.incubated ?? 0) + (startup.active ?? 0),
        totalFunding: funding.approved ?? 0,
        fundingRequested: funding.requested ?? 0,
        fundingReceived: funding.received ?? 0,
        fundingRecords: funding.records ?? 0,
        completedProjects: proj.completed ?? 0,
        draftProjects: proj.drafts ?? 0,
        rejectedProjects: proj.rejected ?? 0,
        iprUnderReview: ipr.under_review ?? 0,
        iprFiled: ipr.filed ?? 0,
        iprGranted: ipr.granted ?? 0,
        startupsTotal: startup.total ?? 0,
        startupsUnderReview: startup.under_review ?? 0,
        startupsIncubated: startup.incubated ?? 0,
        activeMentorships: mentorships.c ?? 0,
        recentSubmissions: proj.recent_submissions ?? 0,
        priorSubmissions: proj.prior_submissions ?? 0,
      },
      charts: {
        projectsByStatus,
        monthlySubmissions,
        projectsByDepartment,
        iprByStatus,
        iprByType,
        startupByStage,
      },
      recentProjects,
      pendingApprovals,
      deadlines,
      activity,
      meta: { days, since, departmentId: deptId, generatedAt: new Date().toISOString() },
    });
  }),
);
