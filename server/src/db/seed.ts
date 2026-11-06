/**
 * Seeds the database using the deterministic generator.
 */
import { db, applySchema, DB_PATH, nowIso } from './connection.js';
import { hashPassword } from '../lib/crypto.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const RESET = process.argv.includes('--reset');
const DEMO_PASSWORD = 'demo1234';

function dropAllTables(): void {
  db.exec('PRAGMA foreign_keys = OFF;');
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as any[];
  for (const t of tables) {
    db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
  }
  db.exec('PRAGMA foreign_keys = ON;');
  console.log(`Dropped ${tables.length} existing table(s) from ${DB_PATH}`);
}

if (RESET) dropAllTables();
applySchema();

const already = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as any).c as number;
if (already > 0 && !RESET) {
  console.log(`Database already contains ${already} users. Use "npm run reset-db" to rebuild from scratch.`);
  process.exit(0);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..', '..');
const generatorPath = join(projectRoot, 'generate-seed.mjs');

if (existsSync(generatorPath)) {
  console.log('Running generate-seed.mjs...');
  const result = spawnSync('node', [generatorPath, projectRoot], { cwd: projectRoot, stdio: 'inherit' });
  if (result.status !== 0) process.exit(1);
} else {
  console.error('generate-seed.mjs not found at', generatorPath);
  process.exit(1);
}

const seedData = JSON.parse(readFileSync(join(projectRoot, 'seed-data.json'), 'utf-8'));
const PASSWORD = hashPassword(DEMO_PASSWORD);

function mapRole(role: string) {
  if (!role) return 'RESEARCHER';
  const r = role.toUpperCase();
  if (r.includes('ADMIN')) return 'ADMINISTRATOR';
  if (r.includes('IPR')) return 'IPR_OFFICER';
  if (r.includes('APPROVAL') || r.includes('COMMITTEE')) return 'APPROVAL_MEMBER';
  if (r.includes('INCUBATION')) return 'INCUBATION_MANAGER';
  if (r.includes('MENTOR')) return 'MENTOR';
  return 'RESEARCHER';
}
function mapProjectStatus(s: string) {
  if (s === 'Completed') return 'COMPLETED';
  if (s === 'Active') return 'ACTIVE';
  if (s === 'Approved') return 'APPROVED';
  if (s === 'Under Review') return 'UNDER_REVIEW';
  if (s === 'Submitted') return 'SUBMITTED';
  if (s === 'Rejected') return 'REJECTED';
  if (s === 'Returned') return 'RETURNED_FOR_CORRECTION';
  return 'DRAFT';
}
function mapApprovalStatus(s: string) {
  if (s === 'Pending') return 'PENDING';
  if (s === 'Approved') return 'APPROVED';
  if (s === 'Rejected') return 'REJECTED';
  if (s === 'Returned') return 'RETURNED_FOR_CORRECTION';
  return 'PENDING';
}
function mapIprStatus(s: string) {
  if (s === 'Approved for Filing') return 'APPROVED_FOR_FILING';
  if (s === 'Under Examination') return 'UNDER_EXAMINATION';
  if (s === 'Under Evaluation') return 'UNDER_EVALUATION';
  if (s === 'Filed') return 'FILED';
  if (s === 'Draft') return 'DRAFT';
  if (s === 'Granted') return 'GRANTED';
  if (s === 'Rejected') return 'REJECTED';
  if (s === 'Closed') return 'CLOSED';
  return s.toUpperCase().replace(/ /g, '_');
}
function mapStartupStage(s: string) {
  if (s === 'Under Review') return 'UNDER_REVIEW';
  if (s === 'Applied') return 'APPLIED';
  if (s === 'Incubation') return 'INCUBATION';
  if (s === 'Seed') return 'SEED';
  if (s === 'Growth') return 'GROWTH';
  if (s === 'Graduated') return 'GRADUATED';
  return 'APPLIED';
}
function mapFundingStatus(s: string) {
  if (s === 'Received') return 'RECEIVED';
  if (s === 'Approved') return 'APPROVED';
  if (s === 'Rejected') return 'REJECTED';
  if (s === 'Applied') return 'REQUESTED';
  return 'REQUESTED';
}

db.exec('BEGIN TRANSACTION');
try {
  for (const d of seedData.departments) {
    db.prepare('INSERT INTO departments (id, code, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(d.id, d.code, d.name, d.domain || '', nowIso(), nowIso());
  }
  for (const u of seedData.users) {
    const deptId = u.department ? seedData.departments.find((d: any) => d.code === u.department)?.id || null : null;
    db.prepare('INSERT INTO users (id, full_name, email, password_hash, role, department_id, designation, phone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(u.id, u.full_name, u.email, PASSWORD, mapRole(u.role), deptId, u.display_name || u.full_name || '', '', u.is_active ? 'ACTIVE' : 'INACTIVE', u.created_at || nowIso(), u.created_at || nowIso());
  }
  // Research team members need to be handled if projects have team
  for (const p of seedData.projects) {
    const deptId = seedData.departments.find((d: any) => d.code === p.department)?.id || 1;
    const status = mapProjectStatus(p.status);
    db.prepare('INSERT INTO research_projects (id, project_code, title, description, domain, category, department_id, principal_investigator_id, start_date, expected_completion_date, funding_required, objectives, expected_outcomes, status, progress, submitted_at, approved_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(p.id, p.code, p.title, p.abstract || p.description || '', p.domain || p.keywords?.[0] || 'General', 'RESEARCH', deptId, p.lead_researcher_id, p.start_date || null, p.end_date || null, p.budget_inr || p.funding_requested || 0, '', '', status, status === 'COMPLETED' ? 100 : status === 'ACTIVE' ? 60 : 0, p.submitted_at || null, null, p.lead_researcher_id, p.created_at || nowIso(), p.created_at || nowIso());
    if (p.team) {
      for (const m of p.team) {
        const u = seedData.users.find((x: any) => x.id === m.user_id);
        db.prepare('INSERT INTO research_team_members (project_id, user_id, name, email, member_role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(p.id, m.user_id, u?.full_name || '', u?.email || '', m.role === 'Co-investigator' ? 'CO_INVESTIGATOR' : 'MEMBER', p.created_at || nowIso());
      }
    }
  }
  function mapIprType(t: string) {
    if (!t) return 'OTHER';
    const u = t.toUpperCase();
    if (u === 'PATENT') return 'PATENT';
    if (u === 'COPYRIGHT') return 'COPYRIGHT';
    if (u === 'TRADEMARK') return 'TRADEMARK';
    return 'OTHER';
  }
  for (const r of seedData.ipr_records) {
    db.prepare('INSERT INTO ipr_records (id, ipr_code, project_id, title, ipr_type, description, disclosure_date, filing_date, next_deadline, status, ipr_officer_id, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(r.id, r.code, r.project_id, r.title, mapIprType(r.type), r.description || '', r.created_at?.split('T')[0] || null, r.filing_date || null, r.next_deadline || null, mapIprStatus(r.status), r.assigned_officer_id || null, r.deadline_type || '', r.assigned_officer_id || null, r.created_at || nowIso(), r.created_at || nowIso());
  }
  for (const a of seedData.approvals) {
    const subjType = a.subject_type === 'PROJECT' ? 'PROJECT' : a.subject_type === 'IPR' ? 'IPR' : 'STARTUP';
    const status = mapApprovalStatus(a.status);
    const stages = JSON.stringify(a.stages || []);
    const currentStage = a.current_stage_name || (status === 'PENDING' && a.stages ? a.stages[a.current_stage ?? 0] : '') || '';
    db.prepare('INSERT INTO approval_requests (id, request_code, subject_type, subject_id, request_type, description, submitted_by, assigned_reviewer_id, current_stage, stages, status, priority, due_at, submitted_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(a.id, a.code, subjType, a.subject_id, a.subject_type === 'PROJECT' ? 'Research Project Approval' : a.subject_type === 'IPR' ? 'IPR Filing Authorisation' : 'Startup Incubation Application', a.subject_title || '', a.submitted_by, a.current_reviewer_id || null, currentStage, stages, status, 'NORMAL', null, a.submitted_at, a.final_decided_at || null);
    if (a.decisions) {
      for (const dec of a.decisions) {
        const decision = dec.decision === 'Approved' ? 'APPROVED' : dec.decision === 'Rejected' ? 'REJECTED' : dec.decision === 'Returned' ? 'CHANGES_REQUESTED' : 'COMMENT';
        db.prepare('INSERT INTO approval_decisions (request_id, reviewer_id, stage, decision, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(a.id, dec.reviewer_id, dec.stage, decision, dec.comment || '', dec.decided_at);
      }
    }
  }
  for (const s of seedData.startups) {
    const stage = mapStartupStage(s.stage);
    db.prepare('INSERT INTO startups (id, startup_code, name, founder_user_id, related_project_id, industry, stage, description, problem, solution, support_required, application_date, status, progress, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(s.id, s.code, s.name, s.founder_id, s.project_id || null, s.sector || '', stage, s.description || '', '', '', '', s.applied_at?.split('T')[0] || null, stage === 'GRADUATED' ? 'GRADUATED' : 'ACTIVE', 0, s.founder_id, s.applied_at, s.applied_at);
    if (s.milestones) {
      for (const m of s.milestones) {
        db.prepare('INSERT INTO startup_milestones (startup_id, title, description, due_date, status, progress, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(s.id, m.title, '', m.completed_at || null, m.status === 'Completed' ? 'COMPLETED' : 'PENDING', m.status === 'Completed' ? 100 : 0, '', nowIso(), nowIso());
      }
    }
  }
  if (seedData.funding_opportunities) {
    for (const fo of seedData.funding_opportunities) {
      db.prepare('INSERT INTO funding_opportunities (id, code, title, organization, category, domain, amount_min, amount_max, eligibility, description, opens_on, closes_on, external_url, status, internal_notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(fo.id, `FO-${400 + fo.id}`, fo.title, fo.agency || '', 'BOTH', null, null, null, fo.audience || '', fo.description || fo.title, null, null, fo.source_url || '', 'OPEN', fo.amount_note || '', 1, nowIso(), nowIso());
    }
  }
  if (seedData.funding_records) {
    for (const fr of seedData.funding_records) {
      const stype = fr.entity_type === 'project' ? 'PROJECT' : 'STARTUP';
      db.prepare('INSERT INTO funding_records (id, subject_type, subject_id, source, opportunity_id, requested_amount, approved_amount, received_amount, application_date, decision_date, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(fr.id, stype, fr.entity_id, seedData.funding_opportunities?.find((o: any) => o.id === fr.opportunity_id)?.title || '', fr.opportunity_id || null, fr.requested_amount || 0, fr.approved_amount || 0, fr.received_amount || 0, fr.applied_at || null, fr.approved_at || null, mapFundingStatus(fr.status), fr.remarks || '', nowIso());
    }
  }
  console.log('All seed data loaded from generator');
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('Error seeding:', e);
  process.exit(1);
}
console.log('Seed completed successfully');
