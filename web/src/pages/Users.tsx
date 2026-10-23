import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users as UsersIcon,
  UserX,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAsync, useDebounced, usePaged } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { formatDateTime, formatNumber, initials } from '../lib/format';
import { FilterBar, MetaChip } from '../components/common';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dropdown,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  StatCard,
  TableSkeleton,
  TableWrapper,
  useToast,
} from '../components/ui';

interface UserRow {
  id: number;
  full_name: string;
  email: string;
  role: string;
  department_id: number | null;
  designation: string | null;
  phone: string | null;
  status: string;
  last_login_at: string | null;
  created_at: string;
  department_name: string | null;
  projects_leading: number;
  pending_reviews: number;
}

interface UsersMeta {
  roles: Array<{ value: string; label: string }>;
  departments: Array<{ id: number; code: string; name: string }>;
  statuses: string[];
}

interface ActivityRow {
  id: number;
  entity_type: string;
  entity_id: number;
  entity_code: string | null;
  action: string;
  from_status: string | null;
  to_status: string | null;
  details: string | null;
  created_at: string;
  actor_name: string | null;
}

interface UserDetailResponse {
  user: UserRow;
  activity: ActivityRow[];
}

interface UserFormState {
  fullName: string;
  email: string;
  role: string;
  departmentId: string;
  designation: string;
  phone: string;
  status: string;
  password: string;
}

const EMPTY_FORM: UserFormState = {
  fullName: '',
  email: '',
  role: 'RESEARCHER',
  departmentId: '',
  designation: '',
  phone: '',
  status: 'ACTIVE',
  password: '',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS_TONES: Record<string, 'success' | 'neutral' | 'danger'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  SUSPENDED: 'danger',
};

function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}

export default function Users() {
  const { user: sessionUser, can } = useAuth();
  const toast = useToast();

  const [searchInput, setSearchInput] = useState('');
  const [role, setRole] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewUserId, setViewUserId] = useState<number | null>(null);

  const [statusTarget, setStatusTarget] = useState<{ row: UserRow; next: string } | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  const search = useDebounced(searchInput, 350);

  const params = useMemo(
    () => ({
      search: search || undefined,
      role: role || undefined,
      departmentId: departmentId || undefined,
      status: status || undefined,
    }),
    [search, role, departmentId, status],
  );

  const {
    data,
    loading,
    error,
    reload,
    page,
    pageSize,
    total,
    totalPages,
    setPage,
    setPageSize,
  } = usePaged<UserRow>('/users', params, 10);

  const { data: meta } = useAsync<UsersMeta>(() => api.get<UsersMeta>('/users/meta'), []);

  const {
    data: detail,
    loading: detailLoading,
    error: detailError,
    reload: reloadDetail,
  } = useAsync<UserDetailResponse | null>(
    () => (viewUserId ? api.get<UserDetailResponse>(`/users/${viewUserId}`) : Promise.resolve(null)),
    [viewUserId],
  );

  const rows = data?.data ?? [];
  const hasFilters = Boolean(searchInput || role || departmentId || status);

  // Changing a filter has to send the user back to the first page of results.
  const filterKey = JSON.stringify(params);
  const filtersTouched = useRef(false);
  useEffect(() => {
    if (!filtersTouched.current) {
      filtersTouched.current = true;
      return;
    }
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const activeOnPage = rows.filter((r) => r.status === 'ACTIVE').length;
  const pendingReviewsOnPage = rows.reduce((sum, r) => sum + (r.pending_reviews ?? 0), 0);

  const roleLabel = (value: string) =>
    meta?.roles.find((r) => r.value === value)?.label ??
    value.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

  const clearFilters = () => {
    setSearchInput('');
    setRole('');
    setDepartmentId('');
    setStatus('');
  };

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, role: meta?.roles[0]?.value ?? 'RESEARCHER' });
    setFieldErrors({});
    setFormError(null);
    setAddOpen(true);
  };

  const openEdit = (row: UserRow) => {
    setEditingId(row.id);
    setForm({
      fullName: row.full_name,
      email: row.email,
      role: row.role,
      departmentId: row.department_id ? String(row.department_id) : '',
      designation: row.designation ?? '',
      phone: row.phone ?? '',
      status: row.status,
      password: '',
    });
    setFieldErrors({});
    setFormError(null);
    setEditOpen(true);
  };

  const openView = (row: UserRow) => {
    setViewUserId(row.id);
    setViewOpen(true);
  };

  const validate = (values: UserFormState): boolean => {
    const errors: Record<string, string> = {};
    if (values.fullName.trim().length < 3) {
      errors.fullName = 'Full name must be at least 3 characters.';
    }
    if (!EMAIL_PATTERN.test(values.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    if (values.password && values.password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitAdd = async () => {
    if (!validate(form)) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await api.post<{ id: number; message: string }>('/users', {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        role: form.role,
        departmentId: form.departmentId ? Number(form.departmentId) : null,
        designation: form.designation.trim() || undefined,
        phone: form.phone.trim() || undefined,
        status: form.status,
        ...(form.password ? { password: form.password } : {}),
      });
      toast.success(res.message ?? 'User created.', `${form.fullName.trim()} can now sign in.`);
      setAddOpen(false);
      reload();
    } catch (err) {
      const message = messageOf(err);
      setFormError(message);
      toast.error('Could not create user', message);
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async () => {
    if (editingId === null) return;
    if (!validate(form)) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await api.put<{ message: string }>(`/users/${editingId}`, {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        role: form.role,
        departmentId: form.departmentId ? Number(form.departmentId) : null,
        designation: form.designation.trim() || undefined,
        phone: form.phone.trim() || undefined,
        status: form.status,
        ...(form.password ? { password: form.password } : {}),
      });
      toast.success(res.message ?? 'User updated.', form.fullName.trim());
      setEditOpen(false);
      reload();
    } catch (err) {
      const message = messageOf(err);
      setFormError(message);
      toast.error('Could not update user', message);
    } finally {
      setSaving(false);
    }
  };

  const applyStatus = async () => {
    if (!statusTarget) return;
    setStatusSaving(true);
    try {
      const res = await api.patch<{ message: string }>(`/users/${statusTarget.row.id}/status`, {
        status: statusTarget.next,
      });
      toast.success(res.message ?? 'Account updated.', statusTarget.row.full_name);
      setStatusTarget(null);
      reload();
    } catch (err) {
      const message = messageOf(err);
      toast.error('Could not change account status', message);
      setStatusTarget(null);
    } finally {
      setStatusSaving(false);
    }
  };

  const statusAction = (row: UserRow) => {
    if (row.status === 'ACTIVE') {
      return { label: 'Deactivate', next: 'INACTIVE', icon: <UserX className="h-4 w-4" /> };
    }
    return { label: 'Activate', next: 'ACTIVE', icon: <UserCheck className="h-4 w-4" /> };
  };

  const userFormBody = (includePassword: boolean) => (
    <div className="space-y-4">
      {formError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-medium text-rose-700">
          {formError}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Full name"
          required
          value={form.fullName}
          error={fieldErrors.fullName}
          onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          placeholder="Dr. Aisha Rahman"
        />
        <Input
          label="Email address"
          type="email"
          required
          value={form.email}
          error={fieldErrors.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          placeholder="aisha.rahman@example.edu"
        />
        <Select
          label="Role"
          required
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          options={(meta?.roles ?? []).map((r) => ({ value: r.value, label: r.label }))}
        />
        <Select
          label="Department"
          value={form.departmentId}
          onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
          placeholder="No department"
          options={(meta?.departments ?? []).map((d) => ({
            value: String(d.id),
            label: `${d.code} — ${d.name}`,
          }))}
        />
        <Input
          label="Designation"
          value={form.designation}
          onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
          placeholder="Associate Professor"
        />
        <Input
          label="Phone"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          placeholder="+91 40 1234 5678"
        />
        <Select
          label="Account status"
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          options={(meta?.statuses ?? ['ACTIVE', 'INACTIVE', 'SUSPENDED']).map((s) => ({
            value: s,
            label: s.charAt(0) + s.slice(1).toLowerCase(),
          }))}
        />
        <Input
          label={includePassword ? 'Initial password' : 'Reset password'}
          type="password"
          hint={
            includePassword
              ? 'Optional — the account is created with a temporary password if you leave this empty.'
              : 'Leave blank to keep the current password.'
          }
          error={fieldErrors.password}
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          placeholder="Minimum 8 characters"
        />
      </div>

      {editingId === sessionUser?.id ? (
        <p className="text-xs text-ink-500">
          This is your own account. The server rejects attempts to change your own role or to
          deactivate yourself.
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Create accounts, assign roles and departments, and keep the working state of every person on the portal accurate."
        actions={
          can('users.manage') ? (
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
              Add user
            </Button>
          ) : null
        }
      />

      {/* ------------------------------------------------------- summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total users"
          value={formatNumber(total)}
          icon={<UsersIcon className="h-5 w-5" />}
          hint="Accounts matching the current filters"
          tone="brand"
        />
        <StatCard
          title="Active accounts"
          value={formatNumber(activeOnPage)}
          icon={<UserCheck className="h-5 w-5" />}
          hint="On this page"
          tone="emerald"
        />
        <StatCard
          title="Pending reviews"
          value={formatNumber(pendingReviewsOnPage)}
          icon={<ShieldCheck className="h-5 w-5" />}
          hint="On this page — summed across the reviewers listed"
          tone="amber"
        />
        <StatCard
          title="Departments covered"
          value={meta?.departments.length ?? 0}
          icon={<UserPlus className="h-5 w-5" />}
          hint="Departments available in the institution directory"
          tone="violet"
        />
      </div>

      <Card>
        <FilterBar>
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              aria-hidden
            />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or email…"
              aria-label="Search users"
              className="input-base pl-9"
            />
          </div>

          <Select
            aria-label="Filter by role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="All roles"
            options={(meta?.roles ?? []).map((r) => ({ value: r.value, label: r.label }))}
            wrapperClassName="w-full sm:w-52"
          />

          <Select
            aria-label="Filter by department"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            placeholder="All departments"
            options={(meta?.departments ?? []).map((d) => ({
              value: String(d.id),
              label: `${d.code} — ${d.name}`,
            }))}
            wrapperClassName="w-full sm:w-56"
          />

          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="All statuses"
            options={(meta?.statuses ?? []).map((s) => ({
              value: s,
              label: s.charAt(0) + s.slice(1).toLowerCase(),
            }))}
            wrapperClassName="w-full sm:w-40"
          />

          {hasFilters ? (
            <Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </FilterBar>

        {hasFilters ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Applied</span>
            {searchInput ? <MetaChip>Search: {searchInput}</MetaChip> : null}
            {role ? <MetaChip>Role: {roleLabel(role)}</MetaChip> : null}
            {departmentId ? (
              <MetaChip>
                Department:{' '}
                {meta?.departments.find((d) => String(d.id) === departmentId)?.name ?? departmentId}
              </MetaChip>
            ) : null}
            {status ? <MetaChip>Status: {status}</MetaChip> : null}
          </div>
        ) : null}

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <TableSkeleton rows={6} cols={7} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No users found"
            description={
              hasFilters
                ? 'No account matches the filters you have applied. Try widening the search.'
                : 'No account has been created yet. Add the first user to get started.'
            }
            icon={<UsersIcon className="h-6 w-6" />}
            action={
              can('users.manage') ? (
                <Button variant="primary" size="sm" onClick={openAdd}>
                  Add user
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <TableWrapper>
              <table className="min-w-full divide-y divide-ink-200">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2.5">User</th>
                    <th className="px-4 py-2.5">Role</th>
                    <th className="px-4 py-2.5">Department</th>
                    <th className="px-4 py-2.5">Designation</th>
                    <th className="px-4 py-2.5">Projects leading</th>
                    <th className="px-4 py-2.5">Pending reviews</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Last login</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map((row) => {
                    const action = statusAction(row);
                    return (
                      <tr key={row.id} className="transition hover:bg-ink-50">
                        <td className="table-cell whitespace-normal">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                              {initials(row.full_name)}
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium text-ink-900">{row.full_name}</p>
                              <p className="text-xs text-ink-500">{row.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="table-cell">
                          <Badge tone="info">{roleLabel(row.role)}</Badge>
                        </td>
                        <td className="table-cell">{row.department_name ?? '—'}</td>
                        <td className="table-cell">{row.designation ?? '—'}</td>
                        <td className="table-cell">{row.projects_leading ?? 0}</td>
                        <td className="table-cell">
                          {row.pending_reviews > 0 ? (
                            <Badge tone="warning">{row.pending_reviews}</Badge>
                          ) : (
                            <span className="text-ink-400">0</span>
                          )}
                        </td>
                        <td className="table-cell">
                          <Badge tone={STATUS_TONES[row.status] ?? 'neutral'} dot>
                            {row.status.charAt(0) + row.status.slice(1).toLowerCase()}
                          </Badge>
                        </td>
                        <td className="table-cell">{formatDateTime(row.last_login_at)}</td>
                        <td className="table-cell text-right">
                          <Dropdown
                            align="right"
                            trigger={
                              <span
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
                                aria-hidden
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </span>
                            }
                          >
                            {(close) => (
                              <div>
                                <DropdownLabel>Actions</DropdownLabel>
                                <DropdownItem
                                  icon={<Eye className="h-4 w-4" />}
                                  onClick={() => {
                                    close();
                                    openView(row);
                                  }}
                                >
                                  View profile
                                </DropdownItem>
                                {can('users.manage') ? (
                                  <DropdownItem
                                    icon={<Pencil className="h-4 w-4" />}
                                    onClick={() => {
                                      close();
                                      openEdit(row);
                                    }}
                                  >
                                    Edit user
                                  </DropdownItem>
                                ) : null}
                                {can('users.manage') ? (
                                  <>
                                    <DropdownDivider />
                                    <DropdownItem
                                      icon={action.icon}
                                      onClick={() => {
                                        close();
                                        setStatusTarget({ row, next: action.next });
                                      }}
                                    >
                                      {action.label}
                                    </DropdownItem>
                                    {row.status !== 'SUSPENDED' ? (
                                      <DropdownItem
                                        danger
                                        icon={<UserX className="h-4 w-4" />}
                                        onClick={() => {
                                          close();
                                          setStatusTarget({ row, next: 'SUSPENDED' });
                                        }}
                                      >
                                        Suspend account
                                      </DropdownItem>
                                    ) : null}
                                  </>
                                ) : null}
                              </div>
                            )}
                          </Dropdown>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrapper>

            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              itemLabel="users"
            />
          </>
        )}
      </Card>

      {/* ---------------------------------------------------------- add user */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add user"
        description="Create a portal account and assign its role and department."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={submitAdd}>
              Create user
            </Button>
          </>
        }
      >
        {userFormBody(true)}
      </Modal>

      {/* ---------------------------------------------------------- edit user */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit user"
        description="Update the account details. Leave the password blank to keep the current one."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={submitEdit}>
              Save changes
            </Button>
          </>
        }
      >
        {userFormBody(false)}
      </Modal>

      {/* --------------------------------------------------------- view profile */}
      <Modal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title="User profile"
        description="Account record and the most recent activity recorded against it."
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setViewOpen(false)}>
            Close
          </Button>
        }
      >
        {detailLoading ? (
          <p className="py-6 text-center text-sm text-ink-500">Loading profile…</p>
        ) : detailError ? (
          <ErrorState message={detailError} onRetry={reloadDetail} />
        ) : detail ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                {initials(detail.user.full_name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">{detail.user.full_name}</p>
                <p className="truncate text-xs text-ink-500">{detail.user.email}</p>
              </div>
              <div className="ml-auto">
                <Badge tone={STATUS_TONES[detail.user.status] ?? 'neutral'} dot>
                  {detail.user.status}
                </Badge>
              </div>
            </div>

            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Role</dt>
                <dd className="mt-0.5 text-sm text-ink-800">{roleLabel(detail.user.role)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Department</dt>
                <dd className="mt-0.5 text-sm text-ink-800">{detail.user.department_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Designation</dt>
                <dd className="mt-0.5 text-sm text-ink-800">{detail.user.designation ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Phone</dt>
                <dd className="mt-0.5 text-sm text-ink-800">{detail.user.phone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Created</dt>
                <dd className="mt-0.5 text-sm text-ink-800">{formatDateTime(detail.user.created_at)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Last login</dt>
                <dd className="mt-0.5 text-sm text-ink-800">{formatDateTime(detail.user.last_login_at)}</dd>
              </div>
            </dl>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                Recent activity
              </p>
              {detail.activity.length === 0 ? (
                <p className="text-sm text-ink-500">No activity has been recorded for this account.</p>
              ) : (
                <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
                  {detail.activity.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm text-ink-800">
                          <span className="font-medium text-ink-900">{a.actor_name ?? 'System'}</span>{' '}
                          {a.action.replace(/_/g, ' ').toLowerCase()}
                          {a.entity_code ? (
                            <>
                              {' '}
                              <span className="font-medium text-ink-700">{a.entity_code}</span>
                            </>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {a.entity_type} · {formatDateTime(a.created_at)}
                        </p>
                      </div>
                      {a.to_status ? <Badge tone="neutral">{a.to_status}</Badge> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <Field label="Profile">
            <p className="text-sm text-ink-500">No profile loaded.</p>
          </Field>
        )}
      </Modal>

      {/* ------------------------------------------------------ status confirm */}
      <ConfirmDialog
        open={statusTarget !== null}
        title={
          statusTarget?.next === 'SUSPENDED'
            ? 'Suspend account'
            : statusTarget?.next === 'INACTIVE'
              ? 'Deactivate account'
              : 'Activate account'
        }
        message={
          <>
            <p>
              {statusTarget?.next === 'ACTIVE'
                ? 'Reactivate'
                : statusTarget?.next === 'SUSPENDED'
                  ? 'Suspend'
                  : 'Deactivate'}{' '}
              <span className="font-semibold text-ink-900">{statusTarget?.row.full_name}</span>
              {statusTarget?.next === 'ACTIVE' ? '' : ' and revoke their active sessions'}.
            </p>
            <p className="mt-2 text-ink-600">
              The account keeps all of its history and can be reactivated later.
            </p>
          </>
        }
        confirmLabel="Confirm"
        tone={statusTarget?.next === 'ACTIVE' ? 'primary' : 'danger'}
        loading={statusSaving}
        onConfirm={applyStatus}
        onCancel={() => setStatusTarget(null)}
      />
    </div>
  );
}
