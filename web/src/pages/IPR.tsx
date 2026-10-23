import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  Eye,
  FileText,
  MoreVertical,
  Pencil,
  Plus,
  Scale,
  ShieldCheck,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAsync, useDebounced, usePaged } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { daysRemainingLabel, formatDate, formatNumber } from '../lib/format';
import { IPR_TYPE_LABELS, label } from '../lib/constants';
import {
  Badge,
  Button,
  Card,
  CardBody,
  Dropdown,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  EmptyState,
  ErrorState,
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
import type { BadgeTone } from '../components/ui';
import { FilterBar, NoticeBanner, StatusBadge } from '../components/common';

type DeadlineState = 'NONE' | 'OVERDUE' | 'URGENT' | 'UPCOMING';

export interface IprRow {
  id: number;
  ipr_code: string;
  title: string;
  ipr_type: string;
  description: string | null;
  status: string;
  disclosure_date: string | null;
  filing_date: string | null;
  next_deadline: string | null;
  ipr_officer_id: number | null;
  notes: string | null;
  project_id: number | null;
  project_code: string | null;
  project_title: string | null;
  officer_name: string | null;
  department_name: string | null;
  inventor_names: string | null;
  document_count: number;
  days_to_deadline: number | null;
  deadline_state: DeadlineState;
}

interface IprMeta {
  types: string[];
  statuses: string[];
  transitions: Record<string, string[]>;
  officers: Array<{ id: number; full_name: string; email: string }>;
  eligibleProjects: Array<{
    id: number;
    project_code: string;
    title: string;
    status: string;
  }>;
}

interface DashboardKpis {
  kpis: Record<string, number>;
}

const DEADLINE_TONES: Record<DeadlineState, BadgeTone> = {
  NONE: 'neutral',
  OVERDUE: 'danger',
  URGENT: 'warning',
  UPCOMING: 'info',
};

const DEADLINE_TEXT: Record<DeadlineState, string> = {
  NONE: 'No deadline',
  OVERDUE: 'Overdue',
  URGENT: 'Due soon',
  UPCOMING: 'Upcoming',
};

export default function IPR() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [deadlineFrom, setDeadlineFrom] = useState('');
  const [deadlineTo, setDeadlineTo] = useState('');
  const debouncedSearch = useDebounced(search, 300);

  const params = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      type: type || undefined,
      status: status || undefined,
      deadlineFrom: deadlineFrom || undefined,
      deadlineTo: deadlineTo || undefined,
    }),
    [debouncedSearch, type, status, deadlineFrom, deadlineTo],
  );

  const list = usePaged<IprRow>('/ipr', params);
  const meta = useAsync<IprMeta>(() => api.get<IprMeta>('/ipr/meta'), []);
  const dash = useAsync<DashboardKpis>(() => api.get<DashboardKpis>('/dashboard'), []);

  const rows = list.data?.data ?? [];
  const types = meta.data?.types ?? [];
  const statuses = meta.data?.statuses ?? [];
  const officers = meta.data?.officers ?? [];
  const kpis = dash.data?.kpis ?? {};

  const [assignTarget, setAssignTarget] = useState<IprRow | null>(null);
  const [assignOfficerId, setAssignOfficerId] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<IprRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canCreate = can('ipr.create');
  const canManageAny = can('ipr.update.any');

  function resetFilters() {
    setSearch('');
    setType('');
    setStatus('');
    setDeadlineFrom('');
    setDeadlineTo('');
    list.setPage(1);
  }

  function openAssign(row: IprRow) {
    setAssignTarget(row);
    setAssignOfficerId(row.ipr_officer_id ? String(row.ipr_officer_id) : '');
    setAssignError(null);
  }

  async function submitAssign() {
    if (!assignTarget) return;
    if (!assignOfficerId) {
      setAssignError('Choose an IPR officer to assign.');
      return;
    }
    setAssigning(true);
    setAssignError(null);
    try {
      const res = await api.patch<{ message: string }>(`/ipr/${assignTarget.id}/assign`, {
        iprOfficerId: Number(assignOfficerId),
      });
      toast.success('Officer assigned', res.message);
      setAssignTarget(null);
      list.reload();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'Unable to assign the officer.');
    } finally {
      setAssigning(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await api.delete<{ message: string }>(`/ipr/${deleteTarget.id}`);
      toast.success('Draft deleted', res.message);
      setDeleteTarget(null);
      list.reload();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unable to delete this record.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="IPR Management"
        description="Registers intellectual property disclosures and tracks the administrative workflow, ownership and filing deadlines for every record. Status values describe internal workflow state only."
        actions={
          canCreate ? (
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => navigate('/ipr/new')}
            >
              New IPR record
            </Button>
          ) : null
        }
      />

      {/* Summary cards sourced from the dashboard KPIs so the numbers agree app-wide. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="IPR records"
          value={formatNumber(kpis.iprRecords ?? 0)}
          icon={<ShieldCheck className="h-5 w-5" />}
          hint="Total records on register"
          tone="brand"
        />
        <StatCard
          title="In review pipeline"
          value={formatNumber(kpis.iprUnderReview ?? 0)}
          icon={<Scale className="h-5 w-5" />}
          hint="Under evaluation to examination"
          tone="violet"
        />
        <StatCard
          title="Filed"
          value={formatNumber(kpis.iprFiled ?? 0)}
          icon={<FileText className="h-5 w-5" />}
          hint="Records marked as filed"
          tone="amber"
        />
        <StatCard
          title="Granted"
          value={formatNumber(kpis.iprGranted ?? 0)}
          icon={<ShieldCheck className="h-5 w-5" />}
          hint="Records with a granted outcome"
          tone="emerald"
        />
      </div>

      <Card>
        <FilterBar>
          <div className="w-full sm:w-64">
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                list.setPage(1);
              }}
              placeholder="Search title or IPR code…"
              aria-label="Search IPR records"
              className="h-9 py-0"
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                list.setPage(1);
              }}
              placeholder="All types"
              aria-label="Filter by IPR type"
              options={types.map((t) => ({ value: t, label: IPR_TYPE_LABELS[t] ?? label(t) }))}
              className="h-9 py-0"
            />
          </div>
          <div className="w-full sm:w-52">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                list.setPage(1);
              }}
              placeholder="All statuses"
              aria-label="Filter by status"
              options={statuses.map((s) => ({ value: s, label: label(s) }))}
              className="h-9 py-0"
            />
          </div>
          <div className="w-full sm:w-40">
            <Input
              type="date"
              value={deadlineFrom}
              onChange={(e) => {
                setDeadlineFrom(e.target.value);
                list.setPage(1);
              }}
              aria-label="Deadline from"
              className="h-9 py-0"
            />
          </div>
          <div className="w-full sm:w-40">
            <Input
              type="date"
              value={deadlineTo}
              onChange={(e) => {
                setDeadlineTo(e.target.value);
                list.setPage(1);
              }}
              aria-label="Deadline to"
              className="h-9 py-0"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={<X className="h-4 w-4" />}
            onClick={resetFilters}
            className="ml-auto"
          >
            Clear filters
          </Button>
        </FilterBar>

        {list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.loading && rows.length === 0 ? (
          <TableSkeleton rows={6} cols={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No IPR records found"
            description="No records match the current filters. Adjust the search or create a new IPR record."
            icon={<ShieldCheck className="h-6 w-6" />}
            action={
              canCreate ? (
                <Link
                  to="/ipr/new"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  <Plus className="h-4 w-4" />
                  New IPR record
                </Link>
              ) : null
            }
          />
        ) : (
          <>
            <TableWrapper>
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-2.5">IPR record</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Inventors</th>
                  <th className="px-4 py-2.5">Linked project</th>
                  <th className="px-4 py-2.5">Officer</th>
                  <th className="px-4 py-2.5">Next deadline</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((row) => (
                  <tr key={row.id} className="transition hover:bg-ink-50">
                    <td className="table-cell whitespace-normal">
                      <Link
                        to={`/ipr/${row.id}`}
                        className="font-medium text-ink-900 hover:text-brand-700"
                      >
                        {row.title}
                      </Link>
                      <p className="text-xs text-ink-500">
                        {row.ipr_code}
                        {row.document_count > 0 ? ` · ${row.document_count} doc(s)` : ''}
                      </p>
                    </td>
                    <td className="table-cell">
                      <Badge tone="neutral">{IPR_TYPE_LABELS[row.ipr_type] ?? row.ipr_type}</Badge>
                    </td>
                    <td className="table-cell whitespace-normal text-xs text-ink-600">
                      {row.inventor_names ?? '—'}
                    </td>
                    <td className="table-cell">
                      {row.project_code ? (
                        <span className="text-xs font-medium text-ink-700">{row.project_code}</span>
                      ) : (
                        <span className="text-xs text-ink-400">Not linked</span>
                      )}
                    </td>
                    <td className="table-cell">{row.officer_name ?? 'Unassigned'}</td>
                    <td className="table-cell">
                      <div className="flex flex-col items-start gap-1">
                        <span className="flex items-center gap-1.5 text-xs text-ink-700">
                          <CalendarClock className="h-3.5 w-3.5 text-ink-400" aria-hidden />
                          {row.next_deadline ? formatDate(row.next_deadline) : '—'}
                        </span>
                        {row.deadline_state !== 'NONE' ? (
                          <Badge tone={DEADLINE_TONES[row.deadline_state] ?? 'neutral'}>
                            {DEADLINE_TEXT[row.deadline_state] ?? row.deadline_state} ·{' '}
                            {daysRemainingLabel(row.days_to_deadline)}
                          </Badge>
                        ) : (
                          <Badge tone="neutral">No deadline</Badge>
                        )}
                      </div>
                    </td>
                    <td className="table-cell">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="table-cell text-right">
                      <Dropdown
                        align="right"
                        trigger={
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-800">
                            <MoreVertical className="h-4 w-4" />
                          </span>
                        }
                      >
                        <DropdownLabel>Actions</DropdownLabel>
                        <DropdownItem
                          icon={<Eye className="h-4 w-4" />}
                          onClick={() => navigate(`/ipr/${row.id}`)}
                        >
                          View record
                        </DropdownItem>
                        {can('ipr.update.any') || can('ipr.update.assigned') ? (
                          <DropdownItem
                            icon={<Pencil className="h-4 w-4" />}
                            onClick={() => navigate(`/ipr/${row.id}/edit`)}
                          >
                            Edit record
                          </DropdownItem>
                        ) : null}
                        {canManageAny ? (
                          <DropdownItem icon={<UserCog className="h-4 w-4" />} onClick={() => openAssign(row)}>
                            Assign officer
                          </DropdownItem>
                        ) : null}
                        {canManageAny && row.status === 'DRAFT' ? (
                          <>
                            <DropdownDivider />
                            <DropdownItem
                              icon={<Trash2 className="h-4 w-4" />}
                              danger
                              onClick={() => {
                                setDeleteTarget(row);
                                setDeleteError(null);
                              }}
                            >
                              Delete draft
                            </DropdownItem>
                          </>
                        ) : null}
                      </Dropdown>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrapper>
            <Pagination
              page={list.page}
              pageSize={list.pageSize}
              total={list.total}
              totalPages={list.totalPages}
              onPageChange={list.setPage}
              onPageSizeChange={list.setPageSize}
              itemLabel="IPR records"
            />
          </>
        )}
      </Card>

      <NoticeBanner tone="info" title="Administrative scope only">
        <p>
          Status values are administrative workflow states only. A record marked{' '}
          <span className="font-semibold">Approved for filing</span>, <span className="font-semibold">Filed</span> or{' '}
          <span className="font-semibold">Granted</span> reflects where the record sits in the internal process — it is not a
          legal determination of patentability, filing eligibility or grant by any authority. Legal clearance must be
          obtained separately.
        </p>
      </NoticeBanner>

      {/* Assign officer */}
      <Modal
        open={Boolean(assignTarget)}
        onClose={() => setAssignTarget(null)}
        title="Assign IPR officer"
        description={
          assignTarget ? `Reassign ${assignTarget.ipr_code} to another IPR officer.` : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAssignTarget(null)} disabled={assigning}>
              Cancel
            </Button>
            <Button loading={assigning} onClick={submitAssign}>
              Assign officer
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select
            label="IPR officer"
            required
            value={assignOfficerId}
            onChange={(e) => setAssignOfficerId(e.target.value)}
            placeholder="Select an officer"
            options={officers.map((o) => ({ value: o.id, label: `${o.full_name} (${o.email})` }))}
          />
          {assignError ? (
            <p className="text-xs font-medium text-rose-600" role="alert">
              {assignError}
            </p>
          ) : null}
        </div>
      </Modal>

      {/* Delete draft */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete draft IPR record"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} onClick={confirmDelete}>
              Delete record
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-700">
          Deleting <span className="font-semibold">{deleteTarget?.ipr_code}</span> —{' '}
          {deleteTarget?.title} — removes the record and its inventor list permanently. Only draft records can be
          deleted.
        </p>
        {deleteError ? (
          <p className="mt-3 text-xs font-medium text-rose-600" role="alert">
            {deleteError}
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
