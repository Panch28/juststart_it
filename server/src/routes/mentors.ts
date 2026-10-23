import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db/connection.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';

export const mentorsRouter = Router();
mentorsRouter.use(requireAuth);

mentorsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const rows = db
      .prepare(
        `SELECT m.id, m.user_id, u.full_name, u.email, u.designation, m.expertise, m.industries, m.bio,
                m.max_startups, m.status,
                (SELECT COUNT(*) FROM mentor_assignments ma WHERE ma.mentor_id = m.id AND ma.status='ACTIVE') AS assigned_count,
                (SELECT COUNT(*) FROM mentor_meetings mm WHERE mm.mentor_id = m.id) AS meeting_count,
                (SELECT COUNT(*) FROM mentor_assignments ma JOIN startups s ON s.id = ma.startup_id
                  WHERE ma.mentor_id = m.id AND ma.status='ACTIVE' AND s.stage IN ('INCUBATION','SEED','GROWTH')) AS active_incubations
           FROM mentors m JOIN users u ON u.id = m.user_id
          WHERE (? = '' OR lower(u.full_name) LIKE lower(?) OR lower(COALESCE(m.expertise,'')) LIKE lower(?))
          ORDER BY u.full_name`,
      )
      .all(q.search ?? '', q.search ?? '', q.search ?? '') as any[];

    const assignments = db
      .prepare(
        `SELECT ma.*, s.name AS startup_name, s.startup_code, s.stage, s.industry
           FROM mentor_assignments ma JOIN startups s ON s.id = ma.startup_id
          WHERE ma.mentor_id IN (SELECT id FROM mentors WHERE user_id = ?)
          ORDER BY ma.assigned_at DESC`,
      )
      .all(req.user!.id) as any[];

    res.json({ mentors: rows, myAssignments: assignments });
  }),
);

/**
 * Directory lookup used when registering a new mentor. It intentionally exposes
 * only the fields needed to pick a person (never the full user record) so that
 * incubation managers can add mentors without holding the user-administration
 * permission that `GET /users` requires.
 */
mentorsRouter.get(
  '/candidates',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'mentor.manage')) {
      forbidden('Only incubation managers and administrators can register mentors.');
    }
    const q = String((req.query as Record<string, string>).q ?? '').trim();
    const rows = db
      .prepare(
        `SELECT u.id, u.full_name, u.email, u.role, u.designation, d.name AS department_name
           FROM users u
           LEFT JOIN departments d ON d.id = u.department_id
          WHERE u.status = 'ACTIVE'
            AND u.id NOT IN (SELECT user_id FROM mentors)
            AND (? = '' OR lower(u.full_name) LIKE lower(?) OR lower(u.email) LIKE lower(?))
          ORDER BY u.full_name
          LIMIT 50`,
      )
      .all(q, `%${q}%`, `%${q}%`) as any[];
    res.json({
      candidates: rows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        email: r.email,
        role: r.role,
        designation: r.designation,
        department: r.department_name,
      })),
    });
  }),
);

mentorsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'mentor.manage')) forbidden('Only incubation managers and administrators can add mentors.');
    const schema = z.object({
      userId: z.coerce.number().int().positive(),
      expertise: z.string().min(3, 'Expertise is required'),
      industries: z.string().min(2, 'Industry information is required'),
      bio: z.string().optional().default(''),
      maxStartups: z.coerce.number().min(1).max(10).optional().default(3),
    });
    const data = schema.parse(req.body);
    const user = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(data.userId) as any;
    if (!user) notFound('User not found.');
    const exists = db.prepare('SELECT id FROM mentors WHERE user_id = ?').get(data.userId) as any;
    if (exists) conflict('This user is already registered as a mentor.');

    const result = db
      .prepare(
        `INSERT INTO mentors (user_id, expertise, industries, bio, max_startups, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
      )
      .run(data.userId, data.expertise, data.industries, data.bio, data.maxStartups);
    audit({
      entityType: 'MENTOR',
      entityId: Number(result.lastInsertRowid),
      action: 'MENTOR_ADDED',
      actorId: req.user!.id,
      details: user.full_name,
    });
    res.status(201).json({ id: Number(result.lastInsertRowid), message: `${user.full_name} added as a mentor.` });
  }),
);

mentorsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      expertise: z.string().min(3).optional(),
      industries: z.string().min(2).optional(),
      bio: z.string().optional(),
      maxStartups: z.coerce.number().min(1).max(10).optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    });
    const data = schema.parse(req.body);
    const id = Number(req.params.id);
    const mentor = db.prepare('SELECT * FROM mentors WHERE id = ?').get(id) as any;
    if (!mentor) notFound('Mentor not found.');

    const isSelf = mentor.user_id === req.user!.id;
    if (!can(req.user, 'mentor.manage') && !(can(req.user, 'mentor.update.own') && isSelf)) {
      forbidden('You cannot edit this mentor profile.');
    }
    if (!can(req.user, 'mentor.manage') && isSelf && (data.maxStartups !== undefined || data.status !== undefined)) {
      forbidden('Only administrators can change mentor capacity or status.');
    }

    db.prepare(
      `UPDATE mentors SET expertise = ?, industries = ?, bio = ?, max_startups = ?, status = ? WHERE id = ?`,
    ).run(
      data.expertise ?? mentor.expertise,
      data.industries ?? mentor.industries,
      data.bio ?? mentor.bio,
      data.maxStartups ?? mentor.max_startups,
      data.status ?? mentor.status,
      id,
    );
    audit({ entityType: 'MENTOR', entityId: id, action: 'MENTOR_UPDATED', actorId: req.user!.id });
    res.json({ message: 'Mentor profile updated.' });
  }),
);

/** Assigns a mentor to a startup. */
mentorsRouter.post(
  '/assign',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'mentor.manage')) forbidden('Only incubation managers can assign mentors.');
    const schema = z.object({
      mentorId: z.coerce.number().int().positive(),
      startupId: z.coerce.number().int().positive(),
      nextMeetingAt: z.string().optional().default(''),
    });
    const { mentorId, startupId, nextMeetingAt } = schema.parse(req.body);
    const mentor = db.prepare('SELECT * FROM mentors WHERE id = ?').get(mentorId) as any;
    if (!mentor) notFound('Mentor not found.');
    const startup = db.prepare('SELECT * FROM startups WHERE id = ?').get(startupId) as any;
    if (!startup) notFound('Startup not found.');

    const active = db
      .prepare(`SELECT COUNT(*) AS c FROM mentor_assignments WHERE mentor_id = ? AND status='ACTIVE'`)
      .get(mentorId) as any;
    if (active.c >= mentor.max_startups) {
      badRequest(`${mentor.expertise?.slice(0, 0) ?? 'This mentor'} has reached the maximum of ${mentor.max_startups} active startup(s).`);
    }
    const dup = db
      .prepare(`SELECT id FROM mentor_assignments WHERE mentor_id = ? AND startup_id = ? AND status='ACTIVE'`)
      .get(mentorId, startupId) as any;
    if (dup) conflict('This mentor is already assigned to this startup.');

    const result = db
      .prepare(
        `INSERT INTO mentor_assignments (mentor_id, startup_id, assigned_at, status, next_meeting_at)
         VALUES (?, ?, ?, 'ACTIVE', ?)`,
      )
      .run(mentorId, startupId, nowIso(), nextMeetingAt || null);

    audit({
      entityType: 'STARTUP',
      entityId: startupId,
      entityCode: startup.startup_code,
      action: 'MENTOR_ASSIGNED',
      actorId: req.user!.id,
      details: `Mentor #${mentorId} assigned`,
    });
    res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Mentor assigned.' });
  }),
);

mentorsRouter.delete(
  '/assign/:assignmentId',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'mentor.manage')) forbidden('Only incubation managers can revoke mentor assignments.');
    const id = Number(req.params.assignmentId);
    const assignment = db.prepare('SELECT * FROM mentor_assignments WHERE id = ?').get(id) as any;
    if (!assignment) notFound('Assignment not found.');
    db.prepare(`UPDATE mentor_assignments SET status='REVOKED' WHERE id = ?`).run(id);
    audit({
      entityType: 'STARTUP',
      entityId: assignment.startup_id,
      action: 'MENTOR_UNASSIGNED',
      actorId: req.user!.id,
    });
    res.json({ message: 'Mentor assignment revoked.' });
  }),
);

/** Records a mentorship meeting. */
mentorsRouter.post(
  '/meetings',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      startupId: z.coerce.number().int().positive(),
      mentorId: z.coerce.number().int().positive().optional(),
      meetingDate: z.string().min(1, 'Meeting date is required'),
      agenda: z.string().optional().default(''),
      notes: z.string().optional().default(''),
      followUpAction: z.string().optional().default(''),
      followUpDue: z.string().optional().default(''),
    });
    const data = schema.parse(req.body);

    let mentorId = data.mentorId ?? null;
    if (!mentorId) {
      const own = db
        .prepare(
          `SELECT m.id FROM mentors m JOIN mentor_assignments ma ON ma.mentor_id = m.id
            WHERE ma.startup_id = ? AND m.user_id = ? AND ma.status='ACTIVE'`,
        )
        .get(data.startupId, req.user!.id) as any;
      mentorId = own?.id ?? null;
    }
    if (!mentorId) {
      const any = db
        .prepare(`SELECT id FROM mentors WHERE user_id = ?`)
        .get(req.user!.id) as any;
      mentorId = any?.id ?? null;
    }
    if (!mentorId) forbidden('You are not registered as a mentor.');
    if (!can(req.user, 'mentor.manage') && !can(req.user, 'mentor.update.own')) {
      forbidden('Your role cannot record mentorship meetings.');
    }

    const assignment = db
      .prepare(`SELECT * FROM mentor_assignments WHERE mentor_id = ? AND startup_id = ? AND status='ACTIVE'`)
      .get(mentorId, data.startupId) as any;
    if (!assignment) badRequest('This mentor is not assigned to the selected startup.');

    const result = db
      .prepare(
        `INSERT INTO mentor_meetings
          (assignment_id, mentor_id, startup_id, meeting_date, agenda, notes, follow_up_action, follow_up_status, follow_up_due, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
      )
      .run(
        assignment.id,
        mentorId,
        data.startupId,
        data.meetingDate,
        data.agenda,
        data.notes,
        data.followUpAction,
        data.followUpDue || null,
        nowIso(),
      );

    audit({
      entityType: 'STARTUP',
      entityId: data.startupId,
      action: 'MENTOR_MEETING_RECORDED',
      actorId: req.user!.id,
      details: `Meeting on ${data.meetingDate}`,
    });
    res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Meeting recorded.' });
  }),
);

mentorsRouter.patch(
  '/meetings/:meetingId',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      followUpAction: z.string().optional(),
      followUpStatus: z.enum(['OPEN', 'IN_PROGRESS', 'DONE']).optional(),
      followUpDue: z.string().optional(),
      notes: z.string().optional(),
      agenda: z.string().optional(),
    });
    const data = schema.parse(req.body);
    if (!can(req.user, 'mentor.manage') && !can(req.user, 'mentor.update.own')) {
      forbidden('Your role cannot update meeting records.');
    }
    const id = Number(req.params.meetingId);
    const meeting = db.prepare('SELECT * FROM mentor_meetings WHERE id = ?').get(id) as any;
    if (!meeting) notFound('Meeting not found.');
    db.prepare(
      `UPDATE mentor_meetings SET agenda = ?, notes = ?, follow_up_action = ?, follow_up_status = ?, follow_up_due = ? WHERE id = ?`,
    ).run(
      data.agenda ?? meeting.agenda,
      data.notes ?? meeting.notes,
      data.followUpAction ?? meeting.follow_up_action,
      data.followUpStatus ?? meeting.follow_up_status,
      data.followUpDue ?? meeting.follow_up_due,
      id,
    );
    audit({
      entityType: 'STARTUP',
      entityId: meeting.startup_id,
      action: 'MENTOR_MEETING_UPDATED',
      actorId: req.user!.id,
    });
    res.json({ message: 'Meeting record updated.' });
  }),
);
