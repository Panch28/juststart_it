import { db, nowIso, daysUntil } from '../db/connection.js';
import type { NotificationCategory } from '../types/index.js';

export interface NotifyInput {
  userId: number;
  category: NotificationCategory;
  title: string;
  description?: string;
  link?: string;
  /** Unique key so repeated runs do not create duplicate reminders. */
  dedupeKey?: string;
}

export function notify(input: NotifyInput): void;
export function notify(userId: number, input: Omit<NotifyInput, 'userId'>): void;
export function notify(a: NotifyInput | number, b?: Omit<NotifyInput, 'userId'>): void {
  const input: NotifyInput =
    typeof a === 'number' ? { ...(b as Omit<NotifyInput, 'userId'>), userId: a } : a;
  if (!input.userId) return;
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO notifications
       (user_id, category, title, description, link, is_read, dedupe_key, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  );
  stmt.run(
    input.userId,
    input.category,
    input.title,
    input.description ?? null,
    input.link ?? null,
    input.dedupeKey ?? null,
    nowIso(),
  );
}

export function notifyMany(userIds: number[], input: Omit<NotifyInput, 'userId'>): void {
  for (const id of new Set(userIds.filter(Boolean))) {
    notify({ ...input, userId: id, dedupeKey: input.dedupeKey ? `${input.dedupeKey}:u${id}` : undefined });
  }
}

function adminsAndRole(role: string): number[] {
  const rows = db
    .prepare(`SELECT id FROM users WHERE status = 'ACTIVE' AND (role = 'ADMINISTRATOR' OR role = ?)`)
    .all(role) as any[];
  return rows.map((r) => r.id);
}

/**
 * Regenerates deadline-driven notifications from the current database state.
 * Deterministic and idempotent: repeated calls with unchanged data create no
 * new rows because of the dedupe key.
 */
export function generateDeadlineNotifications(thresholds: number[] = [30, 7, 1]): { created: number } {
  let created = 0;
  const before = (db.prepare('SELECT COUNT(*) AS c FROM notifications').get() as any).c as number;

  // --- IPR deadlines -------------------------------------------------------
  const iprRows = db
    .prepare(
      `SELECT i.id, i.ipr_code, i.title, i.next_deadline, i.status, i.ipr_officer_id,
              p.project_code, u.full_name AS pi_name, p.principal_investigator_id AS pi_id
         FROM ipr_records i
         LEFT JOIN research_projects p ON p.id = i.project_id
         LEFT JOIN users u ON u.id = p.principal_investigator_id
        WHERE i.next_deadline IS NOT NULL
          AND i.status NOT IN ('GRANTED','CLOSED','REJECTED')`,
    )
    .all() as any[];

  for (const row of iprRows) {
    const days = daysUntil(row.next_deadline);
    const recipients = new Set<number>();
    if (row.ipr_officer_id) recipients.add(row.ipr_officer_id);
    if (row.pi_id) recipients.add(row.pi_id);
    adminsAndRole('IPR_OFFICER').forEach((id) => recipients.add(id));
    const owner = db
      .prepare(
        `SELECT u.id FROM ipr_inventors inv JOIN users u ON u.id = inv.user_id WHERE inv.ipr_id = ?`,
      )
      .all(row.id) as any[];
    owner.forEach((o) => recipients.add(o.id));

    if (days < 0) {
      notifyMany([...recipients], {
        category: 'OVERDUE',
        title: `IPR deadline overdue: ${row.ipr_code}`,
        description: `"${row.title}" was due ${row.next_deadline} (${Math.abs(days)} day(s) overdue).`,
        link: `/ipr/${row.id}`,
        dedupeKey: `ipr-overdue-${row.id}-${row.next_deadline}`,
      });
    } else {
      for (const t of thresholds) {
        if (days <= t) {
          notifyMany([...recipients], {
            category: 'DEADLINE',
            title: `IPR deadline in ${days} day(s): ${row.ipr_code}`,
            description: `"${row.title}" is due on ${row.next_deadline}.`,
            link: `/ipr/${row.id}`,
            dedupeKey: `ipr-deadline-${row.id}-${row.next_deadline}-${t}`,
          });
        }
      }
    }
  }

  // --- Project milestones --------------------------------------------------
  const msRows = db
    .prepare(
      `SELECT m.id, m.title, m.due_date, m.status, m.project_id, p.project_code, p.principal_investigator_id
         FROM project_milestones m
         JOIN research_projects p ON p.id = m.project_id
        WHERE m.due_date IS NOT NULL AND m.status <> 'COMPLETED'`,
    )
    .all() as any[];

  for (const row of msRows) {
    const days = daysUntil(row.due_date);
    const recipients = new Set<number>([row.principal_investigator_id]);
    if (days < 0) {
      notifyMany([...recipients], {
        category: 'OVERDUE',
        title: `Project milestone overdue: ${row.project_code}`,
        description: `Milestone "${row.title}" was due ${row.due_date}.`,
        link: `/projects/${row.project_id}`,
        dedupeKey: `ms-overdue-${row.id}-${row.due_date}`,
      });
    } else {
      for (const t of thresholds) {
        if (days <= t) {
          notifyMany([...recipients], {
            category: 'PROJECT_MILESTONE',
            title: `Milestone due in ${days} day(s): ${row.title}`,
            description: `Project ${row.project_code} milestone is due on ${row.due_date}.`,
            link: `/projects/${row.project_id}`,
            dedupeKey: `ms-deadline-${row.id}-${row.due_date}-${t}`,
          });
        }
      }
    }
  }

  // --- Startup milestones --------------------------------------------------
  const smRows = db
    .prepare(
      `SELECT m.id, m.title, m.due_date, m.status, m.startup_id, s.startup_code, s.founder_user_id
         FROM startup_milestones m
         JOIN startups s ON s.id = m.startup_id
        WHERE m.due_date IS NOT NULL AND m.status <> 'COMPLETED'`,
    )
    .all() as any[];

  for (const row of smRows) {
    const days = daysUntil(row.due_date);
    const recipients = new Set<number>();
    if (row.founder_user_id) recipients.add(row.founder_user_id);
    db
      .prepare(
        `SELECT ment.user_id FROM mentor_assignments ma JOIN mentors ment ON ment.id = ma.mentor_id WHERE ma.startup_id = ?`,
      )
      .all(row.startup_id)
      .forEach((m: any) => recipients.add(m.user_id));

    if (days < 0) {
      notifyMany([...recipients], {
        category: 'OVERDUE',
        title: `Startup milestone overdue: ${row.startup_code}`,
        description: `Milestone "${row.title}" was due ${row.due_date}.`,
        link: `/startups/${row.startup_id}`,
        dedupeKey: `sms-overdue-${row.id}-${row.due_date}`,
      });
    } else {
      for (const t of thresholds) {
        if (days <= t) {
          notifyMany([...recipients], {
            category: 'STARTUP_MILESTONE',
            title: `Startup milestone due in ${days} day(s): ${row.title}`,
            description: `${row.startup_code} milestone is due on ${row.due_date}.`,
            link: `/startups/${row.startup_id}`,
            dedupeKey: `sms-deadline-${row.id}-${row.due_date}-${t}`,
          });
        }
      }
    }
  }

  // --- Funding opportunity closing dates -----------------------------------
  const foRows = db
    .prepare(
      `SELECT id, code, title, closes_on FROM funding_opportunities
        WHERE closes_on IS NOT NULL AND status = 'OPEN'`,
    )
    .all() as any[];

  for (const row of foRows) {
    const days = daysUntil(row.closes_on);
    if (days < 0) continue;
    for (const t of thresholds) {
      if (days <= t) {
        notifyMany(adminsAndRole('INCUBATION_MANAGER'), {
          category: 'FUNDING_DEADLINE',
          title: `Funding deadline in ${days} day(s): ${row.code}`,
          description: `"${row.title}" closes on ${row.closes_on}.`,
          link: `/funding/${row.id}`,
          dedupeKey: `fund-deadline-${row.id}-${row.closes_on}-${t}`,
        });
      }
    }
  }

  const after = (db.prepare('SELECT COUNT(*) AS c FROM notifications').get() as any).c as number;
  created = after - before;
  return { created };
}
