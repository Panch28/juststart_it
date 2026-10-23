-- =============================================================================
-- Research, Innovation, IPR and Startup Management System
-- Schema (SQLite dialect). Written in portable SQL so it can be ported to
-- PostgreSQL by swapping AUTOINCREMENT for BIGSERIAL/IDENTITY.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- departments
CREATE TABLE IF NOT EXISTS departments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL UNIQUE,
  hod_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------- users
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN (
                  'ADMINISTRATOR','RESEARCHER','IPR_OFFICER',
                  'APPROVAL_MEMBER','INCUBATION_MANAGER','MENTOR')),
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  designation   TEXT,
  phone         TEXT,
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED')),
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_dept  ON users(department_id);

-- ------------------------------------------------------------------- sessions
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ----------------------------------------------------------- research projects
CREATE TABLE IF NOT EXISTS research_projects (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  project_code            TEXT NOT NULL UNIQUE,
  title                   TEXT NOT NULL,
  description             TEXT,
  domain                  TEXT NOT NULL,
  category                TEXT NOT NULL,
  department_id           INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  principal_investigator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  start_date              TEXT,
  expected_completion_date TEXT,
  funding_required        REAL NOT NULL DEFAULT 0,
  objectives              TEXT,
  expected_outcomes       TEXT,
  status                  TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
                            'DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED',
                            'RETURNED_FOR_CORRECTION','ACTIVE','COMPLETED','ON_HOLD')),
  progress                INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  submitted_at            TEXT,
  approved_at             TEXT,
  completed_at            TEXT,
  created_by              INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_dept    ON research_projects(department_id);
CREATE INDEX IF NOT EXISTS idx_projects_status  ON research_projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_pi      ON research_projects(principal_investigator_id);

CREATE TABLE IF NOT EXISTS research_team_members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  email         TEXT,
  member_role   TEXT NOT NULL DEFAULT 'CO_INVESTIGATOR',
  contribution  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rtm_project ON research_team_members(project_id);

CREATE TABLE IF NOT EXISTS project_milestones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  due_date    TEXT,
  status      TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','OVERDUE','BLOCKED')),
  progress    INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pm_project ON project_milestones(project_id);

-- --------------------------------------------------------------- ipr records
CREATE TABLE IF NOT EXISTS ipr_records (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ipr_code          TEXT NOT NULL UNIQUE,
  project_id        INTEGER REFERENCES research_projects(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  ipr_type          TEXT NOT NULL CHECK (ipr_type IN ('PATENT','COPYRIGHT','TRADEMARK','OTHER')),
  description       TEXT,
  disclosure_date   TEXT,
  filing_date       TEXT,
  next_deadline     TEXT,
  status            TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
                      'DRAFT','UNDER_EVALUATION','APPROVED_FOR_FILING','FILED',
                      'UNDER_EXAMINATION','GRANTED','REJECTED','CLOSED')),
  ipr_officer_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes             TEXT,
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ipr_project ON ipr_records(project_id);
CREATE INDEX IF NOT EXISTS idx_ipr_status  ON ipr_records(status);
CREATE INDEX IF NOT EXISTS idx_ipr_deadline ON ipr_records(next_deadline);

CREATE TABLE IF NOT EXISTS ipr_inventors (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ipr_id       INTEGER NOT NULL REFERENCES ipr_records(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  email        TEXT,
  creator_order INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_inventors_ipr ON ipr_inventors(ipr_id);

-- ---------------------------------------------------------- approval requests
CREATE TABLE IF NOT EXISTS approval_requests (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  request_code         TEXT NOT NULL UNIQUE,
  subject_type         TEXT NOT NULL CHECK (subject_type IN ('PROJECT','IPR','STARTUP')),
  subject_id           INTEGER NOT NULL,
  request_type         TEXT NOT NULL,
  description          TEXT,
  submitted_by         INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  current_stage        TEXT NOT NULL,
  stages               TEXT NOT NULL DEFAULT '[]',
  status               TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
                         'PENDING','IN_REVIEW','APPROVED','REJECTED','RETURNED_FOR_CORRECTION','CANCELLED')),
  priority             TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','CRITICAL')),
  due_at               TEXT,
  submitted_at         TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at           TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_appr_subject   ON approval_requests(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_appr_reviewer  ON approval_requests(assigned_reviewer_id);
CREATE INDEX IF NOT EXISTS idx_appr_status    ON approval_requests(status);

CREATE TABLE IF NOT EXISTS approval_decisions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  INTEGER NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  stage       TEXT NOT NULL,
  decision    TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED','CHANGES_REQUESTED','COMMENT','RESUBMITTED')),
  comment     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_decisions_request ON approval_decisions(request_id);

-- ------------------------------------------------------------------ startups
CREATE TABLE IF NOT EXISTS startups (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  startup_code        TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL UNIQUE,
  founder_user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  related_project_id  INTEGER REFERENCES research_projects(id) ON DELETE SET NULL,
  industry            TEXT NOT NULL,
  stage               TEXT NOT NULL DEFAULT 'APPLIED' CHECK (stage IN (
                        'APPLIED','UNDER_REVIEW','INCUBATION','SEED','GROWTH','GRADUATED','REJECTED')),
  description         TEXT,
  problem             TEXT,
  solution            TEXT,
  support_required    TEXT,
  application_date    TEXT,
  status              TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','ON_HOLD','GRADUATED','REJECTED')),
  progress            INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_startup_project ON startups(related_project_id);
CREATE INDEX IF NOT EXISTS idx_startup_stage  ON startups(stage);

CREATE TABLE IF NOT EXISTS startup_team_members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  startup_id  INTEGER NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  email       TEXT,
  member_role TEXT NOT NULL DEFAULT 'MEMBER',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stm_startup ON startup_team_members(startup_id);

CREATE TABLE IF NOT EXISTS mentors (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  expertise     TEXT,
  industries    TEXT,
  bio           TEXT,
  max_startups  INTEGER NOT NULL DEFAULT 3,
  status        TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mentor_assignments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  mentor_id      INTEGER NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
  startup_id     INTEGER NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  assigned_at    TEXT NOT NULL DEFAULT (datetime('now')),
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','REVOKED')),
  next_meeting_at TEXT,
  UNIQUE (mentor_id, startup_id)
);
CREATE INDEX IF NOT EXISTS idx_ma_startup ON mentor_assignments(startup_id);

CREATE TABLE IF NOT EXISTS mentor_meetings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id   INTEGER NOT NULL REFERENCES mentor_assignments(id) ON DELETE CASCADE,
  mentor_id       INTEGER NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
  startup_id      INTEGER NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  meeting_date    TEXT NOT NULL,
  agenda          TEXT,
  notes           TEXT,
  follow_up_action TEXT,
  follow_up_status TEXT NOT NULL DEFAULT 'OPEN' CHECK (follow_up_status IN ('OPEN','IN_PROGRESS','DONE')),
  follow_up_due   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mm_startup ON mentor_meetings(startup_id);

CREATE TABLE IF NOT EXISTS startup_milestones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  startup_id  INTEGER NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  due_date    TEXT,
  status      TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','OVERDUE','BLOCKED')),
  progress    INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sm_startup ON startup_milestones(startup_id);

-- ------------------------------------------------------------------- funding
CREATE TABLE IF NOT EXISTS funding_opportunities (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  organization    TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('RESEARCH','STARTUP','BOTH')),
  domain          TEXT,
  amount_min      REAL,
  amount_max      REAL,
  eligibility     TEXT,
  description     TEXT,
  opens_on        TEXT,
  closes_on       TEXT,
  external_url    TEXT,
  status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('UPCOMING','OPEN','CLOSED')),
  internal_notes  TEXT,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fo_status ON funding_opportunities(status);

CREATE TABLE IF NOT EXISTS funding_applications (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id   INTEGER NOT NULL REFERENCES funding_opportunities(id) ON DELETE CASCADE,
  subject_type     TEXT NOT NULL CHECK (subject_type IN ('PROJECT','STARTUP')),
  subject_id       INTEGER NOT NULL,
  requested_amount REAL NOT NULL DEFAULT 0,
  application_date TEXT,
  status           TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
                     'REQUESTED','SUBMITTED','APPROVED','REJECTED','WITHDRAWN')),
  approved_amount  REAL,
  decision_date    TEXT,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fa_opportunity ON funding_applications(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_fa_subject     ON funding_applications(subject_type, subject_id);

CREATE TABLE IF NOT EXISTS funding_records (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type     TEXT NOT NULL CHECK (subject_type IN ('PROJECT','STARTUP')),
  subject_id       INTEGER NOT NULL,
  source           TEXT NOT NULL,
  opportunity_id   INTEGER REFERENCES funding_opportunities(id) ON DELETE SET NULL,
  requested_amount REAL NOT NULL DEFAULT 0,
  approved_amount  REAL NOT NULL DEFAULT 0,
  received_amount  REAL NOT NULL DEFAULT 0,
  application_date TEXT,
  decision_date    TEXT,
  status           TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
                     'REQUESTED','APPROVED','REJECTED','PARTIALLY_RECEIVED','RECEIVED')),
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fr_subject ON funding_records(subject_type, subject_id);

-- ------------------------------------------------------------------ documents
CREATE TABLE IF NOT EXISTS documents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL CHECK (category IN (
                  'RESEARCH_PROPOSAL','RESEARCH_REPORT','IPR_DOCUMENT','APPROVAL_LETTER',
                  'FUNDING_DOCUMENT','STARTUP_DOCUMENT','PUBLICATION','OTHER')),
  related_type  TEXT CHECK (related_type IN ('PROJECT','IPR','STARTUP','APPROVAL','FUNDING')),
  related_id    INTEGER,
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  upload_date   TEXT NOT NULL DEFAULT (datetime('now')),
  file_type     TEXT NOT NULL,
  file_size     INTEGER NOT NULL DEFAULT 0,
  storage_path  TEXT NOT NULL,
  checksum      TEXT,
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED','UNDER_REVIEW','REJECTED')),
  version       INTEGER NOT NULL DEFAULT 1,
  supersedes_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_doc_related ON documents(related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_doc_category ON documents(category);

-- -------------------------------------------------------------- notifications
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN (
                'DEADLINE','OVERDUE','NEW_APPROVAL','APPROVAL_DECISION',
                'RETURNED_FOR_CORRECTION','PROJECT_MILESTONE','STARTUP_MILESTONE',
                'FUNDING_DEADLINE','SYSTEM')),
  title       TEXT NOT NULL,
  description TEXT,
  link        TEXT,
  is_read     INTEGER NOT NULL DEFAULT 0,
  dedupe_key  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_dedupe ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- ----------------------------------------------------------------- audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id   INTEGER,
  entity_code TEXT,
  action      TEXT NOT NULL,
  actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status   TEXT,
  details     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_date   ON audit_logs(created_at);

-- ------------------------------------------------------------------- settings
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
