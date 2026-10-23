import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Download,
  FileText,
  MessageSquare,
  Pencil,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { api, fileUrl } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { daysRemainingLabel, formatDate, formatDateTime, relativeTime } from '../lib/format';
import { DOCUMENT_CATEGORY_LABELS, IPR_TYPE_LABELS, label } from '../lib/constants';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  TabPanel,
  Tabs,
  Textarea,
  useToast,
} from '../components/ui';
import type { BadgeTone } from '../components/ui';
import {
  DetailGrid,
  DetailItem,
  MetaChip,
  NoticeBanner,
  StatusBadge,
} from '../components/common';

type DeadlineState = 'NONE' | 'OVERDUE' | 'URGENT' | 'UPCOMING';

interface IprRecord {
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
  days_to_deadline: number | null;
  deadline_state: DeadlineState;
}

interface Inventor {
  id: number;
  ipr_id: number;
  user_id: number | null;
  name: string;
  email: string | null;
  creator_order: number;
  user_name: string | null;
}

interface DocumentRow {
  id: number;
  name: string;
  category: string;
  file_type: string | null;
  file_size: number | null;
  upload_date: string;
  version: number | null;
  status: string | null;
  uploaded_by_name: string | null;
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

interface CommentEntry {
  id: number;
  request_id: number;
  reviewer_id: number | null;
  stage: string | null;
  decision: string;
  comment: string | null;
  created_at: string;
  reviewer_name: string | null;
}

interface ApprovalRef {
  id: number;
  request_code: string;
  request_type: string;
  current_stage: string | null;
  status: string;
  submitted_at: string | null;
  reviewer_name: string | null;
}

interface IprPermissions {
  canUpdate: boolean;
  canUpdateStatus?: boolean;
  canDelete: boolean;
  allowedTransitions: string[];
  canUpload: boolean;
}

interface IprDetailResponse {
  record: IprRecord;
  inventors: Inventor[];
  documents: DocumentRow[];
  timeline: TimelineEntry[];
  comments: CommentEntry[];
  approvals: ApprovalRef[];
  permissions: IprPermissions;
  notice: string;
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

const DECISION_LABELS: Record<string, string> = {
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CHANGES_REQUESTED: 'Changes requested',
  COMMENT: 'Comment',
  RESUBMITTED: 'Resubmitted',
};

const DECISION_TONES: Record<string, BadgeTone> = {
  APPROVED: 'success',
  REJECTED: 'danger',
  CHANGES_REQUESTED: 'warning',
  COMMENT: 'info',
  RESUBMITTED: 'violet',
};

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'inventors', label: 'Inventors' },
  { key: 'documents', label: 'Documents' },
  { key: 'approvals', label: 'Approvals & Comments' },
  { key: 'activity', label: 'Activity' },
];

function formatSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function IPRDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const recordId = Number(id);

  const { data, loading, error, reload } = useAsync<IprDetailResponse>(
    () => api.get<IprDetailResponse>(`/ipr/${recordId}`),
    [recordId],
  );

  const [tab, setTab] = useState('overview');

  const [statusOpen, setStatusOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [docName, setDocName] = useState('');
  const [docCategory, setDocCategory] = useState('IPR_DOCUMENT');
  const [docDescription, setDocDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const record = data?.record;
  const permissions = data?.permissions;

  const canChangeStatus = Boolean(
    permissions?.canUpdateStatus ?? permissions?.canUpdate ?? false,
  );
  const transitions = useMemo(() => permissions?.allowedTransitions ?? [], [permissions]);

  useEffect(() => {
    setNextStatus('');
    setStatusNote('');
    setStatusError(null);
  }, [statusOpen]);

  async function submitStatusChange() {
    if (!record || !nextStatus) {
      setStatusError('Select the next workflow status.');
      return;
    }
    setStatusBusy(true);
    setStatusError(null);
    try {
      const note = statusNote.trim();
      const body: Record<string, unknown> = { status: nextStatus };
      if (note) {
        body.notes = record.notes ? `${record.notes}\n${note}` : note;
      }
      const res = await api.put<{ message: string }>(`/ipr/${record.id}`, body);
      toast.success('Status updated', res.message);
      setStatusOpen(false);
      reload();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Unable to update the status.');
    } finally {
      setStatusBusy(false);
    }
  }

  async function confirmDelete() {
    if (!record) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await api.delete<{ message: string }>(`/ipr/${record.id}`);
      toast.success('Draft deleted', res.message);
      navigate('/ipr');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unable to delete this record.');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function submitUpload() {
    if (!record) return;
    if (docName.trim().length < 3) {
      setUploadError('Document name must be at least 3 characters.');
      return;
    }
    if (files.length === 0) {
      setUploadError('Select at least one file to upload.');
      return;
    }
    setUploadBusy(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('name', docName.trim());
      form.append('category', docCategory);
      form.append('description', docDescription.trim());
      form.append('relatedType', 'IPR');
      form.append('relatedId', String(record.id));
      files.forEach((file) => form.append('files', file));
      const res = await api.post<{ message: string }>('/documents', form);
      toast.success('Document uploaded', res.message);
      setUploadOpen(false);
      setDocName('');
      setDocDescription('');
      setFiles([]);
      reload();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to upload the document.');
    } finally {
      setUploadBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <Card>
        <Spinner label="Loading IPR record…" />
      </Card>
    );
  }

  if (error || !data || !record) {
    return (
      <div className="space-y-4">
        <Link
          to="/ipr"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to IPR management
        </Link>
        <Card>
          <ErrorState message={error ?? 'IPR record not found.'} onRetry={reload} />
        </Card>
      </div>
    );
  }

  const perms = data.permissions;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link
            to="/ipr"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 transition hover:text-ink-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to IPR management
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">{record.title}</h1>
            <Badge tone="neutral">{IPR_TYPE_LABELS[record.ipr_type] ?? record.ipr_type}</Badge>
            <StatusBadge status={record.status} />
            <Badge tone={DEADLINE_TONES[record.deadline_state] ?? 'neutral'}>
              {DEADLINE_TEXT[record.deadline_state] ?? record.deadline_state}
              {record.next_deadline ? ` · ${daysRemainingLabel(record.days_to_deadline)}` : ''}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {record.ipr_code}
            {record.department_name ? ` · ${record.department_name}` : ''}
            {record.officer_name ? ` · Officer: ${record.officer_name}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {perms.canUpdate ? (
            <Button
              variant="outline"
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => navigate(`/ipr/${record.id}/edit`)}
            >
              Edit
            </Button>
          ) : null}
          {canChangeStatus && transitions.length > 0 ? (
            <Button
              variant="secondary"
              icon={<Activity className="h-4 w-4" />}
              onClick={() => {
                setStatusOpen(true);
              }}
            >
              Change status
            </Button>
          ) : null}
          {perms.canUpload ? (
            <Button
              variant="secondary"
              icon={<Upload className="h-4 w-4" />}
              onClick={() => {
                setUploadOpen(true);
              }}
            >
              Upload document
            </Button>
          ) : null}
          {perms.canDelete ? (
            <Button
              variant="danger"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              Delete draft
            </Button>
          ) : null}
        </div>
      </div>

      <NoticeBanner tone="warning" title="Please read before relying on this status">
        <p>{data.notice}</p>
      </NoticeBanner>

      <Card>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />

        {/* Overview */}
        <TabPanel active={tab} activeKey="overview">
          <CardBody className="space-y-6">
            <DetailGrid columns={3}>
              <DetailItem label="IPR code">{record.ipr_code}</DetailItem>
              <DetailItem label="Type">{IPR_TYPE_LABELS[record.ipr_type] ?? record.ipr_type}</DetailItem>
              <DetailItem label="Status">
                <StatusBadge status={record.status} />
              </DetailItem>
              <DetailItem label="IPR officer">{record.officer_name ?? 'Unassigned'}</DetailItem>
              <DetailItem label="Department">{record.department_name ?? '—'}</DetailItem>
              <DetailItem label="Linked project">
                {record.project_code ? (
                  <Link
                    to={`/projects/${record.project_id}`}
                    className="font-medium text-brand-700 hover:text-brand-800"
                  >
                    {record.project_code}
                    {record.project_title ? ` — ${record.project_title}` : ''}
                  </Link>
                ) : (
                  'Not linked'
                )}
              </DetailItem>
              <DetailItem label="Disclosure date">{formatDate(record.disclosure_date)}</DetailItem>
              <DetailItem label="Filing date">{formatDate(record.filing_date)}</DetailItem>
              <DetailItem label="Next deadline">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5 text-ink-400" aria-hidden />
                    {formatDate(record.next_deadline)}
                  </span>
                  {record.next_deadline ? (
                    <Badge tone={DEADLINE_TONES[record.deadline_state] ?? 'neutral'}>
                      {daysRemainingLabel(record.days_to_deadline)}
                    </Badge>
                  ) : null}
                </span>
              </DetailItem>
              <DetailItem label="Documents">{data.documents.length}</DetailItem>
              <DetailItem label="Inventors">{data.inventors.length}</DetailItem>
              <DetailItem label="Approval requests">{data.approvals.length}</DetailItem>
            </DetailGrid>

            <div>
              <h3 className="text-sm font-semibold text-ink-900">Description</h3>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                {record.description || 'No description recorded.'}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-ink-900">Administrative notes</h3>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                {record.notes || 'No notes recorded.'}
              </p>
            </div>
          </CardBody>
        </TabPanel>

        {/* Inventors */}
        <TabPanel active={tab} activeKey="inventors">
          <CardBody className="space-y-3">
            {data.inventors.length === 0 ? (
              <EmptyState
                title="No inventors recorded"
                description="Add inventors from the edit screen to capture the creators behind this disclosure."
                icon={<Users className="h-6 w-6" />}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink-200">
                  <thead className="table-head">
                    <tr>
                      <th className="px-4 py-2.5">Order</th>
                      <th className="px-4 py-2.5">Name</th>
                      <th className="px-4 py-2.5">Email</th>
                      <th className="px-4 py-2.5">Linked account</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {data.inventors.map((inv) => (
                      <tr key={inv.id} className="transition hover:bg-ink-50">
                        <td className="table-cell">{inv.creator_order}</td>
                        <td className="table-cell font-medium text-ink-900">{inv.name}</td>
                        <td className="table-cell">{inv.email ?? '—'}</td>
                        <td className="table-cell">
                          {inv.user_name ? (
                            <MetaChip>{inv.user_name}</MetaChip>
                          ) : (
                            <span className="text-xs text-ink-400">Not linked</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </TabPanel>

        {/* Documents */}
        <TabPanel active={tab} activeKey="documents">
          <CardBody className="space-y-3">
            {data.documents.length === 0 ? (
              <EmptyState
                title="No documents attached"
                description="Upload supporting files such as disclosure forms, drafts or filing receipts."
                icon={<FileText className="h-6 w-6" />}
                action={
                  perms.canUpload ? (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Upload className="h-4 w-4" />}
                      onClick={() => setUploadOpen(true)}
                    >
                      Upload document
                    </Button>
                  ) : null
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink-200">
                  <thead className="table-head">
                    <tr>
                      <th className="px-4 py-2.5">Document</th>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Size</th>
                      <th className="px-4 py-2.5">Uploaded by</th>
                      <th className="px-4 py-2.5">Uploaded on</th>
                      <th className="px-4 py-2.5 text-right">Download</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {data.documents.map((doc) => (
                      <tr key={doc.id} className="transition hover:bg-ink-50">
                        <td className="table-cell whitespace-normal font-medium text-ink-900">
                          {doc.name}
                          {doc.version ? (
                            <span className="ml-1 text-xs text-ink-500">v{doc.version}</span>
                          ) : null}
                        </td>
                        <td className="table-cell">
                          {DOCUMENT_CATEGORY_LABELS[doc.category] ?? doc.category}
                        </td>
                        <td className="table-cell">{doc.file_type ?? '—'}</td>
                        <td className="table-cell">{formatSize(doc.file_size)}</td>
                        <td className="table-cell">{doc.uploaded_by_name ?? '—'}</td>
                        <td className="table-cell">{formatDate(doc.upload_date)}</td>
                        <td className="table-cell text-right">
                          <a
                            href={fileUrl(doc.id, true)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </TabPanel>

        {/* Approvals & comments */}
        <TabPanel active={tab} activeKey="approvals">
          <CardBody className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Approval requests</h3>
              {data.approvals.length === 0 ? (
                <p className="mt-1.5 text-sm text-ink-500">
                  No approval request has been raised for this record.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {data.approvals.map((approval) => (
                    <div
                      key={approval.id}
                      className="flex flex-col gap-2 rounded-lg border border-ink-200 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <Link
                          to={`/approvals/${approval.id}`}
                          className="text-sm font-medium text-ink-900 hover:text-brand-700"
                        >
                          {approval.request_code} — {approval.request_type}
                        </Link>
                        <p className="text-xs text-ink-500">
                          {approval.current_stage ?? 'Stage not set'}
                          {approval.reviewer_name ? ` · Reviewer: ${approval.reviewer_name}` : ''}
                          {approval.submitted_at ? ` · ${formatDate(approval.submitted_at)}` : ''}
                        </p>
                      </div>
                      <StatusBadge status={approval.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-ink-900">Decision &amp; comment thread</h3>
              {data.comments.length === 0 ? (
                <p className="mt-1.5 text-sm text-ink-500">
                  No reviewer comments have been recorded yet.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {data.comments.map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-ink-200 p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={DECISION_TONES[entry.decision] ?? 'neutral'}>
                          {DECISION_LABELS[entry.decision] ?? label(entry.decision)}
                        </Badge>
                        <span className="text-xs font-medium text-ink-700">
                          {entry.reviewer_name ?? 'System'}
                        </span>
                        {entry.stage ? <MetaChip>{entry.stage}</MetaChip> : null}
                        <span className="ml-auto text-xs text-ink-500">
                          {formatDateTime(entry.created_at)} · {relativeTime(entry.created_at)}
                        </span>
                      </div>
                      {entry.comment ? (
                        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                          {entry.comment}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardBody>
        </TabPanel>

        {/* Activity */}
        <TabPanel active={tab} activeKey="activity">
          <CardBody>
            {data.timeline.length === 0 ? (
              <EmptyState
                title="No activity recorded"
                description="Status changes and administrative actions on this record will appear here."
                icon={<Activity className="h-6 w-6" />}
              />
            ) : (
              <ol className="space-y-4">
                {data.timeline.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                      <Activity className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink-800">
                        <span className="font-medium text-ink-900">
                          {entry.actor_name ?? 'System'}
                        </span>{' '}
                        {entry.action.replace(/_/g, ' ').toLowerCase()}
                        {entry.entity_code ? (
                          <>
                            {' '}
                            <span className="font-medium text-ink-700">{entry.entity_code}</span>
                          </>
                        ) : null}
                      </p>
                      {entry.details ? (
                        <p className="mt-0.5 text-xs text-ink-600">{entry.details}</p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-ink-500">
                        {formatDateTime(entry.created_at)} · {relativeTime(entry.created_at)}
                      </p>
                    </div>
                    {entry.from_status || entry.to_status ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        {entry.from_status ? <StatusBadge status={entry.from_status} /> : null}
                        {entry.from_status && entry.to_status ? (
                          <span className="text-xs text-ink-400">→</span>
                        ) : null}
                        {entry.to_status ? <StatusBadge status={entry.to_status} /> : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </TabPanel>
      </Card>

      {/* Change status */}
      <Modal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title="Change workflow status"
        description="Only the workflow states permitted for this record are listed."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setStatusOpen(false)} disabled={statusBusy}>
              Cancel
            </Button>
            <Button loading={statusBusy} onClick={submitStatusChange}>
              Update status
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="label-base">
              Current status <span className="text-rose-500">*</span>
            </p>
            <div className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700">
              <StatusBadge status={record.status} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="label-base">
              Move to <span className="text-rose-500">*</span>
            </p>
            {transitions.length === 0 ? (
              <p className="text-sm text-ink-500">
                No further workflow transition is available from the current status.
              </p>
            ) : (
              <div className="space-y-2">
                {transitions.map((target) => (
                  <label
                    key={target}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-ink-200 px-3 py-2 text-sm transition hover:border-brand-300"
                  >
                    <input
                      type="radio"
                      name="ipr-next-status"
                      value={target}
                      checked={nextStatus === target}
                      onChange={() => setNextStatus(target)}
                      className="h-4 w-4 border-ink-300 text-brand-600 focus:ring-brand-200"
                    />
                    <StatusBadge status={target} />
                  </label>
                ))}
              </div>
            )}
          </div>

          <Textarea
            label="Note (optional)"
            rows={3}
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            placeholder="Add an administrative note for the audit trail…"
            hint="The note is appended to the record's administrative notes."
          />

          {statusError ? (
            <p className="text-xs font-medium text-rose-600" role="alert">
              {statusError}
            </p>
          ) : null}
        </div>
      </Modal>

      {/* Upload document */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload document"
        description={`Attach a supporting file to ${record.ipr_code}.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploadBusy}>
              Cancel
            </Button>
            <Button loading={uploadBusy} onClick={submitUpload}>
              Upload
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Document name"
            required
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder="e.g. Disclosure form — signed"
          />
          <Select
            label="Category"
            required
            value={docCategory}
            onChange={(e) => setDocCategory(e.target.value)}
            options={Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, text]) => ({
              value,
              label: text,
            }))}
          />
          <Textarea
            label="Description"
            rows={3}
            value={docDescription}
            onChange={(e) => setDocDescription(e.target.value)}
            placeholder="Optional description of the attachment…"
          />
          <div>
            <label className="label-base" htmlFor="ipr-doc-file">
              Files <span className="text-rose-500">*</span>
            </label>
            <input
              id="ipr-doc-file"
              type="file"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="input-base file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-brand-700"
            />
            <p className="mt-1 text-xs text-ink-500">
              Accepted: PDF, Word, Excel, PowerPoint, CSV, TXT and common image formats (max 10 MB each).
            </p>
          </div>
          {files.length > 0 ? (
            <ul className="space-y-1 text-xs text-ink-600">
              {files.map((file) => (
                <li key={file.name} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                  {file.name}
                </li>
              ))}
            </ul>
          ) : null}
          {uploadError ? (
            <p className="text-xs font-medium text-rose-600" role="alert">
              {uploadError}
            </p>
          ) : null}
        </div>
      </Modal>

      {/* Delete draft */}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete draft IPR record"
        tone="danger"
        confirmLabel="Delete record"
        message={
          <p>
            Deleting <span className="font-semibold">{record.ipr_code}</span> — {record.title} —
            removes the record permanently. Only records still in Draft can be deleted.
            {deleteError ? (
              <span className="mt-2 block text-xs font-medium text-rose-600">{deleteError}</span>
            ) : null}
          </p>
        }
        loading={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteError(null);
        }}
      />

      <div className="flex items-center gap-2 text-xs text-ink-400">
        <MessageSquare className="h-3.5 w-3.5" />
        Record views are administrative. No statement on this page is legal advice.
      </div>
    </div>
  );
}
