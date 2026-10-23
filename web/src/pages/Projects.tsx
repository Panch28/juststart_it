import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  CheckCircle2,
  Eye,
  FlaskConical,
  Lightbulb,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAsync, useDebounced, usePaged } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { formatCurrency, formatDate, formatNumber } from '../lib/format';
import { label } from '../lib/constants';
import { FilterBar, InlineProgress, MetaChip, StatusBadge } from '../components/common';
import {
  Badge,
  Button,
  Card,
  Dropdown,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Select,
  StatCard,
  TableSkeleton,
  TableWrapper,
} from '../components/ui';

interface ProjectRow {
  id: number;
  project_code: string;
  title: string;
  description: string;
  domain: string;
  category: string;
  department_id: number;
  principal_investigator_id: number;
  start_date: string;
  expected_completion_date: string;
  funding_required: number;
  objectives: string;
  expected_outcomes: string;
  status: string;
  progress: number;
  submitted_at: string | null;
  approved_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  pi_name: string;
  department_name: string;
  department_code: string;
  team_count: number;
  document_count: number;
  ipr_count: number;
}

interface ProjectsMeta {
  departments: Array<{ id: number; code: string; name: string }>;
  investigators: Array<{
    id: number;
    full_name: string;
    email: string;
    department_name: string | null;
  }>;
  categories: Array<{ category: string }>;
  domains: Array<{ domain: string }>;
  statuses: string[];
  transitions: Record<string, string[]>;
}

interface DashboardResponse {
  kpis: {
    totalProjects?: number;
    activeProjects?: number;
    completedProjects?: number;
    draftProjects?: number;
    pendingApprovals?: number;
  };
}

/** A project may only spawn an IPR record or a startup once it is approved. */
const IPR_ELIGIBLE_STATUSES = ['APPROVED', 'ACTIVE', 'COMPLETED'];

const SORT_OPTIONS = [
  { value: 'created', label: 'Newest first' },
  { value: 'title', label: 'Title (A–Z)' },
  { value: 'status', label: 'Status' },
  { value: 'progress', label: 'Progress' },
  { value: 'funding', label: 'Funding (high → low)' },
];

export default function Projects() {
  const { can } = useAuth();
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [category, setCategory] = useState('');
  const [mine, setMine] = useState(false);
  const [sort, setSort] = useState('created');

  const search = useDebounced(searchInput, 350);

  const params = useMemo(
    () => ({
      search: search || undefined,
      status: status || undefined,
      departmentId: departmentId || undefined,
      category: category || undefined,
      mine: mine ? true : undefined,
      sort,
    }),
    [search, status, departmentId, category, mine, sort],
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
  } = usePaged<ProjectRow>('/projects', params, 10);

  const { data: meta } = useAsync<ProjectsMeta>(() => api.get<ProjectsMeta>('/projects/meta'), []);
  const { data: dashboard } = useAsync<DashboardResponse>(
    () => api.get<DashboardResponse>('/dashboard'),
    [],
  );

  const kpis = dashboard?.kpis ?? {};
  const rows = data?.data ?? [];
  const hasFilters = Boolean(searchInput || status || departmentId || category || mine);

  // Every filter change also returns the user to the first page of results.
  const onSearch = (value: string) => {
    setSearchInput(value);
    setPage(1);
  };
  const onStatus = (value: string) => {
    setStatus(value);
    setPage(1);
  };
  const onDepartment = (value: string) => {
    setDepartmentId(value);
    setPage(1);
  };
  const onCategory = (value: string) => {
    setCategory(value);
    setPage(1);
  };
  const onSort = (value: string) => {
    setSort(value);
    setPage(1);
  };
  const onMine = () => {
    setMine((v) => !v);
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput('');
    setStatus('');
    setDepartmentId('');
    setCategory('');
    setMine(false);
    setPage(1);
  };

  const canEditAny = can('project.update.any') || can('project.update.own');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Research Projects"
        description="Register, track and steer every research project from the first draft through review, execution and completion — including the team, milestones, IPR and funding that grow out of it."
        actions={
          can('project.create') ? (
            <Link
              to="/projects/new"
              className="inline-flex h-9.5 items-center gap-2 rounded-lg bg-brand-600 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" aria-hidden />
              New Project
            </Link>
          ) : null
        }
        meta={
          <p className="text-xs text-ink-500">
            {loading && !data
              ? 'Loading projects…'
              : `${formatNumber(total)} ${total === 1 ? 'project' : 'projects'} match the current filters${
                  hasFilters ? '' : ' (no filters applied)'
                }.`}
          </p>
        }
      />

      {/* Portfolio KPIs come from the shared dashboard endpoint so the numbers agree with the rest of the app. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total projects"
          value={formatNumber(kpis.totalProjects ?? 0)}
          icon={<FlaskConical className="h-5 w-5" />}
          hint="All projects registered on the portal"
          tone="brand"
        />
        <StatCard
          title="Active / approved"
          value={formatNumber(kpis.activeProjects ?? 0)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          hint="Approved or currently running"
          tone="emerald"
        />
        <StatCard
          title="Completed"
          value={formatNumber(kpis.completedProjects ?? 0)}
          icon={<ShieldCheck className="h-5 w-5" />}
          hint="Finished research projects"
          tone="violet"
        />
        <StatCard
          title="Drafts"
          value={formatNumber(kpis.draftProjects ?? 0)}
          icon={<RotateCcw className="h-5 w-5" />}
          hint="Not yet submitted for review"
          tone="amber"
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
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search title or project code…"
              aria-label="Search projects"
              className="input-base pl-9"
            />
          </div>

          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => onStatus(e.target.value)}
            placeholder="All statuses"
            options={(meta?.statuses ?? []).map((s) => ({ value: s, label: label(s) }))}
            wrapperClassName="w-full sm:w-48"
          />

          <Select
            aria-label="Filter by department"
            value={departmentId}
            onChange={(e) => onDepartment(e.target.value)}
            placeholder="All departments"
            options={(meta?.departments ?? []).map((d) => ({
              value: String(d.id),
              label: `${d.code} — ${d.name}`,
            }))}
            wrapperClassName="w-full sm:w-56"
          />

          <Select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => onCategory(e.target.value)}
            placeholder="All categories"
            options={(meta?.categories ?? []).map((c) => ({ value: c.category, label: c.category }))}
            wrapperClassName="w-full sm:w-48"
          />

          <Select
            aria-label="Sort projects"
            value={sort}
            onChange={(e) => onSort(e.target.value)}
            options={SORT_OPTIONS}
            wrapperClassName="w-full sm:w-52"
          />

          <button
            type="button"
            onClick={onMine}
            aria-pressed={mine}
            className={clsx(
              'inline-flex h-9.5 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition',
              mine
                ? 'border-brand-300 bg-brand-50 text-brand-700'
                : 'border-ink-300 bg-white text-ink-600 hover:bg-ink-50',
            )}
          >
            <UserCheck className="h-4 w-4" aria-hidden />
            My projects
          </button>

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
            {status ? <MetaChip>Status: {label(status)}</MetaChip> : null}
            {departmentId ? (
              <MetaChip>
                Department:{' '}
                {meta?.departments.find((d) => String(d.id) === departmentId)?.name ?? departmentId}
              </MetaChip>
            ) : null}
            {category ? <MetaChip>Category: {category}</MetaChip> : null}
            {mine ? <MetaChip>Only my projects</MetaChip> : null}
          </div>
        ) : null}

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <TableSkeleton rows={6} cols={7} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No projects found"
            description={
              hasFilters
                ? 'No project matches the filters you have applied. Try widening the search.'
                : 'No research project has been registered yet. Create the first one to get started.'
            }
            icon={<FlaskConical className="h-6 w-6" />}
            action={
              can('project.create') ? (
                <Link
                  to="/projects/new"
                  className="inline-flex h-9.5 items-center gap-2 rounded-lg bg-brand-600 px-3.5 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Create first project
                </Link>
              ) : null
            }
          />
        ) : (
          <>
            <TableWrapper>
              <table className="min-w-full divide-y divide-ink-200">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2.5">Project</th>
                    <th className="px-4 py-2.5">Department</th>
                    <th className="px-4 py-2.5">Principal Investigator</th>
                    <th className="px-4 py-2.5">Funding required</th>
                    <th className="px-4 py-2.5">Progress</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Submitted</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map((row) => {
                    const iprAllowed = can('ipr.create') && IPR_ELIGIBLE_STATUSES.includes(row.status);
                    const startupAllowed =
                      can('startup.register') && IPR_ELIGIBLE_STATUSES.includes(row.status);
                    return (
                      <tr key={row.id} className="transition hover:bg-ink-50">
                        <td className="table-cell whitespace-normal">
                          <Link
                            to={`/projects/${row.id}`}
                            className="font-medium text-ink-900 hover:text-brand-700"
                          >
                            {row.title}
                          </Link>
                          <p className="mt-0.5 text-xs text-ink-500">
                            {row.project_code} · {row.domain} · {row.category}
                          </p>
                        </td>
                        <td className="table-cell">
                          <span className="block">{row.department_name}</span>
                          <span className="text-xs text-ink-500">{row.department_code}</span>
                        </td>
                        <td className="table-cell">{row.pi_name}</td>
                        <td className="table-cell font-medium text-ink-800">
                          {formatCurrency(row.funding_required, true)}
                        </td>
                        <td className="table-cell">
                          <InlineProgress value={row.progress ?? 0} />
                        </td>
                        <td className="table-cell">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="table-cell">{formatDate(row.submitted_at)}</td>
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
                                    navigate(`/projects/${row.id}`);
                                  }}
                                >
                                  View details
                                </DropdownItem>
                                {canEditAny ? (
                                  <DropdownItem
                                    icon={<Pencil className="h-4 w-4" />}
                                    onClick={() => {
                                      close();
                                      navigate(`/projects/${row.id}/edit`);
                                    }}
                                  >
                                    Edit project
                                  </DropdownItem>
                                ) : null}
                                {iprAllowed || startupAllowed ? <DropdownDivider /> : null}
                                {iprAllowed ? (
                                  <DropdownItem
                                    icon={<ShieldCheck className="h-4 w-4" />}
                                    onClick={() => {
                                      close();
                                      navigate(`/ipr/new?projectId=${row.id}`);
                                    }}
                                  >
                                    Create IPR record
                                  </DropdownItem>
                                ) : null}
                                {startupAllowed ? (
                                  <DropdownItem
                                    icon={<Lightbulb className="h-4 w-4" />}
                                    onClick={() => {
                                      close();
                                      navigate(`/startups/new?projectId=${row.id}`);
                                    }}
                                  >
                                    Register startup
                                  </DropdownItem>
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
              itemLabel="projects"
            />
          </>
        )}
      </Card>

      <p className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
        <Badge tone="neutral">Demo data</Badge>
        Every project shown is fictional sample data seeded into the demonstration database.
      </p>
    </div>
  );
}
