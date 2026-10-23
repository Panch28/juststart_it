import { Router } from 'express';
import { z } from 'zod';
import { db, nowIso } from '../db/connection.js';
import { asyncHandler, notFound, pageResponse, paginationFrom, WhereBuilder } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { generateDeadlineNotifications } from '../lib/notifications.js';
import { NOTIFICATION_CATEGORIES } from '../types/index.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const meta = paginationFrom(q, 12);
    const wb = new WhereBuilder();
    wb.add('n.user_id = ?', req.user!.id);
    if (q.category) wb.add('n.category = ?', q.category);
    if (q.read === 'true') wb.add('n.is_read = 1');
    if (q.read === 'false') wb.add('n.is_read = 0');

    const where = wb.sql();
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM notifications n ${where}`).get(...wb.values) as any
    ).c as number;
    const rows = db
      .prepare(
        `SELECT n.* FROM notifications n ${where} ORDER BY n.is_read ASC, n.created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...wb.values, meta.pageSize, (meta.page - 1) * meta.pageSize) as any[];

    const unread = (
      db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user!.id) as any
    ).c as number;

    const counts = db
      .prepare(
        `SELECT category, COUNT(*) AS count, SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread
           FROM notifications WHERE user_id = ? GROUP BY category`,
      )
      .all(req.user!.id) as any[];

    res.json(pageResponse(rows, { ...meta, total }, { unread, counts, categories: NOTIFICATION_CATEGORIES }));
  }),
);

notificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const row = db
      .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0')
      .get(req.user!.id) as any;
    res.json({ unread: row.c as number });
  }),
);

notificationsRouter.get(
  '/dropdown',
  asyncHandler(async (req, res) => {
    const rows = db
      .prepare(
        `SELECT n.* FROM notifications n WHERE n.user_id = ? ORDER BY n.is_read ASC, n.created_at DESC LIMIT 8`,
      )
      .all(req.user!.id) as any[];
    const unread = (
      db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user!.id) as any
    ).c as number;
    res.json({ notifications: rows, unread });
  }),
);

notificationsRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const result = db
      .prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
      .run(id, req.user!.id);
    if (!result.changes) notFound('Notification not found.');
    res.json({ message: 'Marked as read.' });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const result = db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(
      req.user!.id,
    );
    res.json({ message: `Marked ${result.changes} notification(s) as read.`, count: result.changes });
  }),
);

notificationsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const result = db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(id, req.user!.id);
    if (!result.changes) notFound('Notification not found.');
    res.json({ message: 'Notification removed.' });
  }),
);

/** Regenerates deadline-driven reminders from current database state. */
notificationsRouter.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const schema = z.object({ thresholds: z.array(z.number().int().min(0).max(365)).optional() });
    const { thresholds } = schema.parse(req.body ?? {});
    const result = generateDeadlineNotifications(thresholds);
    res.json({ message: `Reminder scan complete. ${result.created} new notification(s).`, created: result.created });
  }),
);
