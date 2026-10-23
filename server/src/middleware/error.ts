import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { ApiError } from '../lib/http.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: `No API route matches ${req.method} ${req.originalUrl}`,
    code: 'NOT_FOUND',
  });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((i) => ({
        field: i.path.join('.') || '(root)',
        message: i.message,
      })),
    });
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: err.message,
      code: httpCode(err.status),
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // Upload failures are client errors, not server faults.
  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'The file exceeds the maximum upload size of 10 MB.'
        : err.code === 'LIMIT_FILE_COUNT'
          ? 'Too many files were uploaded in one request.'
          : `Upload failed: ${err.message}`;
    res.status(400).json({ error: message, code: 'BAD_REQUEST' });
    return;
  }

  const message = err?.message ?? 'Unexpected server error';
  // SQLite constraint violations are surfaced with a friendly message.
  if (String(message).includes('UNIQUE constraint failed')) {
    res.status(409).json({ error: 'A record with the same unique value already exists.', code: 'CONFLICT' });
    return;
  }
  if (String(message).includes('FOREIGN KEY constraint failed')) {
    res.status(409).json({ error: 'This change conflicts with related records still in use.', code: 'CONFLICT' });
    return;
  }

  console.error('[api-error]', err);
  res.status(500).json({ error: 'Unexpected server error', code: 'INTERNAL_ERROR' });
};

function httpCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'VALIDATION_ERROR';
    default:
      return 'ERROR';
  }
}
