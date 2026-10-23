import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  MoreVertical,
  Plus,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAsync, useDebounced, usePaged } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { PRIORITY_TONES, label } from '../lib/constants';
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
  Tabs,
  Textarea,
  useToast,
} from '../components/ui';
import type { BadgeTone } from '../components/ui';
import { FilterBar, MetaChip, StatusBadge } from '../components/common';

type TabKey = 'all' | 'mine' | 'approved' | 'rejected' | 'returned';

interface ApprovalRow {
  id: number;
  request_code: string;
  subject_type: string;
  subject_id: number;
  request_type: string;
  description: string | null;
  submitted_by: number;
  assigned_reviewer_id: number | null;
  current_stage: string | null;
  stages: string;
  status: string;
  priority: string;
  due_at: string | null;
  submitted_at: string;
  decided_at: string | null;
  updated_at: string;
  reviewer_name: string | null;
  submitted_by_name: string;
  days_pending: number;
  document_count: number;
  decision_count: number;
  subject_title: string;
  subject_code: string;
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

const TAB_STATUS: Partial<Record<TabKey, string>> = {
  approved: 'APPROVED',
  rejected: 'REJECTED',
  returned: 'RETURNED_FOR_CORRECTION',
};

const SUBJECT_TYPE_LABELS: Record<string, string> = {
  PROJECT: 'Research project',
  IPR: 'IPR record',
  STARTUP: 'Startup',
};

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

export default function Approvals() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [subjectType, setSubjectType] = useState('');
  const [stage, setStage] = useState('');
  const debouncedSearch = useDebounced(search, 300);

  const meta = useAsync<ApprovalsMeta>(() => api.get<ApprovalsMeta>('/approvals/meta'), []);

  const effectiveStatus = TAB_STATUS[tab] ?? statusFilter;

  const params = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      status: effectiveStatus || undefined,
      subjectType: subjectType || undefined,
      stage: stage || undefined,
      tab: tab === 'mine' ? 'mine' : undefined,
    }),
    [debouncedSearch, effectiveStatus, subjectType, stage, tab],
  );

  const list = usePaged<ApprovalRow>('/approvals', params);
  const rows = list.data?.data ?? [];
  const counts = meta.data?.counts;
  const statuses = meta.data?.statuses ?? [];
  const reviewers = meta.data?.reviewers ?? [];

  const stageOptions = useMemo(() => {
    const all = Object.values(meta.data?.stages ?? {}).flat();
    return Array.from(new Set(all));
  }, [meta.data]);

  const canCreate =
    can('project.create') || can('ipr.create') || can('startup.register');

  const [submitOpen, setSubmitOpen] = useState(false);
  const [subjectTypeInput, setSubjectTypeInput] = useState('PROJECT');
  const [subjectId, setSubjectId] = useState('');
  const [requestType, setRequestType] = useState('');
  const [submitDescription, setSubmitDescription] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [dueAt, setDueAt] = useState('');
  const [assignedReviewerId, setAssignedReviewerId] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function resetFilters() {
    setSearch('');
    setStatusFilter('');
    setSubjectType('');
    setStage('');
    setTab('all');
    list.setPage(1);
  }

  function handleTabChange(key: string) {
    setTab(key as TabKey);
    setStatusFilter('');
    list.setPage(1);
  }

  function openSubmit() {
    setSubjectTypeInput('PROJECT');
    setSubjectId('');
    setRequestType('');
    setSubmitDescription('');
    setPriority('NORMAL');
    setDueAt('');
    setAssignedReviewerId('');
    setSubmitError(null);
    setSubmitOpen(true);
  }

  async function submitRequest() {
    if (!requestType.trim() || requestType.trim().length < 3) {
      setSubmitError('Request type must be at least 3 characters.');
      return;
    }
    const parsedId = Number(subjectId);
    if (!subjectId || !Number.isInteger(parsedId) || parsedId <= 0) {
      setSubmitError('Enter the numeric id of the record being submitted.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.post<{ id: number; requestCode: string; message: string }>(
        '/approvals',
        {
          subjectType: subjectTypeInput,
          subjectId: parsedId,
          requestType: requestType.trim(),
          description: submitDescription.trim(),
          priority,
          dueAt,
          assignedReviewerId: assignedReviewerId ? Number(assignedReviewerId) : null,
        },
      );
      toast.success('Request submitted', `${res.requestCode} · ${res.message}`);
      setSubmitOpen(false);
      list.reload();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to submit the request.');
    } finally {
      setSubmitting(false);
    }
  }

  const tabs = [
    { key: 'all', label: 'All requests' },
    { key: 'mine', label: 'My pending tasks', count: counts?.mine },
    { key: 'approved', label: 'Approved', count: counts?.approved },
    { key: 'rejected', label: 'Rejected', count: counts?.rejected },
    { key: 'returned', label: 'Returned for correction', count: counts?.returned },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description="Tracks requests submitted for administrative review across research projects, IPR records and startups, together with the stage each request has reached."
        actions={
          canCreate ? (
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openSubmit}>
              Submit request
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Pending requests"
          value={counts?.all_pending ?? 0}
          icon={<ClipboardList className="h-5 w-5" />}
          hint="Awaiting a decision at any stage"
          tone="amber"
        />
        <StatCard
          title="My pending tasks"
          value={counts?.mine ?? 0}
          icon={<Clock className="h-5 w-5" />}
          hint="Requests assigned to you"
          tone="brand"
        />
        <StatCard
          title="Approved"
          value={counts?.approved ?? 0}
          icon={<CheckCircle2 className="h-5 w-5" />}
          hint="Completed every review stage"
          tone="emerald"
        />
        <StatCard
          title="Returned / rejected"
          value={(counts?.returned ?? 0) + (counts?.rejected ?? 0)}
          icon={<AlertTriangle className="h-5 w-5" />}
          hint={`${counts?.returned ?? 0} returned · ${counts?.rejected ?? 0} rejected`}
          tone="rose"
        />
      </div>

      <Card>
        <Tabs tabs={tabs} active={tab} onChange={handleTabChange} />

        <FilterBar>
          <div className="w-full sm:w-64">
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                list.setPage(1);
              }}
              placeholder="Search request code or type…"
              aria-label="Search approval requests"
              className="h-9 py-0"
            />
          </div>
          <div className="w-full sm:w-52">
            <Select
              value={effectiveStatus}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setTab('all');
                list.setPage(1);
              }}
              placeholder="All statuses"
              aria-label="Filter by status"
              options={statuses.map((s) => ({ value: s, label: label(s) }))}
              className="h-9 py-0"
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              value={subjectType}
              onChange={(e) => {
                setSubjectType(e.target.value);
                list.setPage(1);
              }}
              placeholder="All subjects"
              aria-label="Filter by subject type"
              options={Object.entries(SUBJECT_TYPE_LABELS).map(([value, text]) => ({
                value,
                label: text,
              }))}
              className="h-9 py-0"
            />
          </div>
          <div className="w-full sm:w-56">
            <Select
              value={stage}
              onChange={(e) => {
                setStage(e.target.value);
                list.setPage(1);
              }}
              placeholder="All stages"
              aria-label="Filter by review stage"
              options={stageOptions.map((s) => ({ value: s, label: s }))}
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
            title="No approval requests found"
            description="No requests match the current tab and filters. Try clearing the filters or submit a new request."
            icon={<ClipboardList className="h-6 w-6" />}
            action={
              canCreate ? (
                <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openSubmit}>
                  Submit request
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <TableWrapper>
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-2.5">Request</th>
                  <th className="px-4 py-2.5">Subject</th>
                  <th className="px-4 py-2.5">Stage</th>
                  <th className="px-4 py-2.5">Reviewer</th>
                  <th className="px-4 py-2.5">Priority</th>
                  <th className="px-4 py-2.5">Days pending</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((row) => (
                  <tr key={row.id} className="transition hover:bg-ink-50">
                    <td className="table-cell whitespace-normal">
                      <Link
                        to={`/approvals/${row.id}`}
                        className="font-medium text-ink-900 hover:text-brand-700"
                      >
                        {row.request_code}
                      </Link>
                      <p className="text-xs text-ink-500">{row.request_type}</p>
                    </td>
                    <td className="table-cell whitespace-normal">
                      <span className="font-medium text-ink-800">{row.subject_code}</span>
                      <p className="text-xs text-ink-500">
                        {SUBJECT_TYPE_LABELS[row.subject_type] ?? row.subject_type} · {row.subject_title}
                      </p>
                    </td>
                    <td className="table-cell whitespace-normal text-xs text-ink-700">
                      {row.current_stage ?? '—'}
                    </td>
                    <td className="table-cell">{row.reviewer_name ?? 'Unassigned'}</td>
                    <td className="table-cell">
                      <Badge tone={(PRIORITY_TONES[row.priority] ?? 'neutral') as BadgeTone}>
                        {label(row.priority)}
                      </Badge>
                    </td>
                    <td className="table-cell">
                      {row.days_pending > 14 ? (
                        <Badge tone="danger">Overdue</Badge>
                      ) : (
                        <Badge tone="neutral">{row.days_pending}d</Badge>
                      )}
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
                          onClick={() => navigate(`/approvals/${row.id}`)}
                        >
                          View request
                        </DropdownItem>
                        {row.status === 'RETURNED_FOR_CORRECTION' ? (
                          <>
                            <DropdownDivider />
                            <DropdownItem
                              icon={<RotateCcw className="h-4 w-4" />}
                              onClick={() => navigate(`/approvals/${row.id}`)}
                            >
                              Resubmit from request page
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
              itemLabel="approval requests"
            />
          </>
        )}
      </Card>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
          <MetaChip>Administrative workflow</MetaChip>
          <span>
            Review stages and deadlines are administrative checkpoints recorded by the committee. Approval here does not
            represent a legal or funding determination.
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5" />
            Counts refresh with every load
          </span>
        </CardBody>
      </Card>

      {/* Submit request */}
      <Modal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title="Submit approval request"
        description="Route a record for administrative review through the stage order defined for its type."
        footer={
          <>
            <Button variant="outline" onClick={() => setSubmitOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button loading={submitting} onClick={submitRequest}>
              Submit for review
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Subject type"
              required
              value={subjectTypeInput}
              onChange={(e) => setSubjectTypeInput(e.target.value)}
              options={Object.entries(SUBJECT_TYPE_LABELS).map(([value, text]) => ({
                value,
                label: text,
              }))}
            />
            <Input
              label="Subject id"
              required
              type="number"
              min={1}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder="e.g. 12"
              hint="Numeric id of the project, IPR record or startup."
            />
          </div>
          <Input
            label="Request type"
            required
            value={requestType}
            onChange={(e) => setRequestType(e.target.value)}
            placeholder="e.g. Filing authorisation request"
          />
          <Textarea
            label="Description"
            rows={3}
            value={submitDescription}
            onChange={(e) => setSubmitDescription(e.target.value)}
            placeholder="Context for the reviewing committee…"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              options={PRIORITIES.map((p) => ({ value: p, label: label(p) }))}
            />
            <Input
              label="Due date"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>
          <Select
            label="Assign reviewer"
            value={assignedReviewerId}
            onChange={(e) => setAssignedReviewerId(e.target.value)}
            placeholder="Assign automatically"
            options={reviewers.map((r) => ({ value: r.id, label: `${r.full_name} (${r.email})` }))}
            hint="Leave blank to let the workflow assign the default reviewer for the stage."
          />
          {submitError ? (
            <p className="text-xs font-medium text-rose-600" role="alert">
              {submitError}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
