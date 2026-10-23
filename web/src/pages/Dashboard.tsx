import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  FlaskConical,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import {
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
import { useAsync } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { formatCurrency, formatDate, formatNumber, relativeTime } from '../lib/format';
import { label, tone } from '../lib/constants';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  ProgressBar,
  Spinner,
  StatCard,
  TableSkeleton,
} from '../components/ui';

interface DashboardData {
  kpis: Record<string, number>;
  charts: {
    projectsByStatus: Array<{ name: string; value: number }>;
    monthlySubmissions: Array<{ period: string; submissions: number; approved: number }>;
    projectsByDepartment: Array<{ name: string; code: string; value: number }>;
    iprByStatus: Array<{ name: string; value: number }>;
    iprByType: Array<{ name: string; value: number }>;
    startupByStage: Array<{ name: string; value: number }>;
  };
  recentProjects: Array<{
    id: number;
    project_code: string;
    title: string;
    status: string;
    progress: number;
    submitted_at: string | null;
    created_at: string;
    pi_name: string;
    department_name: string;
  }>;
  pendingApprovals: Array<{
    id: number;
    request_code: string;
    subject_type: string;
    subject_id: number;
    request_type: string;
    current_stage: string;
    status: string;
    submitted_at: string;
    reviewer_name: string | null;
    submitted_by_name: string;
    days_pending: number;
  }>;
  deadlines: Array<{
    record_id: number;
    record_type: string;
    code: string;
    title: string;
    deadline: string;
    status: string;
    target: string;
    days_remaining: number;
  }>;
  activity: Array<{
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
  }>;
  meta: { days: number; since: string; departmentId: number | null; generatedAt: string };
}

const PIE_COLORS = ['#3366f2', '#1a39b4', '#8eb6ff', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#94a3b8',
  SUBMITTED: '#3366f2',
  UNDER_REVIEW: '#598fff',
  APPROVED: '#10b981',
  ACTIVE: '#059669',
  COMPLETED: '#1a39b4',
  REJECTED: '#ef4444',
  RETURNED_FOR_CORRECTION: '#f59e0b',
  ON_HOLD: '#a855f7',
};

export default function Dashboard() {
  const { user } = useAuth();
  const [days, setDays] = useState(180);
  const { data, loading, error, reload } = useAsync<DashboardData>(
    () => api.get<DashboardData>('/dashboard', { days }),
    [days],
  );

  const kpi = data?.kpis ?? {};

  const projectTrend = useMemo(
    () =>
      (data?.charts.monthlySubmissions ?? []).map((m) => ({
        period: m.period,
        Submissions: m.submissions,
        Approved: m.approved,
      })),
    [data],
  );

  const departmentData = useMemo(
    () =>
      (data?.charts.projectsByDepartment ?? []).map((d) => ({
        name: d.code || d.name,
        Projects: d.value,
      })),
    [data],
  );

  const statusData = useMemo(
    () =>
      (data?.charts.projectsByStatus ?? []).map((s) => ({
        name: label(s.name),
        value: s.value,
        raw: s.name,
      })),
    [data],
  );

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`${greeting}, ${user?.fullName?.split(' ')[0] ?? 'there'}. Here is the current state of research, innovation and incubation activity.`}
        actions={
          <>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="Reporting window"
              className="h-9 rounded-lg border border-ink-300 bg-white px-2.5 text-sm text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
              <option value={365}>Last 12 months</option>
              <option value={1095}>Last 3 years</option>
            </select>
            <Button variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={reload}>
              Refresh
            </Button>
          </>
        }
      />

      {error ? <ErrorState message={error} onRetry={reload} /> : null}

      {loading && !data ? (
        <Spinner label="Loading dashboard…" />
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Research projects"
              value={formatNumber(kpi.totalProjects ?? 0)}
              icon={<FlaskConical className="h-5 w-5" />}
              hint={`${kpi.activeProjects ?? 0} approved or active · ${kpi.pendingSubmissions ?? 0} pending`}
              tone="brand"
            />
            <StatCard
              title="IPR records"
              value={formatNumber(kpi.iprRecords ?? 0)}
              icon={<ShieldCheck className="h-5 w-5" />}
              hint={`${kpi.iprUnderReview ?? 0} in review · ${kpi.iprGranted ?? 0} granted`}
              tone="violet"
            />
            <StatCard
              title="Pending approvals"
              value={formatNumber(kpi.pendingApprovals ?? 0)}
              icon={<Clock className="h-5 w-5" />}
              hint="Requests awaiting a decision"
              tone="amber"
            />
            <StatCard
              title="Incubated startups"
              value={formatNumber(kpi.startupsIncubated ?? 0)}
              icon={<Lightbulb className="h-5 w-5" />}
              hint={`${kpi.startupsTotal ?? 0} registered in total`}
              tone="emerald"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Funding requested"
              value={formatCurrency(kpi.fundingRequested ?? 0, true)}
              icon={<Wallet className="h-5 w-5" />}
              hint={`${kpi.fundingRecords ?? 0} funding records`}
              tone="brand"
            />
            <StatCard
              title="Funding approved"
              value={formatCurrency(kpi.totalFunding ?? 0, true)}
              icon={<CheckCircle2 className="h-5 w-5" />}
              hint="Sanctioned but not necessarily disbursed"
              tone="emerald"
            />
            <StatCard
              title="Funding received"
              value={formatCurrency(kpi.fundingReceived ?? 0, true)}
              icon={<Wallet className="h-5 w-5" />}
              hint="Actually disbursed to the institution"
              tone="ink"
            />
            <StatCard
              title="Completed projects"
              value={formatNumber(kpi.completedProjects ?? 0)}
              icon={<CheckCircle2 className="h-5 w-5" />}
              hint={`${kpi.draftProjects ?? 0} drafts · ${kpi.rejectedProjects ?? 0} rejected`}
              tone="ink"
            />
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Submissions vs. approvals"
                description={`Monthly project submissions over the last ${days} days`}
              />
              <CardBody className="h-72">
                {projectTrend.length === 0 ? (
                  <EmptyState title="No submission history" description="No projects in this window." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={projectTrend} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eceff5" vertical={false} />
                      <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#657ea1' }} tickLine={false} axisLine={{ stroke: '#d5dce8' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#657ea1' }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: '1px solid #d5dce8', fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="Submissions" stroke="#3366f2" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Approved" stroke="#10b981" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Projects by status" description="Current portfolio distribution" />
              <CardBody className="h-72">
                {statusData.length === 0 ? (
                  <EmptyState title="No projects" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="55%"
                        outerRadius="82%"
                        paddingAngle={2}
                      >
                        {statusData.map((entry) => (
                          <Cell key={entry.raw} fill={STATUS_COLORS[entry.raw] ?? PIE_COLORS[0]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #d5dce8', fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Projects by department"
                description="Number of research projects registered per department"
              />
              <CardBody className="h-64">
                {departmentData.length === 0 ? (
                  <EmptyState title="No departmental data" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={departmentData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eceff5" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#657ea1' }} tickLine={false} axisLine={{ stroke: '#d5dce8' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#657ea1' }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #d5dce8', fontSize: 12 }} />
                      <Bar dataKey="Projects" fill="#3366f2" radius={[6, 6, 0, 0]} maxBarSize={44} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="IPR portfolio" description="Records by type" />
              <CardBody className="space-y-4">
                {(data?.charts.iprByType ?? []).map((t) => {
                  const total = (data?.charts.iprByType ?? []).reduce((s, x) => s + x.value, 0) || 1;
                  return (
                    <div key={t.name}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-ink-700">
                          {t.name.charAt(0) + t.name.slice(1).toLowerCase()}
                        </span>
                        <span className="font-semibold text-ink-900">{t.value}</span>
                      </div>
                      <ProgressBar value={(t.value / total) * 100} />
                    </div>
                  );
                })}
                {(data?.charts.iprByType ?? []).length === 0 ? (
                  <EmptyState title="No IPR records" />
                ) : null}
              </CardBody>
            </Card>
          </div>

          {/* Recent projects + approvals */}
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Recent research projects"
                description="Latest submissions and drafts"
                action={
                  <Link
                    to="/projects"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                  >
                    View all <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              {loading && !data ? (
                <TableSkeleton rows={5} cols={4} />
              ) : (data?.recentProjects ?? []).length === 0 ? (
                <EmptyState title="No projects yet" description="Create a research project to get started." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-ink-200">
                    <thead className="table-head">
                      <tr>
                        <th className="px-4 py-2.5">Project</th>
                        <th className="px-4 py-2.5">Investigator</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Progress</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {(data?.recentProjects ?? []).map((p) => (
                        <tr key={p.id} className="transition hover:bg-ink-50">
                          <td className="table-cell">
                            <Link to={`/projects/${p.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                              {p.title}
                            </Link>
                            <p className="text-xs text-ink-500">
                              {p.project_code} · {p.department_name}
                            </p>
                          </td>
                          <td className="table-cell">{p.pi_name}</td>
                          <td className="table-cell">
                            <Badge tone={tone(p.status)}>{label(p.status)}</Badge>
                          </td>
                          <td className="table-cell w-40">
                            <ProgressBar value={p.progress} showLabel />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader
                title="Awaiting decision"
                description="Approval requests in progress"
                action={
                  <Link
                    to="/approvals"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Open <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <div className="divide-y divide-ink-100">
                {(data?.pendingApprovals ?? []).length === 0 ? (
                  <EmptyState title="Nothing pending" description="No approval requests need a decision." />
                ) : (
                  (data?.pendingApprovals ?? []).map((a) => (
                    <Link
                      key={a.id}
                      to={`/approvals/${a.id}`}
                      className="block px-5 py-3 transition hover:bg-ink-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium text-ink-900">{a.request_type}</p>
                        <Badge tone={a.days_pending > 14 ? 'danger' : 'neutral'}>
                          {a.days_pending}d
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-500">
                        {a.request_code} · {a.subject_type} · stage {label(a.current_stage)}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-500">
                        Reviewer: {a.reviewer_name ?? 'Unassigned'}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </Card>
          </div>

          {/* Deadlines + activity */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Upcoming deadlines"
                description="IPR, milestone and funding dates requiring attention"
              />
              <div className="divide-y divide-ink-100">
                {(data?.deadlines ?? []).length === 0 ? (
                  <EmptyState title="No deadlines in the next 30 days" />
                ) : (
                  (data?.deadlines ?? []).map((d) => {
                    const overdue = d.days_remaining < 0;
                    return (
                      <div key={`${d.record_type}-${d.record_id}`} className="flex items-start gap-3 px-5 py-3">
                        <span
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            overdue ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                          }`}
                        >
                          {overdue ? (
                            <AlertTriangle className="h-4 w-4" />
                          ) : (
                            <CalendarClock className="h-4 w-4" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink-900">{d.title}</p>
                          <p className="text-xs text-ink-500">
                            {d.record_type} · {d.code} · due {formatDate(d.deadline)}
                          </p>
                        </div>
                        <Badge tone={overdue ? 'danger' : d.days_remaining <= 7 ? 'warning' : 'neutral'}>
                          {overdue ? `${Math.abs(d.days_remaining)}d overdue` : `${d.days_remaining}d left`}
                        </Badge>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Recent activity" description="Audit trail across all modules" />
              <div className="divide-y divide-ink-100">
                {(data?.activity ?? []).length === 0 ? (
                  <EmptyState title="No activity recorded yet" />
                ) : (
                  (data?.activity ?? []).map((a) => (
                    <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                        <Activity className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
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
                        <p className="text-xs text-ink-500">
                          {a.entity_type} · {relativeTime(a.created_at)}
                        </p>
                      </div>
                      {a.to_status ? (
                        <Badge tone={tone(a.to_status)}>{label(a.to_status)}</Badge>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-ink-400">
            <FileText className="h-3.5 w-3.5" />
            Figures are computed live from the seeded database records. All records are fictional
            demonstration data.
          </p>
        </>
      )}
    </div>
  );
}
