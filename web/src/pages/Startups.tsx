import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  Layers,
  Lightbulb,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAsync, useDebounced, usePaged } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { formatNumber } from '../lib/format';
import { label } from '../lib/constants';
import {
  Button,
  Card,
  ConfirmDialog,
  Dropdown,
  DropdownDivider,
  DropdownItem,
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
import { FilterBar, InlineProgress, MetaChip, StatusBadge } from '../components/common';

export interface StartupRow {
  id: number;
  startup_code: string;
  name: string;
  founder_user_id: number | null;
  related_project_id: number | null;
  industry: string;
  stage: string;
  description: string | null;
  problem: string | null;
  solution: string | null;
  support_required: string | null;
  application_date: string | null;
  status: string;
  progress: number;
  created_at: string;
  updated_at: string;
  founder_name: string | null;
  project_code: string | null;
  project_title: string | null;
  department_name: string | null;
  mentor_user_id: number | null;
  mentor_name: string | null;
  milestone_count: number;
  milestone_done: number;
  document_count: number;
}

interface StartupMeta {
  stages: string[];
  industries: Array<{ industry: string }>;
  eligibleProjects: Array<{ id: number; project_code: string; title: string; status: string }>;
  mentors: Array<{
    id: number;
    user_id: number;
    full_name: string;
    expertise: string;
    industries: string;
    max_startups: number;
    assigned: number;
  }>;
}

interface DashboardKpis {
  kpis: Record<string, number>;
}

const LINK_PRIMARY =
  'inline-flex h-9.5 items-center gap-2 rounded-lg bg-brand-600 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700';

export default function Startups() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [industry, setIndustry] = useState('');
  const debouncedSearch = useDebounced(search, 350);

  const list = usePaged<StartupRow>(
    '/startups',
    { search: debouncedSearch, stage, industry },
    10,
  );

  const meta = useAsync<StartupMeta>(() => api.get<StartupMeta>('/startups/meta'), []);
  const kpis = useAsync<DashboardKpis>(() => api.get<DashboardKpis>('/dashboard'), []);

  // Stage modal state
  const [stageTarget, setStageTarget] = useState<StartupRow | null>(null);
  const [nextStage, setNextStage] = useState('');
  const [nextProgress, setNextProgress] = useState('');
  const [savingStage, setSavingStage] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<StartupRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Reset to page 1 whenever the debounced search term changes.
  const previousSearch = useRef(debouncedSearch);
  useEffect(() => {
    if (previousSearch.current === debouncedSearch) return;
    previousSearch.current = debouncedSearch;
    list.setPage(1);
  }, [debouncedSearch]);

  const rows = list.data?.data ?? [];
  const stageOptions = (meta.data?.stages ?? []).map((s) => ({ value: s, label: label(s) }));
  const industryOptions = (meta.data?.industries ?? []).map((i) => ({
    value: i.industry,
    label: i.industry,
  }));

  const hasFilters = Boolean(search || stage || industry);
  const kpi = kpis.data?.kpis ?? {};

  const openStageModal = (row: StartupRow) => {
    setStageTarget(row);
    setNextStage(row.stage);
    setNextProgress(String(row.progress ?? 0));
    setStageError(null);
  };

  const submitStage = async () => {
    if (!stageTarget) return;
    setSavingStage(true);
    setStageError(null);
    try {
      const body: { stage: string; progress?: number } = { stage: nextStage };
      const parsed = Number(nextProgress);
      if (!Number.isNaN(parsed) && nextProgress !== '') body.progress = parsed;
      await api.patch(`/startups/${stageTarget.id}/stage`, body);
      toast.success('Incubation stage updated', `${stageTarget.name} is now at ${label(nextStage)}.`);
      setStageTarget(null);
      list.reload();
      kpis.reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not update the incubation stage.';
      setStageError(message);
      toast.error('Stage update failed', message);
    } finally {
      setSavingStage(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/startups/${deleteTarget.id}`);
      toast.success('Application deleted', `${deleteTarget.name} was removed from the pipeline.`);
      setDeleteTarget(null);
      list.reload();
      kpis.reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not delete this application.';
      toast.error('Delete failed', message);
    } finally {
      setDeleting(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStage('');
    setIndustry('');
    list.setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Startup Incubation"
        description="Track venture applications from first submission through incubation, seed and graduation. Startup incubation is one possible route out of a research project — projects do not have to become companies."
        actions={
          <>
            <Button
              variant="outline"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => {
                list.reload();
                meta.reload();
                kpis.reload();
              }}
            >
              Refresh
            </Button>
            {can('startup.register') ? (
              <Link to="/startups/new" className={LINK_PRIMARY}>
                <Plus className="h-4 w-4" />
                Register startup
              </Link>
            ) : null}
          </>
        }
      />

      {/* Summary cards — sourced from the shared dashboard KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Registered startups"
          value={formatNumber(kpi.startupsTotal ?? 0)}
          icon={<Lightbulb className="h-5 w-5" />}
          hint="All venture applications on record"
          tone="brand"
        />
        <StatCard
          title="Under review"
          value={formatNumber(kpi.startupsUnderReview ?? 0)}
          icon={<Layers className="h-5 w-5" />}
          hint="Applications awaiting a decision"
          tone="amber"
        />
        <StatCard
          title="Incubating"
          value={formatNumber(kpi.startupsIncubated ?? 0)}
          icon={<Building2 className="h-5 w-5" />}
          hint="Startups currently in incubation"
          tone="emerald"
        />
        <StatCard
          title="Active mentorships"
          value={formatNumber(kpi.activeMentorships ?? 0)}
          icon={<Users className="h-5 w-5" />}
          hint="Mentor assignments in progress"
          tone="violet"
        />
      </div>

      <Card>
        <FilterBar>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              aria-label="Search startups"
              placeholder="Search by name or startup code…"
              className="pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                list.setPage(1);
              }}
            />
          </div>

          <Select
            aria-label="Filter by stage"
            className="w-full sm:w-48"
            placeholder="All stages"
            options={stageOptions}
            value={stage}
            onChange={(e) => {
              setStage(e.target.value);
              list.setPage(1);
            }}
          />

          <Select
            aria-label="Filter by industry"
            className="w-full sm:w-48"
            placeholder="All industries"
            options={industryOptions}
            value={industry}
            onChange={(e) => {
              setIndustry(e.target.value);
              list.setPage(1);
            }}
          />

          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}

          <p className="ml-auto text-xs text-ink-500">
            {list.total} {list.total === 1 ? 'startup' : 'startups'} visible to you
          </p>
        </FilterBar>

        {list.loading && !list.data ? (
          <TableSkeleton rows={6} cols={7} />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No startups match these filters' : 'No startups registered yet'}
            description={
              hasFilters
                ? 'Try a different search term, stage or industry — or clear the filters to see everything you can access.'
                : 'Register the first venture application to start tracking it through the incubation pipeline.'
            }
            icon={<Lightbulb className="h-6 w-6" />}
            action={
              can('startup.register') ? (
                <Link to="/startups/new" className={LINK_PRIMARY}>
                  <Plus className="h-4 w-4" />
                  Register startup
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
                    <th className="px-4 py-2.5">Startup</th>
                    <th className="px-4 py-2.5">Industry</th>
                    <th className="px-4 py-2.5">Stage</th>
                    <th className="px-4 py-2.5">Founder</th>
                    <th className="px-4 py-2.5">Linked project</th>
                    <th className="px-4 py-2.5">Mentor</th>
                    <th className="px-4 py-2.5">Milestones</th>
                    <th className="px-4 py-2.5">Progress</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map((row) => {
                    const milestonePct =
                      row.milestone_count > 0
                        ? Math.round((row.milestone_done / row.milestone_count) * 100)
                        : 0;
                    return (
                      <tr key={row.id} className="transition hover:bg-ink-50">
                        <td className="table-cell">
                          <Link
                            to={`/startups/${row.id}`}
                            className="font-medium text-ink-900 hover:text-brand-700"
                          >
                            {row.name}
                          </Link>
                          <p className="text-xs text-ink-500">{row.startup_code}</p>
                        </td>
                        <td className="table-cell">{row.industry}</td>
                        <td className="table-cell">
                          <StatusBadge status={row.stage} />
                        </td>
                        <td className="table-cell">{row.founder_name ?? '—'}</td>
                        <td className="table-cell">
                          {row.project_code ? (
                            <MetaChip>{row.project_code}</MetaChip>
                          ) : (
                            <span className="text-ink-400">Not linked</span>
                          )}
                        </td>
                        <td className="table-cell">{row.mentor_name ?? '—'}</td>
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-ink-700">
                              {row.milestone_done}/{row.milestone_count}
                            </span>
                            <InlineProgress value={milestonePct} />
                          </div>
                        </td>
                        <td className="table-cell">
                          <InlineProgress value={row.progress ?? 0} />
                        </td>
                        <td className="table-cell text-right">
                          <Dropdown
                            align="right"
                            trigger={
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-800">
                                <MoreHorizontal className="h-4 w-4" />
                              </span>
                            }
                          >
                            {(close) => (
                              <>
                                <DropdownItem
                                  icon={<Building2 className="h-4 w-4" />}
                                  onClick={() => {
                                    close();
                                    navigate(`/startups/${row.id}`);
                                  }}
                                >
                                  View details
                                </DropdownItem>
                                {can('startup.manage') ? (
                                  <>
                                    <DropdownItem
                                      icon={<Pencil className="h-4 w-4" />}
                                      onClick={() => {
                                        close();
                                        navigate(`/startups/${row.id}/edit`);
                                      }}
                                    >
                                      Edit startup
                                    </DropdownItem>
                                    <DropdownItem
                                      icon={<Repeat className="h-4 w-4" />}
                                      onClick={() => {
                                        close();
                                        openStageModal(row);
                                      }}
                                    >
                                      Change stage
                                    </DropdownItem>
                                  </>
                                ) : null}
                                {can('startup.manage') && row.stage === 'APPLIED' ? (
                                  <>
                                    <DropdownDivider />
                                    <DropdownItem
                                      danger
                                      icon={<Trash2 className="h-4 w-4" />}
                                      onClick={() => {
                                        close();
                                        setDeleteTarget(row);
                                      }}
                                    >
                                      Delete application
                                    </DropdownItem>
                                  </>
                                ) : null}
                              </>
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
              page={list.page}
              pageSize={list.pageSize}
              total={list.total}
              totalPages={list.totalPages}
              onPageChange={list.setPage}
              onPageSizeChange={list.setPageSize}
              itemLabel="startups"
            />
          </>
        )}
      </Card>

      {/* Change incubation stage */}
      <Modal
        open={stageTarget !== null}
        onClose={() => setStageTarget(null)}
        title="Change incubation stage"
        description={
          stageTarget
            ? `Move ${stageTarget.name} to a new stage and optionally update its progress.`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setStageTarget(null)} disabled={savingStage}>
              Cancel
            </Button>
            <Button onClick={submitStage} loading={savingStage} disabled={!nextStage}>
              Save stage
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {stageError ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {stageError}
            </p>
          ) : null}
          <Select
            label="Incubation stage"
            required
            options={stageOptions}
            value={nextStage}
            onChange={(e) => setNextStage(e.target.value)}
          />
          <Input
            label="Progress (%)"
            type="number"
            min={0}
            max={100}
            hint="Whole number between 0 and 100. Leave unchanged to keep the current value."
            value={nextProgress}
            onChange={(e) => setNextProgress(e.target.value)}
          />
        </div>
      </Modal>

      {/* Delete application */}
      <ConfirmDialog
        open={deleteTarget !== null}
        tone="danger"
        title="Delete startup application"
        confirmLabel="Delete application"
        cancelLabel="Keep application"
        loading={deleting}
        message={
          <>
            <p>
              This permanently removes the application{' '}
              <span className="font-semibold text-ink-900">{deleteTarget?.name}</span> (
              {deleteTarget?.startup_code}) together with its team, milestones, documents and
              mentorship records.
            </p>
            <p className="mt-2">Only applications still at the “Applied” stage can be deleted.</p>
          </>
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </div>
  );
}
