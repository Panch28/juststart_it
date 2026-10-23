# Research, Innovation, IPR and Startup Management System

A full management dashboard for a university's research, innovation, intellectual-property
and startup-incubation functions. It is a working application — not a landing page — with a
real backend, a real database, role-based access control and connected workflows across
eleven modules.

> **Demo environment.** All data is fictional sample data for "Northgate University".
> Authentication is a seeded demo account system and is **not production-secure**.
> The IPR module tracks administrative workflow state and deadlines only — it never
> makes a legal determination of patentability or filing eligibility.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Technology](#technology)
3. [Prerequisites](#prerequisites)
4. [Installation](#installation)
5. [Running the app](#running-the-app)
6. [Environment variables](#environment-variables)
7. [Database](#database)
8. [Demo accounts](#demo-accounts)
9. [Roles and permissions](#roles-and-permissions)
10. [Module reference](#module-reference)
11. [API reference](#api-reference)
12. [Project layout](#project-layout)
13. [What is implemented](#what-is-implemented)
14. [What is not implemented](#what-is-not-implemented)
15. [Deployment](#deployment)
16. [Troubleshooting](#troubleshooting)

---

## What it does

The system manages the full lifecycle of university research and commercialisation:

- **Research projects** — register projects, attach a team, track milestones and progress,
  and move records through an explicit approval workflow.
- **IPR management** — disclose inventions, track administrative filing deadlines, assign
  IPR officers and record the office's workflow state.
- **Approvals** — a staged, multi-level review pipeline (departmental scrutiny → ethics →
  funding → final approval) with a permanent, traceable decision history.
- **Startup incubation** — register ventures, track incubation stages, allocate mentors,
  record mentoring meetings and follow-ups.
- **Funding** — an internal catalogue of opportunities plus per-record tracking of
  *requested*, *approved* and *received* amounts as three separate values.
- **Documents** — real uploads to disk with type/size validation, versioning and
  role-restricted access.
- **Analytics & reports** — department output, completion rate, approval processing time,
  incubation progress, funding by source and CSV export.
- **Notifications** — in-app notifications plus deadline reminders.
- **User management** — accounts, roles, departments and status.
- **Settings** — system configuration, workflow matrix, personal preferences.

Workflows branch deliberately: a project does **not** have to become an IPR record or a
startup. Each branch is an explicit, separately-recorded decision.

---

## Technology

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React 18 + TypeScript + Vite | Fast dev server, typed modules |
| Styling | Tailwind CSS v3 | Consistent design tokens, small CSS output |
| Charts | Recharts | React-native charting for the dashboard/analytics |
| Icons | lucide-react | One consistent icon set |
| Routing | React Router v6 | Nested layouts and route-level gating |
| Backend | Express 4 + TypeScript | Small, explicit, well understood |
| Database | SQLite via Node's built-in `node:sqlite` | Zero native build steps, real relational DB |
| Validation | Zod | Schema validation with per-field error details |
| Uploads | multer 2.x | Multipart handling with extension/size limits |
| Auth | scrypt password hashing + HMAC-signed session tokens | No external auth service needed |

The repository is an **npm workspaces monorepo** (`server/` + `web/`).

---

## Prerequisites

- **Node.js ≥ 22.5.0** — `node:sqlite` (`DatabaseSync`) is required.
  Verify with `node -v`. (Node 24.x is what this was built and tested on.)
- **npm ≥ 10** — comes with Node.
- No database server, Docker, Java or native compilation required.

---

## Installation

```bash
npm install
```

That installs both workspaces and the root tooling (`concurrently`).

---

## Running the app

### Development (two processes)

```bash
npm run dev
```

This starts both servers concurrently:

| Process | URL | Notes |
| --- | --- | --- |
| API | http://localhost:4000/api | Express + SQLite, health at `/api/health` |
| Web  | http://localhost:5173     | Vite dev server, proxies `/api` → `:4000` |

Open **http://localhost:5173** and sign in with a demo account.

Individual workspaces:

```bash
npm run dev:api    # API only (tsx watch, restarts on change)
npm run dev:web    # frontend only
```

### Production-style build

```bash
npm run build      # builds dist/
npm start          # API serves dist/ statically on http://localhost:4000
```

When `dist/` exists the API serves the single-page app (with history fallback), so
the whole system runs from **http://localhost:4000**.

### Other scripts

```bash
npm run seed        # seed the database (idempotent — skips if already seeded)
npm run reset-db    # DROP every table, re-apply schema, re-seed from scratch
npm run typecheck   # tsc --noEmit for both workspaces
```

---

## Environment variables

Copy `.env.example` to `.env` and export the values before starting (the server reads
plain `process.env`).

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Port the Express API listens on |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Dev-server origin allowed by CORS |
| `SESSION_SECRET` | `rih-dev-session-secret-change-me` | HMAC key used to sign session tokens. **Change this for any real deployment.** |
| `DB_PATH` | `<repo>/server/data/rih.sqlite` | SQLite database file |
| `DATA_DIR` | `<repo>/server/data` | Directory for the database file |
| `UPLOAD_DIR` | `<repo>/server/uploads` | Directory where uploaded documents are stored |

No secrets are committed to the repository. `.env`, `server/data/` and `server/uploads/`
are git-ignored.

---

## Database

The schema lives in [`server/src/db/schema.sql`](server/src/db/schema.sql) — 23 tables
covering departments, users, sessions, projects, milestones, IPR, inventors, approvals,
decisions, startups, mentors, meetings, funding, documents, notifications, settings and
the audit log.

```bash
npm run reset-db    # rebuild schema + seed data
```

The database is created and migrated automatically on server start (`applySchema()` runs
on boot and every statement is `IF NOT EXISTS`, so it is safe to re-run).

**Seeded contents** (all fictional):

| Table | Rows |
| --- | --- |
| Departments | 7 |
| Users | 23 |
| Research projects | 14 |
| Project milestones | 18 |
| IPR records | 10 (14 inventor rows) |
| Approval requests | 12 |
| Startups | 6 |
| Mentors | 4 (5 assignments, 5 meetings) |
| Funding opportunities | 8 |
| Funding records | 9 |
| Documents | 23 |
| Audit log entries | 74 |
| Notifications | 66 |

Dashboard figures are computed live from these rows, so the numbers always agree with
the underlying records.

---

## Demo accounts

**Every account uses the password `demo1234`.** The login screen lists them and can
pre-fill the form for you.

| Email | Name | Role | Department |
| --- | --- | --- | --- |
| `admin@northgate.edu` | Dr. Harini Raghavan | Administrator | — |
| `vikram.shah@northgate.edu` | Dr. Vikram Shah | Researcher | Biotechnology |
| `elena.marsh@northgate.edu` | Dr. Elena Marsh | Researcher | Biotechnology |
| `samuel.okafor@northgate.edu` | Dr. Samuel Okafor | Researcher | Environmental Science |
| `priya.nandakumar@northgate.edu` | Dr. Priya Nandakumar | Researcher | Computer Science & AI |
| `thomas.lindqvist@northgate.edu` | Dr. Thomas Lindqvist | Researcher | Computer Science & AI |
| `amara.bello@northgate.edu` | Dr. Amara Bello | Researcher | Materials Science |
| `rahul.mehta@northgate.edu` | Dr. Rahul Mehta | Researcher | Renewable Energy |
| `sofia.alvarez@northgate.edu` | Dr. Sofia Alvarez | Researcher | Health Sciences |
| `nadia.karim@northgate.edu` | Dr. Nadia Karim | Researcher | Agricultural Technology |
| `julian.hart@northgate.edu` | Dr. Julian Hart | Researcher | Environmental Science |
| `mei.chen@northgate.edu` | Dr. Mei Chen | Researcher | Computer Science & AI |
| `farah.siddiqui@northgate.edu` | Dr. Farah Siddiqui | IPR Officer | — |
| `ravi.deshmukh@northgate.edu` | Ravi Deshmukh | IPR Officer | — |
| `owen.whitfield@northgate.edu` | Dr. Owen Whitfield | Approval Committee Member | — |
| `lena.fischer@northgate.edu` | Dr. Lena Fischer | Approval Committee Member | — |
| `daniel.okoye@northgate.edu` | Prof. Daniel Okoye | Approval Committee Member | — |
| `priya.venkatesan@northgate.edu` | Priya Venkatesan | Incubation Manager | — |
| `arjun.kapoor@northgate.edu` | Arjun Kapoor | Incubation Manager | — |
| `isabel.moreno@northgate.edu` | Dr. Isabel Moreno | Mentor | Biotechnology |
| `kenji.watanabe@northgate.edu` | Dr. Kenji Watanabe | Mentor | Computer Science & AI |
| `yusuf.demir@northgate.edu` | Dr. Yusuf Demir | Mentor | Renewable Energy |
| `clara.nowak@northgate.edu` | Dr. Clara Nowak | Mentor | Materials Science |

> The demo login is deliberately obvious: the API exposes `GET /api/auth/demo-accounts`
> with the notice *"Demo mode: credentials are sample accounts seeded for evaluation.
> Not production authentication."* It is intended for evaluation only.

---

## Roles and permissions

The permission matrix lives in [`server/src/lib/permissions.ts`](server/src/lib/permissions.ts).
It is enforced **server-side** on every guarded route — the frontend only hides controls
as a convenience. Calling a restricted endpoint directly returns `403`.

| Role | Effective access |
| --- | --- |
| Administrator | Everything — all modules, user management, settings, departments, workflow configuration, overrides on self-service rules |
| Researcher | Own/department projects, project creation, IPR disclosure, documents, funding applications, analytics, own profile |
| IPR Officer | IPR module (evaluation, assignment, deadlines), approvals where assigned, documents, analytics |
| Approval Committee Member | Approval review queue, decisions, documents, analytics |
| Incubation Manager | Startups, mentors, funding catalogue management, documents, analytics |
| Mentor | Assigned startups, mentoring sessions, mentor profile, documents |

Module visibility in the sidebar is derived from the same matrix (`NAV_BY_ROLE`), so a
user never sees a module they cannot use — and if they navigate to it directly, the route
renders a "restricted access" page.

---

## Module reference

### Dashboard
KPIs (projects, IPR, approvals, startups, funding requested/approved/received, completed),
submissions-vs-approvals trend, projects-by-status donut, projects-by-department bars, IPR
portfolio breakdown, recent projects, approvals awaiting decision, upcoming deadlines and a
live audit activity feed.

### Research Projects
List with search, status / department / category filters, "my projects" toggle, pagination
and per-row actions (view, edit, create IPR, register startup). Detail page has tabs for
overview, team, milestones, IPR & funding, approvals, documents and activity, plus a
status-change dialog that only offers transitions the server will accept.

### IPR Management
Records with type, status, linked project, officer and next-deadline tracking (with
overdue / urgent badges). Detail page shows the office's administrative-only notice,
inventors, documents, approvals and comments, and the audit trail. Creation is restricted
to projects that are approved, active or completed.

### Approvals
Staged review pipeline. Tabs for all requests, my pending tasks, approved, rejected and
returned. The detail page renders a stage tracker, the request summary, attached
documents and a decision panel; rejection and change-requests require a written comment,
and every decision is stored permanently.

### Startup Incubation
Ventures with stage (Applied → Under Review → Incubation → Seed → Growth → Graduated),
team, milestones, mentor assignments, mentoring meetings with follow-up tracking, funding
records and documents.

### Funding Opportunities
Catalogue of opportunities (clearly-labelled sample data — the platform never submits an
external application) plus a funding-records tab where **requested**, **approved** and
**received** are shown as three separate labelled amounts.

### Documents
Real multipart uploads to disk with extension allow-list, 10 MB size cap, category and
status metadata, optional link to a project / IPR record / startup / approval / funding
record, version history, real downloads, and permission-aware deletion.

### Analytics & Reports
Research output by department, completion rate, approval processing time (average and
median), pending and overdue approvals, IPR portfolio by status and type, startup
incubation progress, funding by source, submission trends, CSV export, and a TF-IDF +
cosine **similarity screening** panel that is explicitly a human-review aid.

### Notifications
Category filters, unread tracking, mark-as-read / mark-all-read, delete, and a
regenerate-deadline-reminders action.

### User Management
Accounts with roles, departments, designations, status and activity. The server refuses
to change your own role or deactivate your own account.

### Settings
Profile, password change, personal notification preferences, department CRUD and
administrator-only system configuration (reminder thresholds, categories, domains,
notification preferences, institution details, and an editable workflow transition matrix).

---

## API reference

All routes are under `/api` and require `Authorization: Bearer <token>` (the httpOnly
`rih_session` cookie is also accepted and is what authenticates file downloads).

| Method & path | Purpose |
| --- | --- |
| `POST /api/auth/login` | Sign in → `{ token, user }` |
| `GET /api/auth/demo-accounts` | Seeded demo accounts (flagged as demo data) |
| `POST /api/auth/change-password` | Change own password |
| `GET /api/dashboard?days=` | KPIs, charts, recent activity, deadlines |
| `GET /api/projects`, `/meta`, `/:id` | Project list, filter metadata, detail |
| `POST/PUT/DELETE /api/projects/:id` | Create / update / delete (draft only) |
| `PATCH /api/projects/:id/status` | Workflow transition (409 on illegal move) |
| `POST /api/projects/:id/milestones` | Add milestone |
| `GET /api/ipr`, `/meta`, `/:id` | IPR list, metadata, detail |
| `POST/PUT/DELETE /api/ipr/:id`, `PATCH /api/ipr/:id/assign` | IPR administration |
| `GET /api/approvals`, `/meta`, `/:id` | Approval list, counts, detail |
| `POST /api/approvals/:id/decisions` | Record a decision (comment required for reject / request-changes) |
| `POST /api/approvals/:id/resubmit` | Resubmit a returned request |
| `GET /api/startups`, `/meta`, `/:id` | Startup list, metadata, detail |
| `PATCH /api/startups/:id/stage` | Move a venture between incubation stages |
| `GET/POST/PUT /api/mentors`, `/assign`, `/meetings` | Mentor directory, assignments, meetings |
| `GET /api/mentors/candidates?q=` | Account lookup for registering a mentor (requires `mentor.manage`) |
| `GET /api/funding/opportunities`, `/records` | Catalogue and funding records |
| `GET/POST/PATCH/DELETE /api/documents` | Document list, upload, versions, metadata, delete |
| `GET /api/documents/:id/file` | Stream the stored file |
| `GET /api/analytics`, `/export`, `/similar/:projectId` | Metrics, CSV export, similarity screening |
| `GET /api/notifications`, `/unread-count`, `/dropdown` | Notification feeds |
| `GET/POST/PUT/PATCH /api/users` | User administration |
| `GET /api/departments`, `GET/PUT /api/settings` | Departments and configuration |
| `GET /api/search?q=` | Global search across modules |

Validation failures return `422` with a `details[]` array of `{ field, message }`.
Illegal workflow transitions return `409`. Permission failures return `403`.

---

## Project layout

```
start,ipr and research/
├── package.json              npm workspaces + dev/build/start/seed scripts
├── .env.example              documented environment variables
├── legacy-landing-page/      the original static site, preserved untouched
├── server/
│   ├── src/
│   │   ├── index.ts          Express app, route mounting, static hosting
│   │   ├── db/
│   │   │   ├── schema.sql    23-table relational schema (source of truth)
│   │   │   ├── connection.ts DB handle, pragmas, schema application
│   │   │   └── seed.ts       fictional demo data + --reset rebuild
│   │   ├── lib/              permissions, workflow, audit, notifications,
│   │   │                     http helpers, crypto, TF-IDF similarity
│   │   ├── middleware/       auth (session attach), error handling
│   │   ├── routes/           one router per module
│   │   └── types/            shared enums and role labels
│   └── data/ , uploads/      runtime (git-ignored)
└── web/
    ├── vite.config.ts        dev proxy /api → :4000
    ├── tailwind.config.js    brand-* and ink-* palettes
    └── src/
        ├── components/
        │   ├── ui/            button, card, badge, input, modal, table, tabs,
        │   │                 dropdown, toast, stat card, progress, …
        │   ├── common.tsx     StatusBadge, DetailGrid, NoticeBanner, FilterBar
        │   └── layout/        Sidebar, Topbar, AppLayout
        ├── lib/               api client, auth context, hooks, format, constants
        └── pages/             one file per module (+ detail and form pages)
```

---

## What is implemented

- ✅ Real Express + SQLite backend with a 23-table relational schema
- ✅ Six seeded roles with a server-enforced permission matrix
- ✅ All eleven modules with list, detail and form views
- ✅ Explicit workflow state machines for projects and IPR; illegal transitions rejected with `409`
- ✅ Staged multi-level approval pipeline with a permanent decision history
- ✅ Branching paths — project → IPR and project → startup are independent and optional
- ✅ Real document upload, versioning and download (files stored on disk, streamed by the API)
- ✅ Server-side filtering, searching, pagination and scoping by role/department
- ✅ Audit trail on every state-changing action
- ✅ In-app notifications plus deadline reminder generation
- ✅ Analytics with defined metrics, CSV export and TF-IDF similarity screening
- ✅ Seeded database whose figures match every dashboard widget

## What is not implemented

These are intentionally out of scope and clearly signposted in the UI:

- ❌ **Real authentication** — no SSO/LDAP/OAuth, no MFA, no password reset, no
  email delivery. The demo account system is not production-secure.
- ❌ **Real email/SMS notifications** — notifications are in-app records only.
- ❌ **External funding integrations** — the opportunity catalogue is sample data and
  **no application is ever submitted to an external funder**. Amounts are tracked
  internally only.
- ❌ **Legal patentability assessment** — IPR statuses are administrative workflow
  states and deadline tracking only.
- ❌ **Plagiarism / novelty detection** — the similarity panel is a TF-IDF + cosine
  screening aid for human review, not a verdict.
- ❌ **Email/calendar sync, file previewing in-browser, bulk import/export** (CSV export
  exists for analytics only).
- ❌ **Multi-tenancy, per-department branding, localisation, dark mode.**
- ❌ **Automated testing** — there is no shipped unit or integration test suite. The build
  was verified during development with throwaway scripts (not part of the repo): an API
  smoke suite covering RBAC, validation, workflow guards and a real upload/download
  round-trip; a workflow suite driving projects, IPR and approvals through their state
  machines; a static cross-check that every API path the frontend calls exists on the
  server; and a headless-Chrome pass over every route for all six roles, asserting no
  console errors, no uncaught exceptions and no failed API calls.

---

## Deployment

See **[DEPLOY.md](DEPLOY.md)** for a step-by-step guide.

Two supported paths:

- **Vercel** (single project, one URL). `vercel.json` builds the frontend and a
  serverless bundle of the API. Because Vercel has no persistent disk, the app
  switches to an in-memory SQLite database that is seeded per instance: reads
  and the full UI work, but writes are not durable. Good for sharing a demo.
- **Render / any Node host** (`render.yaml`). The API runs as a normal process
  with the database on disk, so data persists.

`DEPLOY.md` explains the trade-off, both setups, and how to create a temporary
public link.

---

## Troubleshooting

**`Cannot find module 'node:sqlite'`** — your Node is older than 22.5. Upgrade to Node 22.5+
(or 24.x, which is what this was built on).

**`ExperimentalWarning: SQLite is an experimental feature`** — expected on Node 22/23/24.
Harmless.

**Port already in use** — set `PORT` for the API, or stop the other process. The Vite dev
server port is fixed at 5173 in `web/vite.config.ts`.

**Database locked / cannot reset** — Windows holds file locks on the SQLite file while the
API is running. Stop the API before `npm run reset-db`.

**Login returns 401** — every seeded account uses the password `demo1234`. If the database
was partially seeded, run `npm run reset-db`.

**Empty pages** — check the API is up at http://localhost:4000/api/health and that the Vite
proxy is reaching it. In production mode remember to run `npm run build` before `npm start`.

---

## Disclaimer

This is a demonstration system. "Northgate University", its departments, staff, projects,
IPR records, startups, funding opportunities and documents are entirely fictional.
The IPR module records administrative workflow state and deadlines only and is not a legal
assessment of patentability. The funding catalogue is illustrative sample data; this
platform never submits an application to an external funder. Authentication is a seeded
demo mechanism and is not production-secure.
