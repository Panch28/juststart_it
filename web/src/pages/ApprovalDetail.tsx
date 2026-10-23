import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  MessageSquare,
  RotateCcw,
  Send,
  ThumbsDown,
  ThumbsUp,
  UserCog,
} from 'lucide-react';
import { api, fileUrl } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { formatDate, formatDateTime, relativeTime } from '../lib/format';
import { PRIORITY_TONES, label } from '../lib/constants';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Textarea,
  useToast,
} from '../components/ui';
import type { BadgeTone } from '../components/ui';
import { DetailGrid, DetailItem, MetaChip, StatusBadge } from '../components/common';

type DecisionKind = 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'COMMENT';

interface ApprovalRequest {
  id: number;
  request_code: string;
  subject_type: string;
  subject_id: number;
  request_type: string;
  description: string | null;
  submitted_by: number;
  submitted_by_name: string;
  submitted_by_email: string;
  assigned_reviewer_id: number | null;
  reviewer_name: string | null;
  reviewer_email: string | null;
  current_stage: string | null;
  stages: string;
  status: string;
  priority: string;
  due_at: string | null;
  submitted_at: string;
  decided_at: string | null;
  updated_at: string;
  days_pending: number;
  document_count: number;
  decision_count: number;
  subject_title: string;
  subject_code: string;
}

interface Decision {
  id: number;
  request_id: number;
  reviewer_id: number | null;
  stage: string | null;
  decision: string;
  comment: string | null;
  created_at: string;
  reviewer_name: string | null;
  reviewer_role: string | null;
}

interface DocumentRow {
  id: number;
  name: string;
  category: string;
  file_type: string | null;
  file_size: number | null;
  upload_date: string;
  version: number | null;
  uploaded_by_name: string | null;
}

interface RelatedProject {
  id?: number;
  project_code?: string;
  title?: string;
  domain?: string;
  category?: string;
  status?: string;
  progress?: number;
}

interface ApprovalPermissions {
  canReview: boolean;
  canComment: boolean;
  canResubmit: boolean;
  isAssignedReviewer: boolean;
}

interface ApprovalDetailResponse {
  request: ApprovalRequest;
  decisions: Decision[];
  documents: DocumentRow[];
  relatedProject: RelatedProject | null;
  stages: string[];
  currentStageIndex: number;
  permissions: ApprovalPermissions;
}

interface ApprovalsMeta {
  counts: {
    mine: number;
    all_pending: number;
    approved: number;
    rejected: number;
    returned: number;
  };
  statuses: string[];
  stages: Record<string, string[]>;
  reviewers: Array<{ id: number; full_name: string; email: string }>;
  canReview: boolean;
  canViewAll: boolean;
}

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

const SUBJECT_TYPE_LABELS: Record<string, string> = {
  PROJECT: 'Research project',
  IPR: 'IPR record',
  STARTUP: 'Startup',
};

function formatSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ApprovalDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { user } = useAuth();
  const requestId = Number(id);

  const { data, loading, error, reload } = useAsync<ApprovalDetailResponse>(
    () => api.get<ApprovalDetailResponse>(`/approvals/${requestId}`),
    [requestId],
  );
  const meta = useAsync<ApprovalsMeta>(() => api.get<ApprovalsMeta>('/approvals/meta'), []);

  const [decision, setDecision] = useState<DecisionKind | null>(null);
  const [comment, setComment] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [resubmitComment, setResubmitComment] = useState('');
  const [resubmitBusy, setResubmitBusy] = useState(false);
  const [resubmitError, setResubmitError] = useState<string | null>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [reviewerId, setReviewerId] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const request = data?.request;
  const permissions = data?.permissions;
  const stages = data?.stages ?? [];
  const currentStageIndex = data?.currentStageIndex ?? -1;
  const reviewers = meta.data?.reviewers ?? [];
  const isAdmin = user?.role === 'ADMINISTRATOR';

  const commentRequired = decision === 'REJECTED' || decision === 'CHANGES_REQUESTED';
  const commentTooShort = commentRequired && comment.trim().length < 5;

  function openDecision(kind: DecisionKind) {
    setDecision(kind);
    setComment('');
    setDecisionError(null);
  }

  function closeDecision() {
    setDecision(null);
    setConfirmOpen(false);
    setDecisionError(null);
  }

  async function submitDecision() {
    if (!request || !decision) return;
    if (commentRequired && comment.trim().length < 5) {
      setDecisionError('Please provide a reason of at least 5 characters.');
      setConfirmOpen(false);
      return;
    }
    setDecisionBusy(true);
    try {
      const res = await api.post<{ id: number; status: string; currentStage: string; message: string }>(
        `/approvals/${request.id}/decisions`,
        { decision, comment: comment.trim() },
      );
      toast.success('Decision recorded', res.message);
      closeDecision();
      reload();
    } catch (err) {
      setConfirmOpen(false);
      setDecisionError(err instanceof Error ? err.message : 'Unable to record the decision.');
    } finally {
      setDecisionBusy(false);
    }
  }

  async function submitResubmit() {
    if (!request) return;
    setResubmitBusy(true);
    setResubmitError(null);
    try {
      const res = await api.post<{ message: string }>(`/approvals/${request.id}/resubmit`, {
        comment: resubmitComment.trim(),
      });
      toast.success('Request resubmitted', res.message);
      setResubmitOpen(false);
      setResubmitComment('');
      reload();
    } catch (err) {
      setResubmitError(err instanceof Error ? err.message : 'Unable to resubmit the request.');
    } finally {
      setResubmitBusy(false);
    }
  }

  async function submitAssign() {
    if (!request) return;
    if (!reviewerId) {
      setAssignError('Select a reviewer.');
      return;
    }
    setAssignBusy(true);
    setAssignError(null);
    try {
      const res = await api.patch<{ message: string }>(`/approvals/${request.id}/assign`, {
        assignedReviewerId: Number(reviewerId),
      });
      toast.success('Reviewer assigned', res.message);
      setAssignOpen(false);
      reload();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'Unable to assign the reviewer.');
    } finally {
      setAssignBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <Card>
        <Spinner label="Loading approval request…" />
      </Card>
    );
  }

  if (error || !data || !request) {
    return (
      <div className="space-y-4">
        <Link
          to="/approvals"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to approvals
        </Link>
        <Card>
          <ErrorState message={error ?? 'Approval request not found.'} onRetry={reload} />
        </Card>
      </div>
    );
  }

  const related = data.relatedProject;
  const perms = data.permissions;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/approvals"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 transition hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to approvals
        </Link>
        <PageHeader
          title={`${request.request_code} — ${request.request_type}`}
          description={`${SUBJECT_TYPE_LABELS[request.subject_type] ?? request.subject_type} · ${request.subject_code} · ${request.subject_title}`}
          className="mt-2"
          meta={
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={request.status} />
              <Badge tone={(PRIORITY_TONES[request.priority] ?? 'neutral') as BadgeTone}>
                {label(request.priority)} priority
              </Badge>
              {request.days_pending > 14 ? (
                <Badge tone="danger">Overdue · {request.days_pending}d pending</Badge>
              ) : (
                <Badge tone="neutral">{request.days_pending}d pending</Badge>
              )}
              {request.current_stage ? <MetaChip>{request.current_stage}</MetaChip> : null}
            </div>
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Request summary" description="Submitted record and review context." />
            <CardBody className="space-y-5">
              <DetailGrid columns={2}>
                <DetailItem label="Subject type">
                  {SUBJECT_TYPE_LABELS[request.subject_type] ?? request.subject_type}
                </DetailItem>
                <DetailItem label="Subject">
                  {request.subject_code} — {request.subject_title}
                </DetailItem>
                <DetailItem label="Submitted by">
                  {request.submitted_by_name}
                  {request.submitted_by_email ? (
                    <span className="block text-xs text-ink-500">{request.submitted_by_email}</span>
                  ) : null}
                </DetailItem>
                <DetailItem label="Reviewer">
                  {request.reviewer_name ?? 'Unassigned'}
                  {request.reviewer_email ? (
                    <span className="block text-xs text-ink-500">{request.reviewer_email}</span>
                  ) : null}
                </DetailItem>
                <DetailItem label="Submitted on">{formatDateTime(request.submitted_at)}</DetailItem>
                <DetailItem label="Due date">{formatDate(request.due_at)}</DetailItem>
                <DetailItem label="Decided on">{formatDateTime(request.decided_at)}</DetailItem>
                <DetailItem label="Documents">{request.document_count}</DetailItem>
              </DetailGrid>

              <div>
                <h3 className="text-sm font-semibold text-ink-900">Description</h3>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                  {request.description || 'No description was provided with this request.'}
                </p>
              </div>
            </CardBody>
          </Card>

          {/* Stage tracker */}
          <Card>
            <CardHeader
              title="Review stages"
              description="Stages are applied in the order defined for this subject type."
            />
            <CardBody>
              {stages.length === 0 ? (
                <p className="text-sm text-ink-500">No stages are configured for this request.</p>
              ) : (
                <ol className="space-y-0">
                  {stages.map((stageName, index) => {
                    const state =
                      index < currentStageIndex
                        ? 'done'
                        : index === currentStageIndex
                          ? 'current'
                          : 'todo';
                    const last = index === stages.length - 1;
                    return (
                      <li key={stageName} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                              state === 'done'
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                : state === 'current'
                                  ? 'border-brand-600 bg-brand-600 text-white'
                                  : 'border-ink-200 bg-white text-ink-400'
                            }`}
                          >
                            {state === 'done' ? (
                              <Check className="h-4 w-4" aria-hidden />
                            ) : state === 'current' ? (
                              <Circle className="h-3 w-3 fill-current" aria-hidden />
                            ) : (
                              index + 1
                            )}
                          </span>
                          {!last ? (
                            <span
                              className={`my-1 w-0.5 flex-1 ${
                                state === 'done' ? 'bg-emerald-300' : 'bg-ink-200'
                              }`}
                            />
                          ) : null}
                        </div>
                        <div className={`pb-5 ${last ? 'pb-0' : ''}`}>
                          <p
                            className={`text-sm font-medium ${
                              state === 'todo' ? 'text-ink-500' : 'text-ink-900'
                            }`}
                          >
                            {stageName}
                          </p>
                          <p className="text-xs text-ink-500">
                            {state === 'done'
                              ? 'Completed'
                              : state === 'current'
                                ? 'Currently under review'
                                : 'Not started'}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardBody>
          </Card>

          {/* Related project */}
          {related ? (
            <Card>
              <CardHeader
                title="Related research project"
                description="The project this request was raised against."
              />
              <CardBody>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link
                      to={`/projects/${related.id}`}
                      className="text-sm font-semibold text-ink-900 hover:text-brand-700"
                    >
                      {related.project_code} — {related.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {related.domain ?? '—'} · {related.category ?? '—'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {related.status ? <StatusBadge status={related.status} /> : null}
                    <Badge tone="neutral">
                      <Building2 className="h-3.5 w-3.5" aria-hidden />
                      {related.progress ?? 0}% complete
                    </Badge>
                  </div>
                </div>
              </CardBody>
            </Card>
          ) : null}

          {/* Documents */}
          <Card>
            <CardHeader title="Documents" description="Files attached to this approval request." />
            <CardBody>
              {data.documents.length === 0 ? (
                <EmptyState
                  title="No documents attached"
                  description="Supporting files for this request will be listed here."
                  icon={<FileText className="h-6 w-6" />}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-ink-200">
                    <thead className="table-head">
                      <tr>
                        <th className="px-4 py-2.5">Document</th>
                        <th className="px-4 py-2.5">Category</th>
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
                          <td className="table-cell">{label(doc.category)}</td>
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
          </Card>

          {/* Decision history */}
          <Card>
            <CardHeader
              title="Decision history"
              description="Every recorded decision and comment on this request."
            />
            <CardBody>
              {data.decisions.length === 0 ? (
                <EmptyState
                  title="No decisions recorded"
                  description="Decisions and comments from reviewers will appear here."
                  icon={<MessageSquare className="h-6 w-6" />}
                />
              ) : (
                <ul className="space-y-3">
                  {data.decisions.map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-ink-200 p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={DECISION_TONES[entry.decision] ?? 'neutral'}>
                          {DECISION_LABELS[entry.decision] ?? label(entry.decision)}
                        </Badge>
                        <span className="text-xs font-medium text-ink-700">
                          {entry.reviewer_name ?? 'System'}
                        </span>
                        {entry.reviewer_role ? <MetaChip>{label(entry.reviewer_role)}</MetaChip> : null}
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
            </CardBody>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          {perms.canReview ? (
            <Card>
              <CardHeader
                title="Record a decision"
                description="Your decision advances the request to the next review stage."
              />
              <CardBody className="space-y-3">
                <Button
                  variant="primary"
                  className="w-full justify-center"
                  icon={<ThumbsUp className="h-4 w-4" />}
                  onClick={() => openDecision('APPROVED')}
                >
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  className="w-full justify-center"
                  icon={<RotateCcw className="h-4 w-4" />}
                  onClick={() => openDecision('CHANGES_REQUESTED')}
                >
                  Request changes
                </Button>
                <Button
                  variant="danger"
                  className="w-full justify-center"
                  icon={<ThumbsDown className="h-4 w-4" />}
                  onClick={() => openDecision('REJECTED')}
                >
                  Reject
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-center"
                  icon={<MessageSquare className="h-4 w-4" />}
                  onClick={() => openDecision('COMMENT')}
                >
                  Add comment
                </Button>
                <p className="pt-1 text-xs leading-relaxed text-ink-500">
                  Rejecting or requesting changes requires a written reason of at least 5 characters.
                </p>
              </CardBody>
            </Card>
          ) : null}

          {perms.canResubmit ? (
            <Card>
              <CardHeader
                title="Returned for correction"
                description="Update the record and send it back for review."
              />
              <CardBody className="space-y-3">
                <p className="text-xs leading-relaxed text-ink-600">
                  This request was returned by the reviewer. Add a note describing the correction and resubmit it.
                </p>
                <Button
                  variant="primary"
                  className="w-full justify-center"
                  icon={<Send className="h-4 w-4" />}
                  onClick={() => {
                    setResubmitComment('');
                    setResubmitError(null);
                    setResubmitOpen(true);
                  }}
                >
                  Resubmit for review
                </Button>
              </CardBody>
            </Card>
          ) : null}

          {isAdmin ? (
            <Card>
              <CardHeader title="Administration" description="Reassign the reviewer of this request." />
              <CardBody className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-center"
                  icon={<UserCog className="h-4 w-4" />}
                  onClick={() => {
                    setReviewerId(
                      request.assigned_reviewer_id ? String(request.assigned_reviewer_id) : '',
                    );
                    setAssignError(null);
                    setAssignOpen(true);
                  }}
                >
                  Assign reviewer
                </Button>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Record facts" description="Values reported by the server." />
            <CardBody className="space-y-2 text-xs text-ink-600">
              <p className="flex items-center justify-between gap-3">
                <span>Request code</span>
                <span className="font-semibold text-ink-800">{request.request_code}</span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span>Decisions recorded</span>
                <span className="font-semibold text-ink-800">{data.decisions.length}</span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span>Current stage</span>
                <span className="font-semibold text-ink-800">{request.current_stage ?? '—'}</span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span>Last updated</span>
                <span className="font-semibold text-ink-800">{formatDate(request.updated_at)}</span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span>Due date</span>
                <span className="flex items-center gap-1 font-semibold text-ink-800">
                  <CalendarClock className="h-3.5 w-3.5 text-ink-400" aria-hidden />
                  {formatDate(request.due_at)}
                </span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span>Your role</span>
                <span className="font-semibold text-ink-800">
                  {perms.isAssignedReviewer ? 'Assigned reviewer' : 'Participant'}
                </span>
              </p>
              {request.status === 'APPROVED' ? (
                <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-2 text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  Every review stage has been completed for this request.
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Decision composer */}
      <Modal
        open={decision !== null}
        onClose={closeDecision}
        title={
          decision === 'APPROVED'
            ? 'Approve request'
            : decision === 'REJECTED'
              ? 'Reject request'
              : decision === 'CHANGES_REQUESTED'
                ? 'Request changes'
                : 'Add comment'
        }
        description={
          decision === 'APPROVED'
            ? 'Approving moves the request to the next stage, or closes it when this is the final stage.'
            : decision === 'REJECTED'
              ? 'A written reason is required when rejecting a request.'
              : decision === 'CHANGES_REQUESTED'
                ? 'Explain what the submitter needs to correct.'
                : 'Leave a note for the submitter and the committee.'
        }
        footer={
          <>
            <Button variant="outline" onClick={closeDecision} disabled={decisionBusy}>
              Cancel
            </Button>
            <Button
              variant={decision === 'REJECTED' ? 'danger' : 'primary'}
              disabled={commentTooShort}
              onClick={() => setConfirmOpen(true)}
            >
              Review &amp; confirm
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Textarea
            label={commentRequired ? 'Reason' : 'Comment'}
            required={commentRequired}
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            error={commentTooShort ? 'Please provide a reason of at least 5 characters.' : null}
            placeholder="Add context for the record…"
          />
          {decisionError ? (
            <p className="text-xs font-medium text-rose-600" role="alert">
              {decisionError}
            </p>
          ) : null}
        </div>
      </Modal>

      {/* Second confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        title="Confirm decision"
        tone={decision === 'REJECTED' ? 'danger' : 'primary'}
        confirmLabel={decision ? DECISION_LABELS[decision] : 'Confirm'}
        message={
          <p>
            You are about to record a <span className="font-semibold">
              {decision ? DECISION_LABELS[decision] : 'decision'}
            </span>{' '}
            decision on <span className="font-semibold">{request.request_code}</span> at stage{' '}
            <span className="font-semibold">{request.current_stage ?? '—'}</span>.
            {comment.trim() ? (
              <span className="mt-2 block whitespace-pre-line rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
                {comment.trim()}
              </span>
            ) : null}
          </p>
        }
        loading={decisionBusy}
        onConfirm={submitDecision}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Resubmit */}
      <Modal
        open={resubmitOpen}
        onClose={() => setResubmitOpen(false)}
        title="Resubmit for review"
        description="The request returns to the first stage with your note attached."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setResubmitOpen(false)} disabled={resubmitBusy}>
              Cancel
            </Button>
            <Button loading={resubmitBusy} onClick={submitResubmit}>
              Resubmit
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Textarea
            label="Correction note"
            rows={4}
            value={resubmitComment}
            onChange={(e) => setResubmitComment(e.target.value)}
            placeholder="Describe what was corrected…"
          />
          {resubmitError ? (
            <p className="text-xs font-medium text-rose-600" role="alert">
              {resubmitError}
            </p>
          ) : null}
        </div>
      </Modal>

      {/* Assign reviewer */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign reviewer"
        description="Reassign this request to another reviewer."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={assignBusy}>
              Cancel
            </Button>
            <Button loading={assignBusy} onClick={submitAssign}>
              Assign reviewer
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select
            label="Reviewer"
            required
            value={reviewerId}
            onChange={(e) => setReviewerId(e.target.value)}
            placeholder="Select a reviewer"
            options={reviewers.map((r) => ({ value: r.id, label: `${r.full_name} (${r.email})` }))}
          />
          {assignError ? (
            <p className="text-xs font-medium text-rose-600" role="alert">
              {assignError}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
