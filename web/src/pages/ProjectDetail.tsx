import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Lightbulb,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { api, ApiError, fileUrl } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { formatCurrency, formatDate, formatDateTime, formatNumber, relativeTime } from '../lib/format';
import { DOCUMENT_CATEGORY_LABELS, IPR_TYPE_LABELS, label } from '../lib/constants';
import { DetailGrid, DetailItem, NoticeBanner, StatusBadge } from '../components/common';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
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
  ProgressBar,
  Select,
  Spinner,
  TabPanel,
  Tabs,
  TableWrapper,
  Textarea,
  useToast,
} from '../components/ui';

interface ProjectRecord {
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
  pi_email: string | null;
  pi_designation: string | null;
  department_name: string;
  department_code: string;
  team_count: number;
  document_count: number;
  ipr_count: number;
}

interface TeamMember {
  id: number;
  project_id: number;
  user_id: number | null;
  name: string;
  email: string | null;
  member_role: string;
  contribution: string | null;
  user_name: string | null;
}

interface Milestone {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  progress: number;
  notes: string | null;
  created_at: string;
}

interface ProjectDocument {
  id: number;
  name: string;
  category: string;
  file_type: string | null;
  file_size: number | null;
  upload_date: string | null;
  version: number | null;
  uploaded_by_name: string | null;
}

interface IprRecord {
  id: number;
  ipr_code: string;
  title: string;
  ipr_type: string;
  status: string;
  next_deadline: string | null;
  filing_date: string | null;
}

interface FundingRecord {
  id: number;
  source: string;
  requested_amount: number;
  approved_amount: number | null;
  received_amount: number | null;
  status: string;
  application_date: string | null;
  decision_date: string | null;
  opportunity_title: string | null;
  organization: string | null;
}

interface ApprovalRecord {
  id: number;
  request_code: string;
  request_type: string;
  current_stage: string;
  status: string;
  submitted_at: string | null;
  reviewer_name: string | null;
}

interface TimelineEntry {
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

interface ProjectPermissions {
  canEdit: boolean;
  canUpdateStatus: boolean;
  canDelete: boolean;
  allowedTransitions: string[];
  canCreateIpr: boolean;
  canRegisterStartup: boolean;
  canUpload: boolean;
  isOwner: boolean;
}

interface ProjectDetailResponse {
  project: ProjectRecord;
  team: TeamMember[];
  milestones: Milestone[];
  documents: ProjectDocument[];
  iprRecords: IprRecord[];
  funding: FundingRecord[];
  approvals: ApprovalRecord[];
  timeline: TimelineEntry[];
  permissions: ProjectPermissions;
}

const MILESTONE_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'BLOCKED'];

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'team', label: 'Team' },
  { key: 'milestones', label: 'Milestones' },
  { key: 'ipr', label: 'IPR & Funding' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'documents', label: 'Documents' },
  { key: 'activity', label: 'Activity' },
];

/** Statuses from which the server accepts an IPR record or a startup registration. */
const IPR_STARTUP_STATUSES = ['APPROVED', 'ACTIVE', 'COMPLETED'];

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const { data, loading, error, reload } = useAsync<ProjectDetailResponse>(
    () => api.get<ProjectDetailResponse>(`/projects/${id}`),
    [id],
  );

  const [tab, setTab] = useState('overview');

  // ---- change status -----------------------------------------------------
  const [statusOpen, setStatusOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState('');
  const [nextProgress, setNextProgress] = useState(0);
  const [statusNote, setStatusNote] = useState('');
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  // ---- add milestone -----------------------------------------------------
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    notes: '',
  });
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  const [milestoneSaving, setMilestoneSaving] = useState(false);
  const [milestoneBusyId, setMilestoneBusyId] = useState<number | null>(null);

  // ---- upload document ---------------------------------------------------
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: '', category: 'RESEARCH_PROPOSAL', description: '' });
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSaving, setUploadSaving] = useState(false);

  // ---- delete ------------------------------------------------------------
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const project = data?.project;
  const permissions = data?.permissions;

  // The server rejects startup registrations unless the project is approved, running
  // or closed, even though `canRegisterStartup` only reflects the user's permission.
  const canRegisterStartup =
    !!permissions?.canRegisterStartup && IPR_STARTUP_STATUSES.includes(project?.status ?? '');

  // The server only deletes draft projects, regardless of the `project.delete` permission.
  const canDeleteDraft = !!permissions?.canDelete && project?.status === 'DRAFT';

  const openStatusModal = () => {
    setNextStatus('');
    setNextProgress(project?.progress ?? 0);
    setStatusNote('');
    setStatusError(null);
    setStatusOpen(true);
  };

  const submitStatus = async () => {
    if (!nextStatus) {
      setStatusError('Choose the next status for this project.');
      return;
    }
    setStatusSaving(true);
    setStatusError(null);
    try {
      const body: { status: string; progress?: number; note?: string } = { status: nextStatus };
      body.progress = nextProgress;
      if (statusNote.trim()) body.note = statusNote.trim();
      await api.patch(`/projects/${id}/status`, body);
      toast.success('Status updated', `Project moved to ${label(nextStatus)}.`);
      setStatusOpen(false);
      reload();
    } catch (err) {
      // A 409 means the workflow rejected the transition — show the server reason inline.
      setStatusError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'The status could not be changed.',
      );
    } finally {
      setStatusSaving(false);
    }
  };

  const submitMilestone = async () => {
    if (milestoneForm.title.trim().length < 3) {
      setMilestoneError('Give the milestone a title of at least 3 characters.');
      return;
    }
    setMilestoneSaving(true);
    setMilestoneError(null);
    try {
      await api.post(`/projects/${id}/milestones`, {
        title: milestoneForm.title.trim(),
        description: milestoneForm.description.trim(),
        dueDate: milestoneForm.dueDate,
        notes: milestoneForm.notes.trim(),
      });
      toast.success('Milestone added', milestoneForm.title.trim());
      setMilestoneForm({ title: '', description: '', dueDate: '', notes: '' });
      setMilestoneOpen(false);
      reload();
    } catch (err) {
      setMilestoneError(err instanceof Error ? err.message : 'The milestone could not be saved.');
    } finally {
      setMilestoneSaving(false);
    }
  };

  const changeMilestoneStatus = async (milestone: Milestone, status: string) => {
    setMilestoneBusyId(milestone.id);
    try {
      await api.patch(`/projects/${id}/milestones/${milestone.id}`, { status });
      toast.success('Milestone updated', `${milestone.title} → ${label(status)}.`);
      reload();
    } catch (err) {
      toast.error('Milestone not updated', err instanceof Error ? err.message : undefined);
    } finally {
      setMilestoneBusyId(null);
    }
  };

  const submitUpload = async () => {
    if (!uploadFiles.length) {
      setUploadError('Select at least one file to upload.');
      return;
    }
    setUploadSaving(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('name', uploadForm.name.trim() || uploadFiles[0].name);
      form.append('category', uploadForm.category);
      form.append('description', uploadForm.description.trim());
      form.append('relatedType', 'PROJECT');
      form.append('relatedId', String(id ?? ''));
      uploadFiles.forEach((f) => form.append('files', f));
      await api.post('/documents', form);
      toast.success('Document uploaded', `${uploadFiles.length} file(s) attached to the project.`);
      setUploadForm({ name: '', category: 'RESEARCH_PROPOSAL', description: '' });
      setUploadFiles([]);
      setUploadOpen(false);
      reload();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'The document could not be uploaded.');
    } finally {
      setUploadSaving(false);
    }
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    try {
      await api.delete(`/projects/${id}`);
      toast.success('Draft deleted', 'The draft project has been removed.');
      navigate('/projects');
    } catch (err) {
      toast.error('Delete failed', err instanceof Error ? err.message : undefined);
      setDeleteOpen(false);
    } finally {
      setDeleteBusy(false);
    }
  };

  const tabs = useMemo(
    () =>
      TABS.map((t) => {
        if (!data) return t;
        const counts: Record<string, number> = {
          team: data.team.length,
          milestones: data.milestones.length,
          ipr: data.iprRecords.length + data.funding.length,
          approvals: data.approvals.length,
          documents: data.documents.length,
          activity: data.timeline.length,
        };
        const count = counts[t.key];
        return count === undefined ? t : { ...t, count };
      }),
    [data],
  );

  useEffect(() => {
    if (!id) navigate('/projects');
  }, [id, navigate]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Card>
          <Spinner label="Loading project…" />
        </Card>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-brand-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to projects
        </Link>
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      </div>
    );
  }

  if (!project || !permissions) return null;

  const canEditMilestones = permissions.canEdit;

  return (
    <div className="space-y-6">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition hover:text-brand-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to projects
      </Link>

      <PageHeader
        title={project.title}
        description={`${project.domain} · ${project.category} · ${project.department_name} · led by ${project.pi_name}`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{project.project_code}</Badge>
            <StatusBadge status={project.status} />
            <span className="text-xs text-ink-500">
              Created {formatDate(project.created_at)} · Updated {formatDate(project.updated_at)}
            </span>
          </div>
        }
        actions={
          <>
            {permissions.canEdit ? (
              <Link
                to={`/projects/${project.id}/edit`}
                className="inline-flex h-9.5 items-center gap-2 rounded-lg border border-ink-300 bg-white px-3.5 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
              >
                <Pencil className="h-4 w-4" aria-hidden />
                Edit
              </Link>
            ) : null}

            {permissions.canUpdateStatus ? (
              <Button variant="primary" icon={<ClipboardList className="h-4 w-4" />} onClick={openStatusModal}>
                Change status
              </Button>
            ) : null}

            {permissions.canUpload ? (
              <Button
                variant="outline"
                icon={<Upload className="h-4 w-4" />}
                onClick={() => {
                  setUploadError(null);
                  setUploadOpen(true);
                }}
              >
                Upload document
              </Button>
            ) : null}

            <Dropdown
              align="right"
              trigger={
                <span
                  className="inline-flex h-9.5 items-center rounded-lg border border-ink-300 bg-white px-3.5 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
                  aria-hidden
                >
                  More actions
                </span>
              }
            >
              {(close) => (
                <div>
                  <DropdownLabel>Project actions</DropdownLabel>
                  {permissions.canCreateIpr ? (
                    <DropdownItem
                      icon={<ShieldCheck className="h-4 w-4" />}
                      onClick={() => {
                        close();
                        navigate(`/ipr/new?projectId=${project.id}`);
                      }}
                    >
                      Create IPR record
                    </DropdownItem>
                  ) : null}
                  {canRegisterStartup ? (
                    <DropdownItem
                      icon={<Lightbulb className="h-4 w-4" />}
                      onClick={() => {
                        close();
                        navigate(`/startups/new?projectId=${project.id}`);
                      }}
                    >
                      Register startup
                    </DropdownItem>
                  ) : null}
                  {canDeleteDraft ? (
                    <>
                      <DropdownDivider />
                      <DropdownItem
                        danger
                        icon={<Trash2 className="h-4 w-4" />}
                        onClick={() => {
                          close();
                          setDeleteOpen(true);
                        }}
                      >
                        Delete draft
                      </DropdownItem>
                    </>
                  ) : null}
                </div>
              )}
            </Dropdown>
          </>
        }
      />

      <Card>
        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {/* ---------------------------------------------------------- overview */}
        <TabPanel active={tab} activeKey="overview">
          <CardBody className="space-y-5">
            <DetailGrid columns={4}>
              <DetailItem label="Project title">{project.title}</DetailItem>
              <DetailItem label="Project code">{project.project_code}</DetailItem>
              <DetailItem label="Status">
                <StatusBadge status={project.status} />
              </DetailItem>
              <DetailItem label="Research domain">{project.domain}</DetailItem>
              <DetailItem label="Category">{project.category}</DetailItem>
              <DetailItem label="Department">
                {project.department_name} ({project.department_code})
              </DetailItem>
              <DetailItem label="Principal investigator">
                {project.pi_name}
                {project.pi_designation ? (
                  <span className="block text-xs text-ink-500">{project.pi_designation}</span>
                ) : null}
                {project.pi_email ? (
                  <span className="block text-xs text-ink-500">{project.pi_email}</span>
                ) : null}
              </DetailItem>
              <DetailItem label="Progress">
                <div className="flex items-center gap-2">
                  <ProgressBar value={project.progress ?? 0} showLabel className="w-32" />
                </div>
              </DetailItem>
              <DetailItem label="Start date">{formatDate(project.start_date)}</DetailItem>
              <DetailItem label="Expected completion">{formatDate(project.expected_completion_date)}</DetailItem>
              <DetailItem label="Funding required">
                {formatCurrency(project.funding_required)}
              </DetailItem>
              <DetailItem label="Submitted">{formatDate(project.submitted_at)}</DetailItem>
              <DetailItem label="Approved">{formatDate(project.approved_at)}</DetailItem>
              <DetailItem label="Completed">{formatDate(project.completed_at)}</DetailItem>
              <DetailItem label="Team size">{formatNumber(project.team_count ?? 0)} members</DetailItem>
              <DetailItem label="Attached documents">{formatNumber(project.document_count ?? 0)}</DetailItem>
              <DetailItem label="IPR records">{formatNumber(project.ipr_count ?? 0)}</DetailItem>
            </DetailGrid>

            <div className="space-y-4 border-t border-ink-100 pt-4">
              <div>
                <h3 className="text-sm font-semibold text-ink-900">Description</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-700">{project.description || '—'}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink-900">Objectives</h3>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                  {project.objectives || '—'}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink-900">Expected outcomes</h3>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                  {project.expected_outcomes || '—'}
                </p>
              </div>
            </div>

            <NoticeBanner tone="info" title="From project to IPR or startup">
              <p>
                A project does not have to produce anything beyond its research output. When the work
                yields a protectable invention, publishable result or a commercialisable idea, an IPR
                record or a startup may be branched off from this project.
              </p>
              <p className="mt-1">
                IPR records and startup registrations can only be created once the project is{' '}
                <strong>approved, active or completed</strong> — draft and in-review projects stay
                inside the research workflow only.
              </p>
            </NoticeBanner>
          </CardBody>
        </TabPanel>

        {/* ------------------------------------------------------------- team */}
        <TabPanel active={tab} activeKey="team">
          {data.team.length === 0 ? (
            <EmptyState
              title="No team members yet"
              description="Add co-investigators, technicians and students from the edit screen."
              icon={<Users className="h-6 w-6" />}
            />
          ) : (
            <TableWrapper>
              <table className="min-w-full divide-y divide-ink-200">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2.5">Member</th>
                    <th className="px-4 py-2.5">Email</th>
                    <th className="px-4 py-2.5">Role</th>
                    <th className="px-4 py-2.5">Contribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.team.map((m) => (
                    <tr key={m.id} className="transition hover:bg-ink-50">
                      <td className="table-cell font-medium text-ink-900">{m.name}</td>
                      <td className="table-cell">{m.email ?? '—'}</td>
                      <td className="table-cell">
                        <Badge tone="violet">{m.member_role}</Badge>
                      </td>
                      <td className="table-cell whitespace-normal text-ink-600">
                        {m.contribution ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          )}
        </TabPanel>

        {/* ------------------------------------------------------- milestones */}
        <TabPanel active={tab} activeKey="milestones">
          <CardHeader
            title="Project milestones"
            description="Track the checkpoints of this project and their completion."
            action={
              canEditMilestones ? (
                <Button
                  size="sm"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => {
                    setMilestoneError(null);
                    setMilestoneOpen(true);
                  }}
                >
                  Add milestone
                </Button>
              ) : null
            }
          />
          {data.milestones.length === 0 ? (
            <EmptyState
              title="No milestones planned"
              description="Break the project down into checkpoints to track progress over time."
              icon={<ClipboardList className="h-6 w-6" />}
            />
          ) : (
            <TableWrapper>
              <table className="min-w-full divide-y divide-ink-200">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2.5">Milestone</th>
                    <th className="px-4 py-2.5">Due date</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Progress</th>
                    <th className="px-4 py-2.5">Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.milestones.map((ms) => (
                    <tr key={ms.id} className="transition hover:bg-ink-50">
                      <td className="table-cell whitespace-normal">
                        <span className="font-medium text-ink-900">{ms.title}</span>
                        {ms.description ? (
                          <p className="mt-0.5 text-xs text-ink-500">{ms.description}</p>
                        ) : null}
                      </td>
                      <td className="table-cell">{formatDate(ms.due_date)}</td>
                      <td className="table-cell">
                        <StatusBadge status={ms.status} />
                      </td>
                      <td className="table-cell">
                        <ProgressBar value={ms.progress ?? 0} showLabel className="w-32" />
                      </td>
                      <td className="table-cell">
                        {canEditMilestones ? (
                          <Select
                            aria-label={`Update status of ${ms.title}`}
                            value={ms.status}
                            onChange={(e) => void changeMilestoneStatus(ms, e.target.value)}
                            disabled={milestoneBusyId === ms.id}
                            options={MILESTONE_STATUSES.map((s) => ({ value: s, label: label(s) }))}
                            className="h-8 w-40 py-0 text-xs"
                          />
                        ) : (
                          <span className="text-xs text-ink-500">Read only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          )}
        </TabPanel>

        {/* ------------------------------------------------------ ipr/funding */}
        <TabPanel active={tab} activeKey="ipr">
          <CardBody className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-ink-200">
              <div className="flex items-center justify-between gap-2 border-b border-ink-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-ink-900">IPR records</h3>
                <Badge tone="violet">{data.iprRecords.length}</Badge>
              </div>
              {data.iprRecords.length === 0 ? (
                <EmptyState
                  title="No IPR records"
                  description="No intellectual property record has been branched off from this project yet."
                  icon={<ShieldCheck className="h-6 w-6" />}
                />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {data.iprRecords.map((r) => (
                    <li key={r.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to={`/ipr/${r.id}`}
                            className="truncate text-sm font-medium text-ink-900 hover:text-brand-700"
                          >
                            {r.title}
                          </Link>
                          <p className="mt-0.5 text-xs text-ink-500">
                            {r.ipr_code} · {IPR_TYPE_LABELS[r.ipr_type] ?? r.ipr_type}
                          </p>
                        </div>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        Next deadline: {formatDate(r.next_deadline)} · Filed: {formatDate(r.filing_date)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-ink-200">
              <div className="flex items-center justify-between gap-2 border-b border-ink-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-ink-900">Funding records</h3>
                <Badge tone="info">{data.funding.length}</Badge>
              </div>
              {data.funding.length === 0 ? (
                <EmptyState
                  title="No funding records"
                  description="No funding application or sanction is linked to this project yet."
                  icon={<FileText className="h-6 w-6" />}
                />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {data.funding.map((f) => (
                    <li key={f.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-900">
                            {f.opportunity_title ?? f.source}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-500">
                            {f.source}
                            {f.organization ? ` · ${f.organization}` : ''}
                          </p>
                        </div>
                        <StatusBadge status={f.status} />
                      </div>
                      <dl className="mt-2 grid grid-cols-3 gap-3">
                        <div>
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                            Requested
                          </dt>
                          <dd className="text-sm font-medium text-ink-800">
                            {formatCurrency(f.requested_amount)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                            Approved
                          </dt>
                          <dd className="text-sm font-medium text-emerald-700">
                            {formatCurrency(f.approved_amount)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                            Received
                          </dt>
                          <dd className="text-sm font-medium text-brand-700">
                            {formatCurrency(f.received_amount)}
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-2 text-xs text-ink-500">
                        Applied {formatDate(f.application_date)} · Decision {formatDate(f.decision_date)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardBody>
        </TabPanel>

        {/* -------------------------------------------------------- approvals */}
        <TabPanel active={tab} activeKey="approvals">
          {data.approvals.length === 0 ? (
            <EmptyState
              title="No approval requests"
              description="This project has not been routed through the approval workflow."
              icon={<CheckCircle2 className="h-6 w-6" />}
            />
          ) : (
            <TableWrapper>
              <table className="min-w-full divide-y divide-ink-200">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2.5">Request</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Stage</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Submitted</th>
                    <th className="px-4 py-2.5">Reviewer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.approvals.map((a) => (
                    <tr key={a.id} className="transition hover:bg-ink-50">
                      <td className="table-cell font-medium text-ink-900">
                        <Link to={`/approvals/${a.id}`} className="hover:text-brand-700">
                          {a.request_code}
                        </Link>
                      </td>
                      <td className="table-cell">{a.request_type}</td>
                      <td className="table-cell">{a.current_stage}</td>
                      <td className="table-cell">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="table-cell">{formatDate(a.submitted_at)}</td>
                      <td className="table-cell">{a.reviewer_name ?? 'Unassigned'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          )}
        </TabPanel>

        {/* -------------------------------------------------------- documents */}
        <TabPanel active={tab} activeKey="documents">
          {data.documents.length === 0 ? (
            <EmptyState
              title="No documents attached"
              description="Upload the proposal, reports, approval letters or IPR paperwork for this project."
              icon={<FileText className="h-6 w-6" />}
              action={
                permissions.canUpload ? (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Upload className="h-4 w-4" />}
                    onClick={() => {
                      setUploadError(null);
                      setUploadOpen(true);
                    }}
                  >
                    Upload document
                  </Button>
                ) : null
              }
            />
          ) : (
            <TableWrapper>
              <table className="min-w-full divide-y divide-ink-200">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2.5">Document</th>
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Size</th>
                    <th className="px-4 py-2.5">Uploaded by</th>
                    <th className="px-4 py-2.5">Uploaded</th>
                    <th className="px-4 py-2.5 text-right">File</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.documents.map((d) => (
                    <tr key={d.id} className="transition hover:bg-ink-50">
                      <td className="table-cell whitespace-normal font-medium text-ink-900">{d.name}</td>
                      <td className="table-cell">
                        {DOCUMENT_CATEGORY_LABELS[d.category] ?? d.category}
                      </td>
                      <td className="table-cell">{d.file_type ?? '—'}</td>
                      <td className="table-cell">{formatBytes(d.file_size)}</td>
                      <td className="table-cell">{d.uploaded_by_name ?? '—'}</td>
                      <td className="table-cell">{formatDate(d.upload_date)}</td>
                      <td className="table-cell text-right">
                        <a
                          href={fileUrl(d.id, true)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden />
                          Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          )}
        </TabPanel>

        {/* --------------------------------------------------------- activity */}
        <TabPanel active={tab} activeKey="activity">
          {data.timeline.length === 0 ? (
            <EmptyState
              title="No activity recorded"
              description="Every status change and milestone update will be listed here."
              icon={<Activity className="h-6 w-6" />}
            />
          ) : (
            <ol className="divide-y divide-ink-100">
              {data.timeline.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                    <Activity className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-800">
                      <span className="font-medium text-ink-900">{entry.actor_name ?? 'System'}</span>{' '}
                      {entry.action.replace(/_/g, ' ').toLowerCase()}
                      {entry.entity_code ? (
                        <>
                          {' '}
                          <span className="font-medium text-ink-700">{entry.entity_code}</span>
                        </>
                      ) : null}
                    </p>
                    {entry.from_status || entry.to_status ? (
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                        {entry.from_status ? <StatusBadge status={entry.from_status} /> : null}
                        {entry.from_status && entry.to_status ? <span aria-hidden>→</span> : null}
                        {entry.to_status ? <StatusBadge status={entry.to_status} /> : null}
                      </p>
                    ) : null}
                    {entry.details ? <p className="mt-1 text-xs text-ink-600">{entry.details}</p> : null}
                    <p className="mt-1 text-xs text-ink-400" title={formatDateTime(entry.created_at)}>
                      {relativeTime(entry.created_at)} · {formatDateTime(entry.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </TabPanel>
      </Card>

      {/* -------------------------------------------------------- change status */}
      <Modal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title="Change project status"
        description="Only the transitions permitted by the workflow are offered."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setStatusOpen(false)} disabled={statusSaving}>
              Cancel
            </Button>
            <Button onClick={() => void submitStatus()} loading={statusSaving}>
              Update status
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-ink-200 bg-ink-50 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">Current status</span>
            <StatusBadge status={project.status} />
          </div>

          {permissions.allowedTransitions.length === 0 ? (
            <NoticeBanner tone="warning" title="No transition available">
              <p>
                A <strong>{label(project.status)}</strong> project is a terminal state in the workflow —
                there is no permitted next status.
              </p>
            </NoticeBanner>
          ) : (
            <Select
              label="New status"
              required
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value)}
              placeholder="Select the next status"
              options={permissions.allowedTransitions.map((s) => ({ value: s, label: label(s) }))}
            />
          )}

          <Field label={`Progress — ${nextProgress}%`} hint="Optional: update the completion percentage of the project.">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={nextProgress}
              onChange={(e) => setNextProgress(Number(e.target.value))}
              className="w-full accent-brand-600"
              aria-label="Project progress"
            />
          </Field>

          <Textarea
            label="Note"
            rows={3}
            placeholder="Why is the status changing?"
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
          />

          {statusError ? (
            <NoticeBanner tone="danger" title="Status not changed">
              <p>{statusError}</p>
            </NoticeBanner>
          ) : null}
        </div>
      </Modal>

      {/* --------------------------------------------------------- add milestone */}
      <Modal
        open={milestoneOpen}
        onClose={() => setMilestoneOpen(false)}
        title="Add milestone"
        description="Capture a checkpoint of this project so progress can be tracked."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setMilestoneOpen(false)} disabled={milestoneSaving}>
              Cancel
            </Button>
            <Button onClick={() => void submitMilestone()} loading={milestoneSaving}>
              Add milestone
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Milestone title"
            required
            value={milestoneForm.title}
            onChange={(e) => setMilestoneForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Prototype validated"
          />
          <Textarea
            label="Description"
            rows={3}
            value={milestoneForm.description}
            onChange={(e) => setMilestoneForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="What has to be achieved at this checkpoint?"
          />
          <Input
            label="Due date"
            type="date"
            value={milestoneForm.dueDate}
            onChange={(e) => setMilestoneForm((f) => ({ ...f, dueDate: e.target.value }))}
          />
          <Textarea
            label="Notes"
            rows={2}
            value={milestoneForm.notes}
            onChange={(e) => setMilestoneForm((f) => ({ ...f, notes: e.target.value }))}
          />
          {milestoneError ? (
            <NoticeBanner tone="danger" title="Milestone not saved">
              <p>{milestoneError}</p>
            </NoticeBanner>
          ) : null}
        </div>
      </Modal>

      {/* ------------------------------------------------------- upload document */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload document"
        description="Attach supporting files to this project."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploadSaving}>
              Cancel
            </Button>
            <Button onClick={() => void submitUpload()} loading={uploadSaving}>
              Upload
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Document name"
            required
            value={uploadForm.name}
            onChange={(e) => setUploadForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Revised research proposal"
          />
          <Select
            label="Category"
            required
            value={uploadForm.category}
            onChange={(e) => setUploadForm((f) => ({ ...f, category: e.target.value }))}
            options={Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, lbl]) => ({ value, label: lbl }))}
          />
          <Textarea
            label="Description"
            rows={2}
            value={uploadForm.description}
            onChange={(e) => setUploadForm((f) => ({ ...f, description: e.target.value }))}
          />
          <Field label="Files" required hint="Up to 10 files, 10 MB each.">
            <input
              type="file"
              multiple
              onChange={(e) => setUploadFiles(Array.from(e.target.files ?? []))}
              className="input-base file:mr-3 file:rounded-md file:border-0 file:bg-ink-100 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-ink-700"
            />
          </Field>
          {uploadFiles.length > 0 ? (
            <ul className="space-y-1 text-xs text-ink-600">
              {uploadFiles.map((f) => (
                <li key={`${f.name}-${f.size}`}>
                  {f.name} <span className="text-ink-400">({formatBytes(f.size)})</span>
                </li>
              ))}
            </ul>
          ) : null}
          {uploadError ? (
            <NoticeBanner tone="danger" title="Upload failed">
              <p>{uploadError}</p>
            </NoticeBanner>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this draft project?"
        message={
          <>
            <strong>{project.title}</strong> ({project.project_code}) will be permanently removed. Only
            draft projects can be deleted — this action cannot be undone.
          </>
        }
        confirmLabel="Delete project"
        tone="danger"
        loading={deleteBusy}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
