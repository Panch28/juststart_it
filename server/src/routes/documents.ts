import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { createHash } from 'node:crypto';
import { existsSync, unlinkSync, createReadStream, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { db, nowIso, UPLOAD_DIR } from '../db/connection.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound, pageResponse, paginationFrom, WhereBuilder, likeParam } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';
import { DOCUMENT_CATEGORIES, type Role } from '../types/index.js';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.txt', '.png', '.jpg', '.jpeg'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extname(file.originalname).toLowerCase()}`;
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 10 },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      // ApiError so the global error handler answers 400 instead of 500.
      cb(
        badRequest(
          `File type "${ext || 'unknown'}" is not allowed. Accepted types: ${ALLOWED_EXTENSIONS.join(', ')}.`,
        ),
      );
      return;
    }
    cb(null, true);
  },
});

const uploadSchema = z.object({
  name: z.string().min(3, 'Document name must be at least 3 characters'),
  category: z.enum(DOCUMENT_CATEGORIES),
  relatedType: z.enum(['PROJECT', 'IPR', 'STARTUP', 'APPROVAL', 'FUNDING']).optional(),
  relatedId: z.coerce.number().int().positive().optional().nullable(),
  description: z.string().optional().default(''),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'UNDER_REVIEW', 'REJECTED']).optional(),
});

/** Roles that may delete a given document. */
function canDeleteDocument(user: { id: number; role: Role }, doc: { uploaded_by: number | null }): boolean {
  if (can(user, 'document.delete.any')) return true;
  return can(user, 'document.delete.own') && doc.uploaded_by === user.id;
}

documentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const meta = paginationFrom(q, 10);
    const wb = new WhereBuilder();

    if (q.search) wb.add('lower(d.name) LIKE ?', likeParam(q.search));
    if (q.category) wb.add('d.category = ?', q.category);
    if (q.relatedType) wb.add('d.related_type = ?', q.relatedType);
    if (q.relatedId) wb.add('d.related_id = ?', Number(q.relatedId));
    if (q.uploadedBy) wb.add('d.uploaded_by = ?', Number(q.uploadedBy));
    if (q.status) wb.add('d.status = ?', q.status);
    if (q.from) wb.add('date(d.upload_date) >= date(?)', q.from);
    if (q.to) wb.add('date(d.upload_date) <= date(?)', q.to);

    const where = wb.sql();
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM documents d ${where}`).get(...wb.values) as any
    ).c as number;

    const rows = db
      .prepare(
        `SELECT d.*, u.full_name AS uploaded_by_name,
                CASE d.related_type
                  WHEN 'PROJECT' THEN (SELECT p.project_code FROM research_projects p WHERE p.id = d.related_id)
                  WHEN 'IPR' THEN (SELECT i.ipr_code FROM ipr_records i WHERE i.id = d.related_id)
                  WHEN 'STARTUP' THEN (SELECT s.startup_code FROM startups s WHERE s.id = d.related_id)
                  WHEN 'APPROVAL' THEN (SELECT a.request_code FROM approval_requests a WHERE a.id = d.related_id)
                  WHEN 'FUNDING' THEN (SELECT f.code FROM funding_opportunities f WHERE f.id = d.related_id)
                END AS related_code,
                CASE d.related_type
                  WHEN 'PROJECT' THEN (SELECT p.title FROM research_projects p WHERE p.id = d.related_id)
                  WHEN 'IPR' THEN (SELECT i.title FROM ipr_records i WHERE i.id = d.related_id)
                  WHEN 'STARTUP' THEN (SELECT s.name FROM startups s WHERE s.id = d.related_id)
                  WHEN 'APPROVAL' THEN (SELECT a.request_type FROM approval_requests a WHERE a.id = d.related_id)
                  WHEN 'FUNDING' THEN (SELECT f.title FROM funding_opportunities f WHERE f.id = d.related_id)
                END AS related_title
           FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
           ${where}
          ORDER BY d.upload_date DESC
          LIMIT ? OFFSET ?`,
      )
      .all(...wb.values, meta.pageSize, (meta.page - 1) * meta.pageSize) as any[];

    res.json(pageResponse(rows, { ...meta, total }));
  }),
);

documentsRouter.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    res.json({
      categories: DOCUMENT_CATEGORIES,
      statuses: ['ACTIVE', 'ARCHIVED', 'UNDER_REVIEW', 'REJECTED'],
      relatedTypes: ['PROJECT', 'IPR', 'STARTUP', 'APPROVAL', 'FUNDING'],
      maxFileSizeBytes: MAX_FILE_SIZE,
      allowedExtensions: ALLOWED_EXTENSIONS,
    });
  }),
);

documentsRouter.post(
  '/',
  upload.array('files', 10),
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'document.upload')) forbidden('Your role cannot upload documents.');
    const meta = uploadSchema.parse(req.body);
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) badRequest('Select at least one file to upload.');

    const created: any[] = [];
    for (const file of files) {
      // diskStorage writes to disk first, so hash the stored bytes.
      const checksum = createHash('sha256').update(readFileSync(file.path)).digest('hex');
      const size = file.size;
      const relativePath = file.filename;

      const result = db
        .prepare(
          `INSERT INTO documents
            (name, description, category, related_type, related_id, uploaded_by, upload_date,
             file_type, file_size, storage_path, checksum, status, version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?)`,
        )
        .run(
          meta.name || file.originalname,
          meta.description,
          meta.category,
          meta.relatedType ?? null,
          meta.relatedId ?? null,
          req.user!.id,
          nowIso(),
          (extname(file.originalname) || 'file').replace('.', '').toUpperCase(),
          size,
          relativePath,
          checksum,
          nowIso(),
        );
      const id = Number(result.lastInsertRowid);
      created.push({ id, name: meta.name || file.originalname, size });
      audit({
        entityType: 'DOCUMENT',
        entityId: id,
        action: 'DOCUMENT_UPLOADED',
        actorId: req.user!.id,
        details: `${meta.name || file.originalname} (${size} bytes)`,
      });
    }

    res.status(201).json({ documents: created, message: `${created.length} document(s) uploaded.` });
  }),
);

/** Uploads a new version, superseding an existing document. */
documentsRouter.post(
  '/:id/versions',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'document.upload')) forbidden('Your role cannot upload documents.');
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
    if (!existing) notFound('Document not found.');
    const file = req.file;
    if (!file) badRequest('Select a file to upload.');

    const nextVersion = (existing.version ?? 1) + 1;
    const result = db
      .prepare(
        `INSERT INTO documents
          (name, description, category, related_type, related_id, uploaded_by, upload_date,
           file_type, file_size, storage_path, checksum, status, version, supersedes_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        existing.name,
        existing.description,
        existing.category,
        existing.related_type,
        existing.related_id,
        req.user!.id,
        nowIso(),
        (extname(file.originalname) || 'file').replace('.', '').toUpperCase(),
        file.size,
        file.filename,
        createHash('sha256').update(file.buffer ?? Buffer.alloc(0)).digest('hex'),
        existing.status,
        nextVersion,
        id,
        nowIso(),
      );
    audit({
      entityType: 'DOCUMENT',
      entityId: Number(result.lastInsertRowid),
      action: 'DOCUMENT_VERSION_ADDED',
      actorId: req.user!.id,
      details: `v${nextVersion} of "${existing.name}"`,
    });
    res.status(201).json({ id: Number(result.lastInsertRowid), version: nextVersion, message: `Version ${nextVersion} uploaded.` });
  }),
);

/** Streams a document for preview or download. */
documentsRouter.get(
  '/:id/file',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
    if (!doc) notFound('Document not found.');
    const path = join(UPLOAD_DIR, basename(doc.storage_path));
    if (!existsSync(path)) {
      notFound('The stored file for this document is no longer available.');
    }
    const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(doc.name)}"`);
    createReadStream(path).pipe(res);
  }),
);

documentsRouter.get(
  '/:id/versions',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
    if (!doc) notFound('Document not found.');
    const rootId = doc.supersedes_id ?? id;
    const rows = db
      .prepare(
        `SELECT d.id, d.name, d.version, d.upload_date, d.file_size, d.file_type, u.full_name AS uploaded_by_name
           FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
          WHERE d.id = ? OR d.supersedes_id = ?
          ORDER BY d.version DESC`,
      )
      .all(rootId, rootId) as any[];
    res.json({ versions: rows, currentId: id });
  }),
);

documentsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      name: z.string().min(3).optional(),
      description: z.string().optional(),
      category: z.enum(DOCUMENT_CATEGORIES).optional(),
      status: z.enum(['ACTIVE', 'ARCHIVED', 'UNDER_REVIEW', 'REJECTED']).optional(),
      relatedType: z.enum(['PROJECT', 'IPR', 'STARTUP', 'APPROVAL', 'FUNDING']).optional(),
      relatedId: z.coerce.number().int().positive().optional().nullable(),
    });
    const data = schema.parse(req.body);
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
    if (!existing) notFound('Document not found.');
    if (!canDeleteDocument(req.user!, existing) && req.user!.role !== 'ADMINISTRATOR') {
      forbidden('You cannot edit this document.');
    }
    db.prepare(
      `UPDATE documents SET name = ?, description = ?, category = ?, status = ?, related_type = ?, related_id = ? WHERE id = ?`,
    ).run(
      data.name ?? existing.name,
      data.description ?? existing.description,
      data.category ?? existing.category,
      data.status ?? existing.status,
      data.relatedType ?? existing.related_type,
      data.relatedId ?? existing.related_id,
      id,
    );
    audit({ entityType: 'DOCUMENT', entityId: id, action: 'DOCUMENT_UPDATED', actorId: req.user!.id });
    res.json({ message: 'Document updated.' });
  }),
);

documentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
    if (!existing) notFound('Document not found.');
    if (!canDeleteDocument(req.user!, existing)) {
      forbidden('You do not have permission to delete this document.');
    }
    const path = join(UPLOAD_DIR, basename(existing.storage_path));
    db.prepare('DELETE FROM documents WHERE id = ?').run(id);
    if (existsSync(path)) {
      try {
        unlinkSync(path);
      } catch {
        /* file already gone */
      }
    }
    audit({
      entityType: 'DOCUMENT',
      entityId: id,
      action: 'DOCUMENT_DELETED',
      actorId: req.user!.id,
      details: existing.name,
    });
    res.json({ message: 'Document deleted.' });
  }),
);
