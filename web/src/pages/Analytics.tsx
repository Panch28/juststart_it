import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Clock,
  Download,
  FileSearch,
  Lightbulb,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../lib/api';
import type { Paged } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { formatCurrency, formatDate, formatNumber } from '../lib/format';
import { label, tone } from '../lib/constants';
import { NoticeBanner, StatusBadge } from '../components/common';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  TableSkeleton,
  TableWrapper,
} from '../components/ui';

/* ------------------------------------------------------------------ types */

interface DepartmentOutput {
  department: string;
  code: string;
  projects: number;
  approved: number;
  completed: number;
  funding_requested: number;
}

interface ApprovalCase {
  id: number;
  request_code: string;
  subject_type: string;
  current_stage: string;
  submitted_at: string;
  priority: string;
  days_pending: number;
  reviewer_name: string | null;
}

interface AnalyticsPayload {
  researchOutputByDepartment: DepartmentOutput[];
  completionRate: {
    rate: number;
    completed: number;
    total: number;
    approved: number;
    definition: string;
  };
  approvalProcessingTime: {
    averageDays: number;
    medianDays: number;
    decidedCount: number;
    definition: string;
  };
  pendingApprovals: {
    total: number;
    overdue: number;
    definition: string;
    cases: ApprovalCase[];
    overdueCases: ApprovalCase[];
  };
  iprPortfolio: {
    byStatus: Array<{ name: string; value: number }>;
    byType: Array<{ name: string; value: number }>;
  };
  upcomingIprDeadlines: Array<{
    id: number;
    ipr_code: string;
    title: string;
    ipr_type: string;
    next_deadline: string;
    status: string;
    days_remaining: number;
  }>;
  startupIncubation: {
    byStage: Array<{ name: string; value: number }>;
    progress: Array<{
      id: number;
      startup_code: string;
      name: string;
      stage: string;
      progress: number;
      milestones: number;
      milestones_done: number;
    }>;
  };
  funding: {
    bySource: Array<{
      name: string;
      requested: number;
      approved: number;
      received: number;
      records: number;
    }>;
    totals: { requested: number; approved: number; received: number };
    applications: { total: number; approved: number; rejected: number; open: number };
  };
  submissionTrends: {
    monthly: Array<{ period: string; submissions: number; approved: number; rejected: number }>;
    yearly: Array<{ period: string; submissions: number; approved: number }>;
  };
  filters: {
    departments: Array<{ id: number; name: string }>;
    domains: Array<{ domain: string }>;
    projectStatuses: Array<{ status: string }>;
    iprTypes: Array<{ ipr_type: string }>;
    startupStages: Array<{ stage: string }>;
  };
}

interface SimilarityMatch {
  id: number;
  code: string;
  title: string;
  description: string | null;
  status: string | null;
  /** The server exposes the cosine score as `similarity` (0-1). */
  similarity?: number;
  score?: number;
}

interface SimilarityResponse {
  project: {
    id: number;
    project_code: string;
    title: string;
    description: string | null;
    status: string;
  };
  similar: SimilarityMatch[];
  notice: string;
}

interface ProjectOption {
  id: number;
  project_code: string;
  title: string;
}

interface FilterDraft {
  departmentId: string;
  domain: string;
  status: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: FilterDraft = {
  departmentId: '',
  domain: '',
  status: '',
  from: '',
  to: '',
};

/** A pending approval is considered overdue by the server after 14 days. */
const OVERDUE_AFTER_DAYS = 14;

const PIE_COLORS = [
  '#3366f2',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ef4444',
  '#1a39b4',
  '#859ab9',
  '#598fff',
];

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #d5dce8',
  fontSize: 12,
} as const;

const AXIS_TICK = { fontSize: 11, fill: '#657ea1' } as const;

export default function Analytics() {
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterDraft>(EMPTY_FILTERS);
  const [similarProjectId, setSimilarProjectId] = useState('');

  const params = useMemo(
    () => ({
      departmentId: applied.departmentId || undefined,
      domain: applied.domain || undefined,
      status: applied.status || undefined,
      from: applied.from || undefined,
      to: applied.to || undefined,
    }),
    [applied],
  );

  const { data, loading, error, reload } = useAsync<AnalyticsPayload>(
    () => api.get<AnalyticsPayload>('/analytics', params),
    [JSON.stringify(params)],
  );

  // The project list powers the "similarity screening" project picker.
  const {
    data: projectList,
    loading: projectsLoading,
    error: projectsError,
    reload: reloadProjects,
  } = useAsync<Paged<ProjectOption>>(() => api.get<Paged<ProjectOption>>('/projects', { pageSize: 50 }), []);

  const similarState = useAsync<SimilarityResponse>(
    () => api.get<SimilarityResponse>(`/analytics/similar/${similarProjectId}`),
    [similarProjectId],
    { immediate: Boolean(similarProjectId) },
  );

  const exportUrl = useMemo(() => {
    const qs = new URLSearchParams();
    if (applied.departmentId) qs.set('departmentId', applied.departmentId);
    if (applied.domain) qs.set('domain', applied.domain);
    if (applied.status) qs.set('status', applied.status);
    if (applied.from) qs.set('from', applied.from);
    if (applied.to) qs.set('to', applied.to);
    const query = qs.toString();
    return `/api/analytics/export${query ? `?${query}` : ''}`;
  }, [applied]);

  const hasFilters = Object.values(applied).some(Boolean);
  const filters = data?.filters;

  const departmentChart = useMemo(
    () =>
      (data?.researchOutputByDepartment ?? []).map((d) => ({
        name: d.code || d.department,
        Projects: d.projects,
        Approved: d.approved,
        Completed: d.completed,
      })),
    [data],
  );

  const monthlyTrend = useMemo(
    () =>
      (data?.submissionTrends.monthly ?? []).map((m) => ({
        period: m.period,
        Submissions: m.submissions,
        Approved: m.approved,
        Rejected: m.rejected,
      })),
    [data],
  );

  const yearlyTrend = useMemo(
    () =>
      (data?.submissionTrends.yearly ?? []).map((y) => ({
        period: y.period,
        Submissions: y.submissions,
        Approved: y.approved,
      })),
    [data],
  );

  const iprStatusData = useMemo(
    () =>
      (data?.iprPortfolio.byStatus ?? []).map((s) => ({
        name: label(s.name),
        value: s.value,
        raw: s.name,
      })),
    [data],
  );

  const iprTypeData = useMemo(
    () =>
      (data?.iprPortfolio.byType ?? []).map((t) => ({
        name: label(t.name),
        value: t.value,
      })),
    [data],
  );

  const startupStageData = useMemo(
    () =>
      (data?.startupIncubation.byStage ?? []).map((s) => ({
        name: label(s.name),
        value: s.value,
      })),
    [data],
  );

  const fundingData = useMemo(
    () =>
      (data?.funding.bySource ?? []).map((f) => ({
        name: f.name,
        Requested: f.requested,
        Approved: f.approved,
        Received: f.received,
      })),
    [data],
  );

  const applyFilters = () => setApplied(draft);
  const resetFilters = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics & Reports"
        description="Institution-wide research output, approval throughput, IPR portfolio, incubation progress and funding — computed live from the portal records."
        actions={
          <>
            <Select
              aria-label="Filter by department"
              value={draft.departmentId}
              onChange={(e) => setDraft((d) => ({ ...d, departmentId: e.target.value }))}
              placeholder="All departments"
              options={(filters?.departments ?? []).map((d) => ({ value: String(d.id), label: d.name }))}
              wrapperClassName="w-full sm:w-48"
            />
            <Select
              aria-label="Filter by research domain"
              value={draft.domain}
              onChange={(e) => setDraft((d) => ({ ...d, domain: e.target.value }))}
              placeholder="All domains"
              options={(filters?.domains ?? []).map((d) => ({ value: d.domain, label: d.domain }))}
              wrapperClassName="w-full sm:w-44"
            />
            <Select
              aria-label="Filter by project status"
              value={draft.status}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
              placeholder="All statuses"
              options={(filters?.projectStatuses ?? []).map((s) => ({
                value: s.status,
                label: label(s.status),
              }))}
              wrapperClassName="w-full sm:w-40"
            />
            <Input
              type="date"
              aria-label="From date"
              value={draft.from}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              wrapperClassName="w-full sm:w-36"
            />
            <Input
              type="date"
              aria-label="To date"
              value={draft.to}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              wrapperClassName="w-full sm:w-36"
            />
            <Button variant="primary" size="md" onClick={applyFilters}>
              Apply
            </Button>
            <Button
              variant="ghost"
              size="md"
              icon={<RotateCcw className="h-4 w-4" />}
              onClick={resetFilters}
              disabled={!hasFilters && !Object.values(draft).some(Boolean)}
            >
              Reset
            </Button>
            <a
              href={exportUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9.5 items-center gap-2 rounded-lg border border-ink-300 bg-white px-3.5 text-sm font-semibold text-ink-700 transition hover:border-ink-400 hover:bg-ink-50"
            >
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </a>
          </>
        }
        meta={
          hasFilters ? (
            <p className="text-xs text-ink-500">
              Filters applied:{' '}
              {[
                applied.departmentId
                  ? filters?.departments.find((d) => String(d.id) === applied.departmentId)?.name
                  : null,
                applied.domain || null,
                applied.status ? label(applied.status) : null,
                applied.from || null,
                applied.to || null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : (
            <p className="text-xs text-ink-500">
              Showing the full dataset. Apply filters to narrow the reporting window.
            </p>
          )
        }
      />

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : null}

      {loading && !data ? (
        <Card>
          <Spinner label="Loading analytics…" />
        </Card>
      ) : null}

      {data ? (
        <>
          {/* ------------------------------------------------- summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Completion rate"
              value={`${data.completionRate.rate}%`}
              icon={<TrendingUp className="h-5 w-5" />}
              hint={data.completionRate.definition}
              tone="brand"
            />
            <StatCard
              title="Avg. approval processing time"
              value={`${data.approvalProcessingTime.averageDays} days`}
              icon={<Clock className="h-5 w-5" />}
              hint={`${data.approvalProcessingTime.definition} Median ${data.approvalProcessingTime.medianDays} days.`}
              tone="violet"
            />
            <StatCard
              title="Pending approvals"
              value={formatNumber(data.pendingApprovals.total)}
              icon={<BarChart3 className="h-5 w-5" />}
              hint={data.pendingApprovals.definition}
              tone="amber"
            />
            <StatCard
              title="Overdue approvals"
              value={formatNumber(data.pendingApprovals.overdue)}
              icon={<AlertTriangle className="h-5 w-5" />}
              hint={data.pendingApprovals.definition}
              tone="rose"
            />
          </div>

          {/* The definitions are repeated in full here because the stat-card hints are compact. */}
          <Card>
            <CardHeader
              title="How these metrics are defined"
              description="Definitions are supplied by the reporting service."
            />
            <CardBody className="grid gap-3 text-xs leading-relaxed text-ink-600 sm:grid-cols-3">
              <p>
                <span className="font-semibold text-ink-800">Completion rate — </span>
                {data.completionRate.definition}
              </p>
              <p>
                <span className="font-semibold text-ink-800">Approval processing time — </span>
                {data.approvalProcessingTime.definition}
              </p>
              <p>
                <span className="font-semibold text-ink-800">Pending approvals — </span>
                {data.pendingApprovals.definition}
              </p>
            </CardBody>
          </Card>

          {/* ------------------------------------------------------- charts */}
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Research output by department"
                description="Registered projects versus approved and completed"
              />
              <CardBody className="h-72">
                {departmentChart.length === 0 ? (
                  <EmptyState title="No departmental output" description="No research projects are registered." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={departmentChart} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eceff5" vertical={false} />
                      <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#d5dce8' }} />
                      <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Projects" fill="#3366f2" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="Approved" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="Completed" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="IPR portfolio by status" description="Records currently in each state" />
              <CardBody className="h-72">
                {iprStatusData.length === 0 ? (
                  <EmptyState title="No IPR records" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={iprStatusData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="52%"
                        outerRadius="80%"
                        paddingAngle={2}
                      >
                        {iprStatusData.map((entry, i) => (
                          <Cell key={entry.raw} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Submission trends"
                description="Monthly project submissions compared with approvals and rejections"
              />
              <CardBody className="h-72">
                {monthlyTrend.length === 0 ? (
                  <EmptyState title="No submission history" description="No submissions match the current filters." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyTrend} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eceff5" vertical={false} />
                      <XAxis dataKey="period" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#d5dce8' }} />
                      <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="Submissions" stroke="#3366f2" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Approved" stroke="#10b981" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Rejected" stroke="#ef4444" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="IPR portfolio by type" description="Records grouped by IPR type" />
              <CardBody className="h-72">
                {iprTypeData.length === 0 ? (
                  <EmptyState title="No IPR records" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={iprTypeData}
                      layout="vertical"
                      margin={{ top: 8, right: 16, bottom: 0, left: 12 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#eceff5" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" width={78} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="value" name="Records" fill="#1a39b4" radius={[0, 4, 4, 0]} maxBarSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader title="Startup incubation by stage" description="Registered startups per stage" />
              <CardBody className="h-64">
                {startupStageData.length === 0 ? (
                  <EmptyState title="No startups" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={startupStageData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="52%"
                        outerRadius="80%"
                        paddingAngle={2}
                      >
                        {startupStageData.map((entry, i) => (
                          <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader title="Funding by source" description="Requested, approved and received amounts" />
              <CardBody className="h-64">
                {fundingData.length === 0 ? (
                  <EmptyState title="No funding records" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fundingData} margin={{ top: 8, right: 12, bottom: 0, left: -6 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eceff5" vertical={false} />
                      <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#d5dce8' }} />
                      <YAxis
                        tick={AXIS_TICK}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => formatCurrency(v, true)}
                      />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Requested" fill="#3366f2" radius={[4, 4, 0, 0]} maxBarSize={26} />
                      <Bar dataKey="Approved" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={26} />
                      <Bar dataKey="Received" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Yearly submission trend"
              description="Submissions and approvals grouped by calendar year"
            />
            <CardBody className="h-64">
              {yearlyTrend.length === 0 ? (
                <EmptyState title="No yearly history" description="No submissions match the current filters." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={yearlyTrend} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                    <defs>
                      <linearGradient id="analyticsSubmissions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3366f2" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#3366f2" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="analyticsApproved" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eceff5" vertical={false} />
                    <XAxis dataKey="period" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#d5dce8' }} />
                    <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="Submissions"
                      stroke="#3366f2"
                      fill="url(#analyticsSubmissions)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="Approved"
                      stroke="#10b981"
                      fill="url(#analyticsApproved)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardBody>
          </Card>

          {/* --------------------------------------------------- pending cases */}
          <Card>
            <CardHeader
              title="Pending approval cases"
              description={`${formatNumber(data.pendingApprovals.total)} request(s) awaiting a decision · ${formatNumber(
                data.pendingApprovals.overdue,
              )} overdue`}
            />
            {loading ? (
              <TableSkeleton rows={5} cols={6} />
            ) : data.pendingApprovals.cases.length === 0 ? (
              <EmptyState title="Nothing pending" description="No approval request is awaiting a decision." />
            ) : (
              <TableWrapper>
                <table className="min-w-full divide-y divide-ink-200">
                  <thead className="table-head">
                    <tr>
                      <th className="px-4 py-2.5">Request</th>
                      <th className="px-4 py-2.5">Subject</th>
                      <th className="px-4 py-2.5">Current stage</th>
                      <th className="px-4 py-2.5">Reviewer</th>
                      <th className="px-4 py-2.5">Submitted</th>
                      <th className="px-4 py-2.5">Days pending</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {data.pendingApprovals.cases.map((c) => {
                      const overdue = c.days_pending > OVERDUE_AFTER_DAYS;
                      return (
                        <tr key={c.id} className="transition hover:bg-ink-50">
                          <td className="table-cell">
                            <Link
                              to={`/approvals/${c.id}`}
                              className="font-medium text-ink-900 hover:text-brand-700"
                            >
                              {c.request_code}
                            </Link>
                          </td>
                          <td className="table-cell">{c.subject_type}</td>
                          <td className="table-cell">
                            <StatusBadge status={c.current_stage} />
                          </td>
                          <td className="table-cell">{c.reviewer_name ?? 'Unassigned'}</td>
                          <td className="table-cell">{formatDate(c.submitted_at)}</td>
                          <td className="table-cell">
                            <span className="flex items-center gap-2">
                              <span className="font-medium text-ink-800">{c.days_pending}d</span>
                              {overdue ? <Badge tone="danger">Overdue</Badge> : null}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrapper>
            )}
          </Card>

          {/* ---------------------------------------------- IPR deadline table */}
          <Card>
            <CardHeader
              title="Upcoming IPR deadlines"
              description="Next filing, examination and renewal dates that still need attention"
            />
            {loading ? (
              <TableSkeleton rows={5} cols={6} />
            ) : data.upcomingIprDeadlines.length === 0 ? (
              <EmptyState title="No upcoming deadlines" description="No open IPR record has a pending deadline." />
            ) : (
              <TableWrapper>
                <table className="min-w-full divide-y divide-ink-200">
                  <thead className="table-head">
                    <tr>
                      <th className="px-4 py-2.5">IPR code</th>
                      <th className="px-4 py-2.5">Title</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Next deadline</th>
                      <th className="px-4 py-2.5">Days remaining</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {data.upcomingIprDeadlines.map((d) => {
                      const overdue = d.days_remaining < 0;
                      return (
                        <tr key={d.id} className="transition hover:bg-ink-50">
                          <td className="table-cell">
                            <Link to={`/ipr/${d.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                              {d.ipr_code}
                            </Link>
                          </td>
                          <td className="table-cell whitespace-normal">{d.title}</td>
                          <td className="table-cell">{label(d.ipr_type)}</td>
                          <td className="table-cell">
                            <StatusBadge status={d.status} />
                          </td>
                          <td className="table-cell">{formatDate(d.next_deadline)}</td>
                          <td className="table-cell">
                            <Badge tone={overdue ? 'danger' : d.days_remaining <= 7 ? 'warning' : 'info'}>
                              {overdue
                                ? `${Math.abs(d.days_remaining)} day(s) overdue`
                                : `${d.days_remaining} day(s) remaining`}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrapper>
            )}
          </Card>

          <div className="grid gap-4 xl:grid-cols-3">
            {/* ------------------------------------------- startup milestone table */}
            <Card className="xl:col-span-2">
              <CardHeader
                title="Startup incubation progress"
                description="Milestones completed against the total milestone plan"
              />
              {loading ? (
                <TableSkeleton rows={5} cols={5} />
              ) : data.startupIncubation.progress.length === 0 ? (
                <EmptyState title="No startups" description="No startup has been registered yet." />
              ) : (
                <TableWrapper>
                  <table className="min-w-full divide-y divide-ink-200">
                    <thead className="table-head">
                      <tr>
                        <th className="px-4 py-2.5">Startup</th>
                        <th className="px-4 py-2.5">Stage</th>
                        <th className="px-4 py-2.5">Progress</th>
                        <th className="px-4 py-2.5">Milestones done</th>
                        <th className="px-4 py-2.5">Milestones total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {data.startupIncubation.progress.map((s) => (
                        <tr key={s.id} className="transition hover:bg-ink-50">
                          <td className="table-cell whitespace-normal">
                            <Link to={`/startups/${s.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                              {s.name}
                            </Link>
                            <p className="mt-0.5 text-xs text-ink-500">{s.startup_code}</p>
                          </td>
                          <td className="table-cell">
                            <Badge tone={tone(s.stage)}>{label(s.stage)}</Badge>
                          </td>
                          <td className="table-cell">{s.progress}%</td>
                          <td className="table-cell">{s.milestones_done}</td>
                          <td className="table-cell">{s.milestones}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrapper>
              )}
            </Card>

            <Card>
              <CardHeader title="Funding summary" description="Totals across every funding source" />
              <CardBody className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-600">Requested</span>
                  <span className="font-semibold text-ink-900">
                    {formatCurrency(data.funding.totals.requested, true)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-600">Approved</span>
                  <span className="font-semibold text-ink-900">
                    {formatCurrency(data.funding.totals.approved, true)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-600">Received</span>
                  <span className="font-semibold text-ink-900">
                    {formatCurrency(data.funding.totals.received, true)}
                  </span>
                </div>
                <div className="mt-4 border-t border-ink-200 pt-3 text-xs text-ink-500">
                  <p className="font-semibold uppercase tracking-wide text-ink-500">Funding applications</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <span>
                      Total <span className="font-semibold text-ink-800">{data.funding.applications.total}</span>
                    </span>
                    <span>
                      Approved{' '}
                      <span className="font-semibold text-ink-800">{data.funding.applications.approved}</span>
                    </span>
                    <span>
                      Rejected{' '}
                      <span className="font-semibold text-ink-800">{data.funding.applications.rejected}</span>
                    </span>
                    <span>
                      Open <span className="font-semibold text-ink-800">{data.funding.applications.open}</span>
                    </span>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* --------------------------------------------- similarity screening */}
          <Card>
            <CardHeader
              title="Similarity screening (human-review aid — not a plagiarism or novelty verdict)"
              description="TF-IDF and cosine similarity over project titles and descriptions."
            />
            <CardBody className="space-y-4">
              <NoticeBanner tone="warning" title="How to read this panel">
                <p>
                  {similarState.data?.notice ??
                    'Similarity scores are computed with TF-IDF and cosine similarity. They are screening aids for human review and are not evidence of plagiarism or of patent novelty.'}
                </p>
              </NoticeBanner>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="w-full sm:max-w-md">
                  <Select
                    label="Research project"
                    value={similarProjectId}
                    onChange={(e) => setSimilarProjectId(e.target.value)}
                    placeholder={projectsLoading ? 'Loading projects…' : 'Select a project to screen'}
                    disabled={projectsLoading || projectsError !== null}
                    options={(projectList?.data ?? []).map((p) => ({
                      value: String(p.id),
                      label: `${p.project_code} — ${p.title}`,
                    }))}
                  />
                </div>
                {similarProjectId ? (
                  <Button variant="outline" onClick={similarState.reload}>
                    Re-run screening
                  </Button>
                ) : null}
              </div>

              {projectsError ? (
                <ErrorState message={projectsError} onRetry={reloadProjects} />
              ) : null}

              {!similarProjectId ? (
                <EmptyState
                  title="No project selected"
                  description="Choose a research project to list the closest matching records for manual review."
                  icon={<FileSearch className="h-6 w-6" />}
                />
              ) : similarState.loading ? (
                <Spinner label="Computing similarity…" />
              ) : similarState.error ? (
                <ErrorState message={similarState.error} onRetry={similarState.reload} />
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-ink-200 bg-ink-50/60 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                      Screened project
                    </p>
                    <p className="mt-1 text-sm font-medium text-ink-900">
                      {similarState.data?.project.project_code} — {similarState.data?.project.title}
                    </p>
                    <div className="mt-2">
                      <StatusBadge status={similarState.data?.project.status} />
                    </div>
                  </div>

                  {similarState.data?.similar.length ? (
                    <TableWrapper>
                      <table className="min-w-full divide-y divide-ink-200">
                        <thead className="table-head">
                          <tr>
                            <th className="px-4 py-2.5">Code</th>
                            <th className="px-4 py-2.5">Matching title</th>
                            <th className="px-4 py-2.5">Status</th>
                            <th className="px-4 py-2.5">Similarity score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink-100">
                          {similarState.data.similar.map((m) => {
                            const raw = m.similarity ?? m.score ?? 0;
                            const pct = Math.round(raw * 1000) / 10;
                            return (
                              <tr key={m.id} className="transition hover:bg-ink-50">
                                <td className="table-cell">{m.code}</td>
                                <td className="table-cell whitespace-normal">
                                  <Link to={`/projects/${m.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                                    {m.title}
                                  </Link>
                                </td>
                                <td className="table-cell">
                                  <StatusBadge status={m.status} />
                                </td>
                                <td className="table-cell">
                                  <span className="font-semibold text-ink-900">{pct}%</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </TableWrapper>
                  ) : (
                    <EmptyState
                      title="No comparable records"
                      description="No other project cleared the server's similarity threshold for this record."
                      icon={<FileSearch className="h-6 w-6" />}
                    />
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          <p className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
            <Badge tone="neutral">Demo data</Badge>
            <ShieldCheck className="h-3.5 w-3.5" />
            <Lightbulb className="h-3.5 w-3.5" />
            <CalendarClock className="h-3.5 w-3.5" />
            <Wallet className="h-3.5 w-3.5" />
            All figures are computed from the seeded demonstration database and are entirely
            fictional.
          </p>
        </>
      ) : null}
    </div>
  );
}
