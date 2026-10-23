import { db, nowIso } from '../db/connection.js';

export interface AuditEntry {
  entityType: string;
  entityId?: number | null;
  entityCode?: string | null;
  action: string;
  actorId?: number | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  details?: string | null;
}

export function audit(entry: AuditEntry): void {
  db.prepare(
    `INSERT INTO audit_logs
       (entity_type, entity_id, entity_code, action, actor_id, from_status, to_status, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.entityType,
    entry.entityId ?? null,
    entry.entityCode ?? null,
    entry.action,
    entry.actorId ?? null,
    entry.fromStatus ?? null,
    entry.toStatus ?? null,
    entry.details ?? null,
    nowIso(),
  );
}

/** Convenience wrapper used by record-detail pages to build a timeline. */
export function timelineFor(entityType: string, entityId: number) {
  return db
    .prepare(
      `SELECT a.*, u.full_name AS actor_name
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.entity_type = ? AND a.entity_id = ?
        ORDER BY a.created_at DESC, a.id DESC`,
    )
    .all(entityType, entityId) as any[];
}
