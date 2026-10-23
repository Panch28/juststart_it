import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  Download,
  FileText,
  Handshake,
  Lightbulb,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { api, ApiError, fileUrl } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { formatCurrency, formatDate, formatDateTime, relativeTime, daysRemainingLabel } from '../lib/format';
import { label, tone, DOCUMENT_CATEGORY_LABELS } from '../lib/constants';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  ProgressBar,
  Select,
  TabPanel,
  TableSkeleton,
  TableWrapper,
  Tabs,
  Textarea,
  useToast,
} from '../components/ui';
import { DetailGrid, DetailItem, MetaChip, NoticeBanner, StatusBadge } from '../components/common';

interface StartupDetailData {
  startup: {
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
    founder_email: string | null;
    project_code: string | null;
    project_title: string | null;
    department_name: string | null;
    mentor_user_id: number | null;
    mentor_name: string | null;
    milestone_count: number;
    milestone_done: number;
    document_count: number;
  };
  team: Array<{
    id: number;
    startup_id: number;
    user_id: number | null;
    name: string;
    email: string | null;
    member_role: string;
    user_name: string | null;
  }>;
  milestones: Array<{
    id: number;
    startup_id: number;
    title: string;
    description: string | null;
    due_date: string | null;
    status: string;
    progress: number;
    notes: string | null;
    created_at: string;
    days_remaining: number | null;
  }>;
  assignments: Array<{
    id: number;
    mentor_id: number;
    startup_id: number;
    assigned_at: string;
    status: string;
    next_meeting_at: string | null;
    mentor_name: string;
    mentor_email: string | null;
    expertise: string | null;
    industries: string | null;
    mentor_user_id: number;
  }>;
  meetings: Array<{
    id: number;
    assignment_id: number;
    mentor_id: number;
    startup_id: number;
    meeting_date: string;
    agenda: string | null;
    notes: string | null;
    follow_up_action: string | null;
    follow_up_status: string;
    follow_up_due: string | null;
    created_at: string;
    mentor_name: string | null;
  }>;
  documents: Array<{
    id: number;
    name: string;
    category: string;
    file_type: string | null;
    file_size: number | null;
    upload_date: string | null;
    version: number | null;
    uploaded_by_name: string | null;
  }>;
  funding: Array<{
    id: number;
    source: string;
    requested_amount: number;
    approved_amount: number;
    received_amount: number;
    status: string;
    application_date: string | null;
    decision_date: string | null;
    opportunity_title: string | null;
  }>;
  timeline: Array<{
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
  permissions: {
    canManage: boolean;
    canEditMilestones: boolean;
    canAssignMentor: boolean;
    canUpload: boolean;
    canDelete: boolean;
  };
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

const MILESTONE_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'BLOCKED'];
const FOLLOW_UP_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE'];
const DOCUMENT_CATEGORIES = Object.keys(DOCUMENT_CATEGORY_LABELS);

function formatBytes(size: number | null | undefined): string {
  if (!size || Number.isNaN(size)) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StartupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const detail = useAsync<StartupDetailData>(
    () => api.get<StartupDetailData>(`/startups/${id}`),
    [id],
  );
  const meta = useAsync<StartupMeta>(() => api.get<StartupMeta>('/startups/meta'), []);

  const [tab, setTab] = useState('overview');

  // Stage modal
  const [stageOpen, setStageOpen] = useState(false);
  const [nextStage, setNextStage] = useState('');
  const [nextProgress, setNextProgress] = useState('');
  const [stageBusy, setStageBusy] = useState(false);

  // Delete
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Milestone modal
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDescription, setMilestoneDescription] = useState('');
  const [milestoneDue, setMilestoneDue] = useState('');
  const [milestoneNotes, setMilestoneNotes] = useState('');
  const [milestoneBusy, setMilestoneBusy] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  const [busyMilestoneId, setBusyMilestoneId] = useState<number | null>(null);

  // Mentor assignment modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignMentorId, setAssignMentorId] = useState('');
  const [assignNextMeeting, setAssignNextMeeting] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);
  const [revokeBusyId, setRevokeBusyId] = useState<number | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Meeting modal
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingMentorId, setMeetingMentorId] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingAgenda, setMeetingAgenda] = useState('');
  const [meetingNotes, setMeetingNotes] = useState('');
  const [meetingFollowUp, setMeetingFollowUp] = useState('');
  const [meetingFollowUpDue, setMeetingFollowUpDue] = useState('');
  const [meetingBusy, setMeetingBusy] = useState(false);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [busyMeetingId, setBusyMeetingId] = useState<number | null>(null);

  // Document upload modal
  const [uploadOpen, setUploadOpen] = useState(false);
  const [docName, setDocName] = useState('');
  const [docCategory, setDocCategory] = useState('STARTUP_DOCUMENT');
  const [docDescription, setDocDescription] = useState('');
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const startup = detail.data?.startup;
  const permissions = detail.data?.permissions;
  const stageOptions = (meta.data?.stages ?? []).map((s) => ({ value: s, label: label(s) }));

  const mentorOptions = useMemo(
    () =>
      (meta.data?.mentors ?? []).map((m) => ({
        value: String(m.id),
        label: `${m.full_name} — ${m.assigned}/${m.max_startups} assigned`,
      })),
    [meta.data],
  );

  const openStageModal = () => {
    if (!startup) return;
    setNextStage(startup.stage);
    setNextProgress(String(startup.progress ?? 0));
    setStageOpen(true);
  };

  const submitStage = async () => {
    if (!startup || !nextStage) return;
    setStageBusy(true);
    try {
      const body: { stage: string; progress?: number } = { stage: nextStage };
      const parsed = Number(nextProgress);
      if (!Number.isNaN(parsed) && nextProgress !== '') body.progress = parsed;
      await api.patch(`/startups/${startup.id}/stage`, body);
      toast.success('Incubation stage updated', `${startup.name} is now at ${label(nextStage)}.`);
      setStageOpen(false);
      detail.reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not update the incubation stage.';
      toast.error('Stage update failed', message);
    } finally {
      setStageBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!startup) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/startups/${startup.id}`);
      toast.success('Application deleted', `${startup.name} was removed from the pipeline.`);
      navigate('/startups');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not delete this application.';
      toast.error('Delete failed', message);
      setDeleteBusy(false);
    }
  };

  const submitMilestone = async () => {
    if (!startup) return;
    setMilestoneError(null);
    if (milestoneTitle.trim().length < 3) {
      setMilestoneError('Milestone title must be at least 3 characters.');
      return;
    }
    setMilestoneBusy(true);
    try {
      await api.post(`/startups/${startup.id}/milestones`, {
        title: milestoneTitle.trim(),
        description: milestoneDescription,
        dueDate: milestoneDue,
        notes: milestoneNotes,
      });
      toast.success('Milestone added', milestoneTitle.trim());
      setMilestoneOpen(false);
      setMilestoneTitle('');
      setMilestoneDescription('');
      setMilestoneDue('');
      setMilestoneNotes('');
      detail.reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not add the milestone.';
      setMilestoneError(message);
      toast.error('Could not add milestone', message);
    } finally {
      setMilestoneBusy(false);
    }
  };

  const patchMilestone = async (milestoneId: number, status: string) => {
    setBusyMilestoneId(milestoneId);
    try {
      await api.patch(`/startups/${id}/milestones/${milestoneId}`, { status });
      toast.success('Milestone updated', `Status set to ${label(status)}.`);
      detail.reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not update the milestone.';
      toast.error('Update failed', message);
    } finally {
      setBusyMilestoneId(null);
    }
  };

  const submitAssignment = async () => {
    if (!startup) return;
    setAssignError(null);
    if (!assignMentorId) {
      setAssignError('Choose a mentor to assign.');
      return;
    }
    setAssignBusy(true);
    try {
      await api.post('/mentors/assign', {
        mentorId: Number(assignMentorId),
        startupId: startup.id,
        nextMeetingAt: assignNextMeeting,
      });
      toast.success('Mentor assigned', 'The mentor can now record meetings for this startup.');
      setAssignOpen(false);
      setAssignMentorId('');
      setAssignNextMeeting('');
      detail.reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not assign the mentor.';
      setAssignError(message);
      toast.error('Assignment failed', message);
    } finally {
      setAssignBusy(false);
    }
  };

  const revokeAssignment = async (assignmentId: number, mentorName: string) => {
    setRevokeBusyId(assignmentId);
    try {
      await api.delete(`/mentors/assign/${assignmentId}`);
      toast.success('Assignment revoked', `${mentorName} is no longer mentoring this startup.`);
      detail.reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not revoke the assignment.';
      toast.error('Revoke failed', message);
    } finally {
      setRevokeBusyId(null);
    }
  };

  const submitMeeting = async () => {
    if (!startup) return;
    setMeetingError(null);
    if (!meetingDate) {
      setMeetingError('Meeting date is required.');
      return;
    }
    setMeetingBusy(true);
    try {
      const body: Record<string, string | number> = {
        startupId: startup.id,
        meetingDate,
        agenda: meetingAgenda,
        notes: meetingNotes,
        followUpAction: meetingFollowUp,
        followUpDue: meetingFollowUpDue,
      };
      if (meetingMentorId) body.mentorId = Number(meetingMentorId);
      await api.post('/mentors/meetings', body);
      toast.success('Meeting recorded', 'The mentorship meeting was added to the log.');
      setMeetingOpen(false);
      setMeetingDate('');
      setMeetingAgenda('');
      setMeetingNotes('');
      setMeetingFollowUp('');
      setMeetingFollowUpDue('');
      detail.reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not record the meeting.';
      setMeetingError(message);
      toast.error('Could not record meeting', message);
    } finally {
      setMeetingBusy(false);
    }
  };

  const patchFollowUp = async (meetingId: number, followUpStatus: string) => {
    setBusyMeetingId(meetingId);
    try {
      await api.patch(`/mentors/meetings/${meetingId}`, { followUpStatus });
      toast.success('Follow-up updated', `Status set to ${label(followUpStatus)}.`);
      detail.reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not update the follow-up.';
      toast.error('Update failed', message);
    } finally {
      setBusyMeetingId(null);
    }
  };

  const submitUpload = async () => {
    if (!startup) return;
    setUploadError(null);
    if (docName.trim().length < 3) {
      setUploadError('Document name must be at least 3 characters.');
      return;
    }
    if (docFiles.length === 0) {
      setUploadError('Select at least one file to upload.');
      return;
    }
    setUploadBusy(true);
    try {
      const form = new FormData();
      form.append('name', docName.trim());
      form.append('category', docCategory);
      form.append('description', docDescription);
      form.append('relatedType', 'STARTUP');
      form.append('relatedId', String(startup.id));
      docFiles.forEach((file) => form.append('files', file));
      await api.post('/documents', form);
      toast.success('Document uploaded', `${docFiles.length} file(s) attached to ${startup.name}.`);
      setUploadOpen(false);
      setDocName('');
      setDocDescription('');
      setDocFiles([]);
      detail.reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not upload the document.';
      setUploadError(message);
      toast.error('Upload failed', message);
    } finally {
      setUploadBusy(false);
    }
  };

  if (detail.loading && !detail.data) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 animate-pulse rounded bg-ink-100" />
        <Card>
          <TableSkeleton rows={6} cols={5} />
        </Card>
      </div>
    );
  }

  if (detail.error || !startup) {
    return (
      <div className="space-y-6">
        <Link
          to="/startups"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to startups
        </Link>
        <Card>
          <ErrorState
            message={detail.error ?? 'This startup could not be loaded.'}
            onRetry={detail.reload}
          />
        </Card>
      </div>
    );
  }

  const team = detail.data?.team ?? [];
  const milestones = detail.data?.milestones ?? [];
  const assignments = detail.data?.assignments ?? [];
  const meetings = detail.data?.meetings ?? [];
  const documents = detail.data?.documents ?? [];
  const funding = detail.data?.funding ?? [];
  const timeline = detail.data?.timeline ?? [];

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'team', label: 'Team', count: team.length },
    { key: 'milestones', label: 'Milestones', count: milestones.length },
    { key: 'mentorship', label: 'Mentorship', count: assignments.length },
    { key: 'meetings', label: 'Meetings', count: meetings.length },
    { key: 'funding', label: 'Funding', count: funding.length },
    { key: 'documents', label: 'Documents', count: documents.length },
    { key: 'activity', label: 'Activity', count: timeline.length },
  ];

  return (
    <div className="space-y-6">
      <Link
        to="/startups"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 transition hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to startups
      </Link>

      {/* Header */}
      <div className="card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <MetaChip>{startup.startup_code}</MetaChip>
              <StatusBadge status={startup.stage} />
              <MetaChip>{startup.industry}</MetaChip>
            </div>
            <h1 className="mt-2 text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
              {startup.name}
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              Registered {formatDate(startup.application_date)} · founder {startup.founder_name ?? '—'}
              {startup.founder_email ? ` (${startup.founder_email})` : ''}
            </p>
            <div className="mt-4 max-w-md">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium uppercase tracking-wide text-ink-500">Incubation progress</span>
                <span className="font-semibold text-ink-700">{startup.progress ?? 0}%</span>
              </div>
              <ProgressBar value={startup.progress ?? 0} />
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {permissions?.canManage ? (
              <>
                <Button
                  variant="outline"
                  icon={<Pencil className="h-4 w-4" />}
                  onClick={() => navigate(`/startups/${startup.id}/edit`)}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  icon={<Repeat className="h-4 w-4" />}
                  onClick={openStageModal}
                >
                  Change stage
                </Button>
              </>
            ) : null}
            {permissions?.canUpload ? (
              <Button
                variant="outline"
                icon={<Upload className="h-4 w-4" />}
                onClick={() => setUploadOpen(true)}
              >
                Upload document
              </Button>
            ) : null}
            {permissions?.canDelete ? (
              <Button
                variant="danger"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => setDeleteOpen(true)}
              >
                Delete
              </Button>
            ) : null}
            {!permissions?.canManage && !permissions?.canUpload && !permissions?.canDelete ? (
              <span className="text-xs text-ink-500">You have read-only access to this startup.</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Card>
        <Tabs tabs={tabs} active={tab} onChange={setTab} className="rounded-t-xl" />

        {/* ---------------------------------------------------------- Overview */}
        <TabPanel active={tab} activeKey="overview">
          <CardBody className="space-y-6">
            <NoticeBanner title="Incubation is optional">
              <p>
                Registering a startup records a venture application. It does not convert the linked
                research project into a company, and a research project does not have to become a
                startup. A project may remain a project, be published, be licensed, or be patented
                instead — incubation is only one of the possible routes forward.
              </p>
            </NoticeBanner>

            <DetailGrid columns={3}>
              <DetailItem label="Startup code">{startup.startup_code}</DetailItem>
              <DetailItem label="Industry">{startup.industry}</DetailItem>
              <DetailItem label="Stage">
                <StatusBadge status={startup.stage} />
              </DetailItem>
              <DetailItem label="Founder">
                {startup.founder_name ?? '—'}
                {startup.founder_email ? (
                  <span className="block text-xs text-ink-500">{startup.founder_email}</span>
                ) : null}
              </DetailItem>
              <DetailItem label="Application date">{formatDate(startup.application_date)}</DetailItem>
              <DetailItem label="Linked project">
                {startup.project_code ? (
                  <>
                    <span className="font-medium">{startup.project_code}</span>
                    {startup.project_title ? (
                      <span className="block text-xs text-ink-500">{startup.project_title}</span>
                    ) : null}
                  </>
                ) : (
                  'Not linked to a research project'
                )}
              </DetailItem>
              <DetailItem label="Department">{startup.department_name ?? '—'}</DetailItem>
              <DetailItem label="Mentor">{startup.mentor_name ?? 'Not assigned'}</DetailItem>
              <DetailItem label="Support required">
                {startup.support_required || 'None recorded'}
              </DetailItem>
            </DetailGrid>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-ink-200 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Business idea
                </h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                  {startup.description || 'No description recorded yet.'}
                </p>
              </div>
              <div className="rounded-xl border border-ink-200 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Problem statement
                </h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                  {startup.problem || 'No problem statement recorded yet.'}
                </p>
              </div>
              <div className="rounded-xl border border-ink-200 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Proposed solution
                </h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                  {startup.solution || 'No solution recorded yet.'}
                </p>
              </div>
            </div>
          </CardBody>
        </TabPanel>

        {/* -------------------------------------------------------------- Team */}
        <TabPanel active={tab} activeKey="team">
          {team.length === 0 ? (
            <EmptyState title="No team members yet" description="Add team members from the registration form." />
          ) : (
            <TableWrapper>
              <table className="min-w-full divide-y divide-ink-200">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2.5">Member</th>
                    <th className="px-4 py-2.5">Email</th>
                    <th className="px-4 py-2.5">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {team.map((m) => (
                    <tr key={m.id} className="transition hover:bg-ink-50">
                      <td className="table-cell">
                        <span className="font-medium text-ink-900">{m.name}</span>
                        {m.user_name ? (
                          <p className="text-xs text-ink-500">Account: {m.user_name}</p>
                        ) : null}
                      </td>
                      <td className="table-cell">{m.email ?? '—'}</td>
                      <td className="table-cell">
                        <MetaChip>{m.member_role}</MetaChip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          )}
        </TabPanel>

        {/* -------------------------------------------------------- Milestones */}
        <TabPanel active={tab} activeKey="milestones">
          <CardHeader
            title="Incubation milestones"
            description="Track the plan agreed with the founder and the mentor."
            action={
              permissions?.canEditMilestones ? (
                <Button
                  size="sm"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => setMilestoneOpen(true)}
                >
                  Add milestone
                </Button>
              ) : null
            }
          />
          {milestones.length === 0 ? (
            <EmptyState
              title="No milestones yet"
              description="Add the first milestone so progress can be measured against the incubation plan."
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {milestones.map((m) => {
                    const days = m.days_remaining;
                    const overdue = days !== null && days < 0 && m.status !== 'COMPLETED';
                    return (
                      <tr key={m.id} className="transition hover:bg-ink-50">
                        <td className="table-cell whitespace-normal">
                          <span className="font-medium text-ink-900">{m.title}</span>
                          {m.description ? (
                            <p className="mt-0.5 max-w-md text-xs text-ink-500">{m.description}</p>
                          ) : null}
                        </td>
                        <td className="table-cell">
                          <span className="block">{formatDate(m.due_date)}</span>
                          {days !== null && days !== undefined ? (
                            <Badge tone={overdue ? 'danger' : days <= 7 ? 'warning' : 'neutral'}>
                              {daysRemainingLabel(days)}
                            </Badge>
                          ) : null}
                        </td>
                        <td className="table-cell">
                          {permissions?.canEditMilestones ? (
                            <Select
                              aria-label={`Status for ${m.title}`}
                              className="h-8 w-40 py-0 text-xs"
                              options={MILESTONE_STATUSES.map((s) => ({ value: s, label: label(s) }))}
                              value={m.status}
                              disabled={busyMilestoneId === m.id}
                              onChange={(e) => {
                                void patchMilestone(m.id, e.target.value);
                              }}
                            />
                          ) : (
                            <StatusBadge status={m.status} />
                          )}
                        </td>
                        <td className="table-cell w-44">
                          <ProgressBar value={m.progress ?? 0} showLabel />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrapper>
          )}
        </TabPanel>

        {/* ------------------------------------------------------- Mentorship */}
        <TabPanel active={tab} activeKey="mentorship">
          <CardHeader
            title="Mentor assignments"
            description="Mentors are attached to the startup and record the guidance meetings."
            action={
              permissions?.canAssignMentor ? (
                <Button
                  size="sm"
                  icon={<UserPlus className="h-4 w-4" />}
                  onClick={() => {
                    setAssignError(null);
                    setAssignOpen(true);
                  }}
                >
                  Assign mentor
                </Button>
              ) : null
            }
          />
          {assignments.length === 0 ? (
            <EmptyState
              title="No mentor assigned"
              description="Assign a mentor so the startup gets structured guidance and review."
              icon={<Handshake className="h-6 w-6" />}
            />
          ) : (
            <div className="divide-y divide-ink-100">
              {assignments.map((a) => (
                <div key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink-900">{a.mentor_name}</p>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="mt-1 text-xs text-ink-500">
                      {a.expertise || 'Expertise not recorded'}
                      {a.industries ? ` · ${a.industries}` : ''}
                    </p>
                    {a.mentor_email ? (
                      <p className="text-xs text-ink-500">{a.mentor_email}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-ink-500">
                      Assigned {formatDate(a.assigned_at)} · Next meeting{' '}
                      {a.next_meeting_at ? formatDate(a.next_meeting_at) : 'not scheduled'}
                    </p>
                  </div>
                  {permissions?.canAssignMentor ? (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Trash2 className="h-4 w-4" />}
                      loading={revokeBusyId === a.id}
                      onClick={() => {
                        void revokeAssignment(a.id, a.mentor_name);
                      }}
                    >
                      Revoke
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </TabPanel>

        {/* ---------------------------------------------------------- Meetings */}
        <TabPanel active={tab} activeKey="meetings">
          <CardHeader
            title="Mentorship meetings"
            description="Every recorded meeting with its agenda, notes and follow-up action."
            action={
              permissions?.canEditMilestones && assignments.length > 0 ? (
                <Button
                  size="sm"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => {
                    setMeetingError(null);
                    setMeetingMentorId(assignments[0]?.mentor_id ? String(assignments[0].mentor_id) : '');
                    setMeetingOpen(true);
                  }}
                >
                  Record meeting
                </Button>
              ) : null
            }
          />
          {meetings.length === 0 ? (
            <EmptyState
              title="No meetings recorded"
              description="Record the first mentorship meeting to build a guidance trail."
              icon={<CalendarClock className="h-6 w-6" />}
            />
          ) : (
            <TableWrapper>
              <table className="min-w-full divide-y divide-ink-200">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Mentor</th>
                    <th className="px-4 py-2.5">Agenda</th>
                    <th className="px-4 py-2.5">Notes</th>
                    <th className="px-4 py-2.5">Follow-up</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {meetings.map((m) => (
                    <tr key={m.id} className="transition hover:bg-ink-50">
                      <td className="table-cell">{formatDate(m.meeting_date)}</td>
                      <td className="table-cell">{m.mentor_name ?? '—'}</td>
                      <td className="table-cell whitespace-normal">
                        <span className="block max-w-xs">{m.agenda || '—'}</span>
                      </td>
                      <td className="table-cell whitespace-normal">
                        <span className="block max-w-xs text-ink-600">{m.notes || '—'}</span>
                      </td>
                      <td className="table-cell whitespace-normal">
                        <span className="block max-w-xs">{m.follow_up_action || '—'}</span>
                        {m.follow_up_due ? (
                          <span className="mt-0.5 block text-xs text-ink-500">
                            Due {formatDate(m.follow_up_due)}
                          </span>
                        ) : null}
                        {permissions?.canEditMilestones ? (
                          <Select
                            aria-label={`Follow-up status for meeting on ${m.meeting_date}`}
                            className="mt-1.5 h-8 w-36 py-0 text-xs"
                            options={FOLLOW_UP_STATUSES.map((s) => ({ value: s, label: label(s) }))}
                            value={m.follow_up_status}
                            disabled={busyMeetingId === m.id}
                            onChange={(e) => {
                              void patchFollowUp(m.id, e.target.value);
                            }}
                          />
                        ) : (
                          <StatusBadge status={m.follow_up_status} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          )}
        </TabPanel>

        {/* ----------------------------------------------------------- Funding */}
        <TabPanel active={tab} activeKey="funding">
          <CardHeader
            title="Funding records"
            description="Requested, approved and received amounts for this startup."
          />
          {funding.length === 0 ? (
            <EmptyState
              title="No funding records"
              description="Funding applications raised for this startup will appear here."
              icon={<Lightbulb className="h-6 w-6" />}
            />
          ) : (
            <TableWrapper>
              <table className="min-w-full divide-y divide-ink-200">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2.5">Source</th>
                    <th className="px-4 py-2.5">Opportunity</th>
                    <th className="px-4 py-2.5">Requested amount</th>
                    <th className="px-4 py-2.5">Approved amount</th>
                    <th className="px-4 py-2.5">Received amount</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Applied</th>
                    <th className="px-4 py-2.5">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {funding.map((f) => (
                    <tr key={f.id} className="transition hover:bg-ink-50">
                      <td className="table-cell">{f.source}</td>
                      <td className="table-cell whitespace-normal">
                        <span className="block max-w-xs">{f.opportunity_title ?? '—'}</span>
                      </td>
                      <td className="table-cell">{formatCurrency(f.requested_amount)}</td>
                      <td className="table-cell">{formatCurrency(f.approved_amount)}</td>
                      <td className="table-cell">{formatCurrency(f.received_amount)}</td>
                      <td className="table-cell">
                        <StatusBadge status={f.status} />
                      </td>
                      <td className="table-cell">{formatDate(f.application_date)}</td>
                      <td className="table-cell">{formatDate(f.decision_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          )}
        </TabPanel>

        {/* --------------------------------------------------------- Documents */}
        <TabPanel active={tab} activeKey="documents">
          <CardHeader
            title="Documents"
            description="Files attached to this startup record."
            action={
              permissions?.canUpload ? (
                <Button
                  size="sm"
                  icon={<Upload className="h-4 w-4" />}
                  onClick={() => setUploadOpen(true)}
                >
                  Upload document
                </Button>
              ) : null
            }
          />
          {documents.length === 0 ? (
            <EmptyState
              title="No documents yet"
              description="Upload proposals, incorporation records or progress reports."
              icon={<FileText className="h-6 w-6" />}
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
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5 text-right">File</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {documents.map((d) => (
                    <tr key={d.id} className="transition hover:bg-ink-50">
                      <td className="table-cell whitespace-normal">
                        <span className="font-medium text-ink-900">{d.name}</span>
                        {d.version ? (
                          <span className="ml-1.5 text-xs text-ink-500">v{d.version}</span>
                        ) : null}
                      </td>
                      <td className="table-cell">
                        <MetaChip>{DOCUMENT_CATEGORY_LABELS[d.category] ?? d.category}</MetaChip>
                      </td>
                      <td className="table-cell">{d.file_type ?? '—'}</td>
                      <td className="table-cell">{formatBytes(d.file_size)}</td>
                      <td className="table-cell">{d.uploaded_by_name ?? '—'}</td>
                      <td className="table-cell">{formatDate(d.upload_date)}</td>
                      <td className="table-cell text-right">
                        <a
                          href={fileUrl(d.id, true)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                        >
                          <Download className="h-3.5 w-3.5" />
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

        {/* ---------------------------------------------------------- Activity */}
        <TabPanel active={tab} activeKey="activity">
          <CardHeader title="Activity trail" description="Audit history for this startup record." />
          {timeline.length === 0 ? (
            <EmptyState title="No activity recorded yet" />
          ) : (
            <div className="divide-y divide-ink-100">
              {timeline.map((t) => (
                <div key={t.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                    <Activity className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-800">
                      <span className="font-medium text-ink-900">{t.actor_name ?? 'System'}</span>{' '}
                      {t.action.replace(/_/g, ' ').toLowerCase()}
                      {t.entity_code ? (
                        <>
                          {' '}
                          <span className="font-medium text-ink-700">{t.entity_code}</span>
                        </>
                      ) : null}
                    </p>
                    {t.details ? <p className="mt-0.5 text-xs text-ink-600">{t.details}</p> : null}
                    <p className="mt-0.5 text-xs text-ink-500">
                      {formatDateTime(t.created_at)} · {relativeTime(t.created_at)}
                    </p>
                  </div>
                  {t.to_status ? <Badge tone={tone(t.to_status)}>{label(t.to_status)}</Badge> : null}
                </div>
              ))}
            </div>
          )}
        </TabPanel>
      </Card>

      {/* ------------------------------------------------------- Change stage */}
      <Modal
        open={stageOpen}
        onClose={() => setStageOpen(false)}
        title="Change incubation stage"
        description="Move this startup to a new stage and optionally update its progress."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setStageOpen(false)} disabled={stageBusy}>
              Cancel
            </Button>
            <Button onClick={submitStage} loading={stageBusy} disabled={!nextStage}>
              Save stage
            </Button>
          </>
        }
      >
        <div className="space-y-4">
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

      {/* ------------------------------------------------------------- Delete */}
      <ConfirmDialog
        open={deleteOpen}
        tone="danger"
        title="Delete startup application"
        confirmLabel="Delete application"
        cancelLabel="Keep application"
        loading={deleteBusy}
        message={
          <>
            <p>
              This permanently removes <span className="font-semibold text-ink-900">{startup.name}</span>{' '}
              ({startup.startup_code}) together with its team, milestones, documents and mentorship
              records.
            </p>
            <p className="mt-2">Only applications still at the “Applied” stage can be deleted.</p>
          </>
        }
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />

      {/* ---------------------------------------------------- Add milestone */}
      <Modal
        open={milestoneOpen}
        onClose={() => setMilestoneOpen(false)}
        title="Add milestone"
        description="Describe the next deliverable in the incubation plan."
        footer={
          <>
            <Button variant="outline" onClick={() => setMilestoneOpen(false)} disabled={milestoneBusy}>
              Cancel
            </Button>
            <Button onClick={submitMilestone} loading={milestoneBusy}>
              Add milestone
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {milestoneError ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {milestoneError}
            </p>
          ) : null}
          <Input
            label="Milestone title"
            required
            placeholder="e.g. Prototype validated with two pilot customers"
            value={milestoneTitle}
            onChange={(e) => setMilestoneTitle(e.target.value)}
          />
          <Textarea
            label="Description"
            rows={3}
            value={milestoneDescription}
            onChange={(e) => setMilestoneDescription(e.target.value)}
          />
          <Input
            label="Due date"
            type="date"
            value={milestoneDue}
            onChange={(e) => setMilestoneDue(e.target.value)}
          />
          <Textarea
            label="Notes"
            rows={2}
            value={milestoneNotes}
            onChange={(e) => setMilestoneNotes(e.target.value)}
          />
        </div>
      </Modal>

      {/* ------------------------------------------------------ Assign mentor */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign a mentor"
        description="Mentors are shown with their current load against the maximum number of startups they can take."
        footer={
          <>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={assignBusy}>
              Cancel
            </Button>
            <Button onClick={submitAssignment} loading={assignBusy}>
              Assign mentor
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {assignError ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {assignError}
            </p>
          ) : null}
          {mentorOptions.length === 0 ? (
            <NoticeBanner tone="warning" title="No active mentors">
              <p>There are no active mentors available to assign yet.</p>
            </NoticeBanner>
          ) : (
            <>
              <Select
                label="Mentor"
                required
                placeholder="Select a mentor…"
                options={mentorOptions}
                value={assignMentorId}
                onChange={(e) => setAssignMentorId(e.target.value)}
              />
              <Input
                label="Next meeting"
                type="date"
                hint="Optional — the planned date of the first mentorship meeting."
                value={assignNextMeeting}
                onChange={(e) => setAssignNextMeeting(e.target.value)}
              />
              <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Capacity</p>
                <ul className="mt-2 space-y-1">
                  {(meta.data?.mentors ?? []).map((m) => (
                    <li key={m.id} className="flex items-center justify-between text-xs text-ink-600">
                      <span>{m.full_name}</span>
                      <span className="font-medium text-ink-800">
                        {m.assigned}/{m.max_startups}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ----------------------------------------------------- Record meeting */}
      <Modal
        open={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        title="Record mentorship meeting"
        description="Log the agenda, notes and the follow-up action agreed with the founder."
        footer={
          <>
            <Button variant="outline" onClick={() => setMeetingOpen(false)} disabled={meetingBusy}>
              Cancel
            </Button>
            <Button onClick={submitMeeting} loading={meetingBusy}>
              Save meeting
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {meetingError ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {meetingError}
            </p>
          ) : null}
          <Select
            label="Mentor"
            placeholder="Assigned mentor (auto-detected)"
            options={assignments.map((a) => ({
              value: String(a.mentor_id),
              label: a.mentor_name,
            }))}
            value={meetingMentorId}
            onChange={(e) => setMeetingMentorId(e.target.value)}
          />
          <Input
            label="Meeting date"
            type="date"
            required
            value={meetingDate}
            onChange={(e) => setMeetingDate(e.target.value)}
          />
          <Textarea
            label="Agenda"
            rows={3}
            value={meetingAgenda}
            onChange={(e) => setMeetingAgenda(e.target.value)}
          />
          <Textarea
            label="Notes"
            rows={3}
            value={meetingNotes}
            onChange={(e) => setMeetingNotes(e.target.value)}
          />
          <Textarea
            label="Follow-up action"
            rows={2}
            value={meetingFollowUp}
            onChange={(e) => setMeetingFollowUp(e.target.value)}
          />
          <Input
            label="Follow-up due date"
            type="date"
            value={meetingFollowUpDue}
            onChange={(e) => setMeetingFollowUpDue(e.target.value)}
          />
        </div>
      </Modal>

      {/* ----------------------------------------------------- Upload document */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload document"
        description="Attach supporting files to this startup record."
        footer={
          <>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploadBusy}>
              Cancel
            </Button>
            <Button onClick={submitUpload} loading={uploadBusy}>
              Upload
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {uploadError ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {uploadError}
            </p>
          ) : null}
          <Input
            label="Document name"
            required
            placeholder="e.g. Incorporation certificate"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
          />
          <Select
            label="Category"
            required
            options={DOCUMENT_CATEGORIES.map((c) => ({
              value: c,
              label: DOCUMENT_CATEGORY_LABELS[c] ?? c,
            }))}
            value={docCategory}
            onChange={(e) => setDocCategory(e.target.value)}
          />
          <Textarea
            label="Description"
            rows={2}
            value={docDescription}
            onChange={(e) => setDocDescription(e.target.value)}
          />
          <Field label="Files" required hint="PDF, Word, Excel, CSV, images up to 10 MB each.">
            <input
              type="file"
              multiple
              onChange={(e) => setDocFiles(Array.from(e.target.files ?? []))}
              className="input-base file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700"
            />
          </Field>
          {docFiles.length > 0 ? (
            <ul className="space-y-1">
              {docFiles.map((f) => (
                <li key={f.name} className="flex items-center justify-between text-xs text-ink-600">
                  <span className="truncate">{f.name}</span>
                  <span className="ml-2 shrink-0 text-ink-400">{formatBytes(f.size)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
