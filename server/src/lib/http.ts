import type { Response, Request, NextFunction, RequestHandler } from 'express';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function notFound(message = 'Resource not found'): never {
  throw new ApiError(404, message);
}

export function badRequest(message: string, details?: unknown): never {
  throw new ApiError(400, message, details);
}

export function forbidden(message = 'You are not authorised to perform this action'): never {
  throw new ApiError(403, message);
}

export function conflict(message: string): never {
  throw new ApiError(409, message);
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function paginationFrom(query: Record<string, unknown>, defaultSize = 10): PageMeta {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(query.pageSize) || defaultSize));
  return { page, pageSize, total: 0, totalPages: 0 };
}

export function pageResponse<T>(items: T[], meta: PageMeta, extra: Record<string, unknown> = {}) {
  return {
    data: items,
    meta: { ...meta, totalPages: Math.max(1, Math.ceil(meta.total / meta.pageSize)) },
    ...extra,
  };
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return '';
  const cols = columns ?? Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.join(',');
  const body = rows.map((r) => cols.map((c) => escape(r[c])).join(',')).join('\n');
  return `${head}\n${body}`;
}

/** Builds a `WHERE` fragment from a list of SQL conditions. */
export class WhereBuilder {
  private clauses: string[] = [];
  private params: any[] = [];

  add(clause: string, ...params: any[]): this {
    if (params.some((p) => p === undefined || p === null || p === '')) return this;
    this.clauses.push(clause);
    this.params.push(...params);
    return this;
  }

  addRaw(clause: string, ...params: any[]): this {
    this.clauses.push(clause);
    this.params.push(...params);
    return this;
  }

  sql(prefix = 'WHERE'): string {
    if (!this.clauses.length) return '';
    return `${prefix} ${this.clauses.join(' AND ')}`;
  }

  get values(): any[] {
    return this.params;
  }
}

export function likeParam(term: string): string {
  return `%${term.trim().toLowerCase()}%`;
}
