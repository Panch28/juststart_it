export type Role =
  | 'ADMINISTRATOR'
  | 'RESEARCHER'
  | 'IPR_OFFICER'
  | 'APPROVAL_MEMBER'
  | 'INCUBATION_MANAGER'
  | 'MENTOR';

export interface SessionUser {
  id: number;
  fullName: string;
  email: string;
  role: Role;
  roleLabel: string;
  departmentId: number | null;
  departmentName: string | null;
  designation: string | null;
  permissions: string[];
  modules: string[];
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paged<T> {
  data: T[];
  meta: PageMeta;
  unread?: number;
  counts?: { category: string; count: number; unread: number }[];
  categories?: string[];
}

export class ApiError extends Error {
  status: number;
  details?: { field: string; message: string }[];
  constructor(status: number, message: string, details?: { field: string; message: string }[]) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const TOKEN_KEY = 'rih_session_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

type Query = Record<string, string | number | boolean | null | undefined>;

function buildQuery(params?: Query): string {
  if (!params) return '';
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') search.append(k, String(v));
  });
  const s = search.toString();
  return s ? `?${s}` : '';
}

async function request<T>(
  path: string,
  options: RequestInit & { params?: Query } = {},
): Promise<T> {
  const { params, ...init } = options;
  const token = getToken();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`/api${path}${buildQuery(params)}`, { ...init, headers, credentials: 'include' });

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const message =
      (payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: string }).error)
        : typeof payload === 'string' && payload
          ? payload
          : `Request failed with status ${res.status}`);
    const details =
      payload && typeof payload === 'object' && 'details' in payload
        ? (payload as { details?: { field: string; message: string }[] }).details
        : undefined;
    throw new ApiError(res.status, message, details);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, params?: Query) => request<T>(path, { method: 'GET', params }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function fileUrl(documentId: number, download = false): string {
  const token = getToken();
  const params = new URLSearchParams();
  if (download) params.set('download', 'true');
  const qs = params.toString();
  // The session cookie is httpOnly and sent automatically for same-origin requests.
  return `/api/documents/${documentId}/file${qs ? `?${qs}` : ''}${token ? '' : ''}`;
}
