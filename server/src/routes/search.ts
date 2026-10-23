import { Router } from 'express';
import { db } from '../db/connection.js';
import { asyncHandler, likeParam } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';

export const searchRouter = Router();
searchRouter.use(requireAuth);

/**
 * Global search across projects, IPR records, startups, documents and
 * funding opportunities. Returns a grouped, type-tagged result set.
 */
searchRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const term = String(req.query.q ?? '').trim();
    if (term.length < 2) {
      res.json({ query: term, groups: [], total: 0 });
      return;
    }
    const t = likeParam(term);
    const limit = 5;

    const projects = db
      .prepare(
        `SELECT p.id, p.project_code AS code, p.title, p.status, d.name AS subtitle
           FROM research_projects p JOIN departments d ON d.id = p.department_id
          WHERE lower(p.title) LIKE ? OR lower(p.project_code) LIKE ?
          ORDER BY COALESCE(p.submitted_at, p.created_at) DESC LIMIT ?`,
      )
      .all(t, t, limit) as any[];

    const ipr = db
      .prepare(
        `SELECT i.id, i.ipr_code AS code, i.title, i.status, i.ipr_type AS subtitle
           FROM ipr_records i
          WHERE lower(i.title) LIKE ? OR lower(i.ipr_code) LIKE ?
          ORDER BY i.created_at DESC LIMIT ?`,
      )
      .all(t, t, limit) as any[];

    const startups = db
      .prepare(
        `SELECT s.id, s.startup_code AS code, s.name AS title, s.stage AS status, s.industry AS subtitle
           FROM startups s
          WHERE lower(s.name) LIKE ? OR lower(s.startup_code) LIKE ?
          ORDER BY s.created_at DESC LIMIT ?`,
      )
      .all(t, t, limit) as any[];

    const documents = db
      .prepare(
        `SELECT d.id, d.name AS title, d.category AS subtitle, d.file_type AS code
           FROM documents d WHERE lower(d.name) LIKE ? ORDER BY d.upload_date DESC LIMIT ?`,
      )
      .all(t, limit) as any[];

    const funding = db
      .prepare(
        `SELECT f.id, f.code, f.title, f.status, f.organization AS subtitle
           FROM funding_opportunities f
          WHERE lower(f.title) LIKE ? OR lower(f.organization) LIKE ? OR lower(f.code) LIKE ?
          ORDER BY f.closes_on ASC LIMIT ?`,
      )
      .all(t, t, t, limit) as any[];

    const approvals = db
      .prepare(
        `SELECT a.id, a.request_code AS code, a.request_type AS title, a.status, a.subject_type AS subtitle
           FROM approval_requests a
          WHERE lower(a.request_code) LIKE ? OR lower(a.request_type) LIKE ?
          ORDER BY a.created_at DESC LIMIT ?`,
      )
      .all(t, t, limit) as any[];

    const groups = [
      { key: 'projects', label: 'Research Projects', items: projects, link: '/projects' },
      { key: 'ipr', label: 'IPR Records', items: ipr, link: '/ipr' },
      { key: 'startups', label: 'Startups', items: startups, link: '/startups' },
      { key: 'approvals', label: 'Approvals', items: approvals, link: '/approvals' },
      { key: 'funding', label: 'Funding', items: funding, link: '/funding' },
      { key: 'documents', label: 'Documents', items: documents, link: '/documents' },
    ].filter((g) => g.items.length > 0);

    res.json({
      query: term,
      groups,
      total: groups.reduce((s, g) => s + g.items.length, 0),
    });
  }),
);
