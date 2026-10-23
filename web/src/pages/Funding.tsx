import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Coins,
  FilterX,
  HandCoins,
  Landmark,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { Paged } from '../lib/api';
import { useAsync, useDebounced, usePaged } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { formatCurrency, formatDate, formatNumber, truncate } from '../lib/format';
import { label } from '../lib/constants';
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
  Pagination,
  Select,
  StatCard,
  TableSkeleton,
  TabPanel,
  Tabs,
  Textarea,
  useToast,
} from '../components/ui';
import { FilterBar, MetaChip, NoticeBanner, StatusBadge } from '../components/common';

/* ------------------------------------------------------------------ types */

type OpportunityCategory = 'RESEARCH' | 'STARTUP' | 'BOTH';
type OpportunityStatus = 'UPCOMING' | 'OPEN' | 'CLOSED';
type RecordStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'PARTIALLY_RECEIVED' | 'RECEIVED';

interface OpportunityRow {
  id: number;
  code: string;
  title: string;
  organization: string;
  category: OpportunityCategory;
  domain: string | null;
  amount_min: number | null;
  amount_max: number | null;
  eligibility: string;
  description: string;
  opens_on: string | null;
  closes_on: string | null;
  external_url: string | null;
  status: OpportunityStatus;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  application_count: number;
  requested_total: number;
  days_to_close: number | null;
}

interface OpportunityMeta {
  organizations: { organization: string }[];
  domains: { domain: string }[];
  categories: string[];
  statuses: string[];
}

interface FundingRecord {
  id: number;
  subject_type: 'PROJECT' | 'STARTUP';
  subject_id: number;
  source: string;
  opportunity_id: number | null;
  requested_amount: number;
  approved_amount: number;
  received_amount: number;
  application_date: string | null;
  decision_date: string | null;
  status: RecordStatus;
  notes: string | null;
  created_at: string;
  opportunity_code: string | null;
  opportunity_title: string | null;
  subject_code: string | null;
  subject_title: string | null;
}

interface FundingTotals {
  requested: number;
  approved: number;
  received: number;
  records: number;
}

interface RecordsResponse {
  records: FundingRecord[];
  totals: FundingTotals;
}

interface DashboardKpis {
  kpis: Record<string, number>;
}

/* --------------------------------------------------------------- helpers */

const CATEGORY_LABELS: Record<OpportunityCategory, string> = {
  RESEARCH: 'Research',
  STARTUP: 'Startup',
  BOTH: 'Research & Startup',
};

const RECORD_STATUSES: RecordStatus[] = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
];

const EMPTY_TOTALS: FundingTotals = { requested: 0, approved: 0, received: 0, records: 0 };

/** Grant range of an opportunity — never confused with requested/approved/received. */
function grantRange(min: number | null | undefined, max: number | null | undefined): string {
  const hasMin = typeof min === 'number' && Number.isFinite(min);
  const hasMax = typeof max === 'number' && Number.isFinite(max);
  if (hasMin && hasMax) return `${formatCurrency(min)} – ${formatCurrency(max)}`;
  if (hasMin) return `From ${formatCurrency(min)}`;
  if (hasMax) return `Up to ${formatCurrency(max)}`;
  return 'Amount not specified';
}

function deadlineTone(days: number | null | undefined): 'neutral' | 'info' | 'warning' | 'danger' {
  if (days === null || days === undefined) return 'neutral';
  if (days < 0) return 'danger';
  if (days <= 7) return 'warning';
  return 'info';
}

function deadlineLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return 'No deadline';
  if (days < 0) return `OVERDUE by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  if (days === 0) return 'Closes today';
  return `${days} day${days === 1 ? '' : 's'} remaining`;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Turns an API failure into a readable message (including field details). */
function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.details && err.details.length > 0) {
      return `${err.message}: ${err.details.map((d) => `${d.field} — ${d.message}`).join('; ')}`;
    }
    return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/* --------------------------------------------------------- opportunity form */

interface OpportunityFormState {
  title: string;
  organization: string;
  category: OpportunityCategory;
  domain: string;
  amountMin: string;
  amountMax: string;
  eligibility: string;
  description: string;
  opensOn: string;
  closesOn: string;
  externalUrl: string;
  internalNotes: string;
  status: OpportunityStatus;
}

const EMPTY_OPPORTUNITY_FORM: OpportunityFormState = {
  title: '',
  organization: '',
  category: 'RESEARCH',
  domain: '',
  amountMin: '',
  amountMax: '',
  eligibility: '',
  description: '',
  opensOn: '',
  closesOn: '',
  externalUrl: '',
  internalNotes: '',
  status: 'OPEN',
};

function validateOpportunity(form: OpportunityFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (form.title.trim().length < 5) errors.title = 'Title must be at least 5 characters.';
  if (form.organization.trim().length < 3) errors.organization = 'Organization is required.';
  if (form.eligibility.trim().length < 10) errors.eligibility = 'Eligibility summary must be at least 10 characters.';
  if (form.description.trim().length < 20) errors.description = 'Description must be at least 20 characters.';
  if (!form.closesOn) errors.closesOn = 'A closing date is required.';

  const min = form.amountMin.trim() === '' ? null : Number(form.amountMin);
  const max = form.amountMax.trim() === '' ? null : Number(form.amountMax);
  if (min !== null && (!Number.isFinite(min) || min < 0)) errors.amountMin = 'Enter a positive number.';
  if (max !== null && (!Number.isFinite(max) || max < 0)) errors.amountMax = 'Enter a positive number.';
  if (min !== null && max !== null && Number.isFinite(min) && Number.isFinite(max) && max < min) {
    errors.amountMax = 'Maximum amount cannot be lower than the minimum amount.';
  }
  if (form.externalUrl.trim() && !isValidUrl(form.externalUrl.trim())) {
    errors.externalUrl = 'Enter a valid URL (https://…) or leave the field empty.';
  }
  if (form.opensOn && form.closesOn && form.closesOn < form.opensOn) {
    errors.closesOn = 'The closing date cannot be earlier than the opening date.';
  }
  return errors;
}

/* ------------------------------------------------------------- record form */

interface RecordFormState {
  subjectType: 'PROJECT' | 'STARTUP';
  subjectId: string;
  source: string;
  opportunityId: string;
  requestedAmount: string;
  approvedAmount: string;
  receivedAmount: string;
  applicationDate: string;
  decisionDate: string;
  status: RecordStatus;
  notes: string;
}

const EMPTY_RECORD_FORM: RecordFormState = {
  subjectType: 'PROJECT',
  subjectId: '',
  source: '',
  opportunityId: '',
  requestedAmount: '',
  approvedAmount: '0',
  receivedAmount: '0',
  applicationDate: '',
  decisionDate: '',
  status: 'REQUESTED',
  notes: '',
};

function recordToForm(record: FundingRecord): RecordFormState {
  return {
    subjectType: record.subject_type,
    subjectId: String(record.subject_id),
    source: record.source,
    opportunityId: record.opportunity_id ? String(record.opportunity_id) : '',
    requestedAmount: String(record.requested_amount),
    approvedAmount: String(record.approved_amount ?? 0),
    receivedAmount: String(record.received_amount ?? 0),
    applicationDate: record.application_date ? record.application_date.slice(0, 10) : '',
    decisionDate: record.decision_date ? record.decision_date.slice(0, 10) : '',
    status: record.status,
    notes: record.notes ?? '',
  };
}

/** Enforces the requested → approved → received ladder before anything is sent. */
function validateRecord(form: RecordFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  const subjectId = Number(form.subjectId);
  if (!form.subjectId.trim() || !Number.isInteger(subjectId) || subjectId <= 0) {
    errors.subjectId = 'Enter the numeric id of the linked project or startup.';
  }
  if (form.source.trim().length < 3) errors.source = 'Funding source is required.';

  const requested = Number(form.requestedAmount);
  const approved = form.approvedAmount.trim() === '' ? 0 : Number(form.approvedAmount);
  const received = form.receivedAmount.trim() === '' ? 0 : Number(form.receivedAmount);

  if (form.requestedAmount.trim() === '' || !Number.isFinite(requested) || requested < 0) {
    errors.requestedAmount = 'Enter the amount that was requested.';
  }
  if (!Number.isFinite(approved) || approved < 0) {
    errors.approvedAmount = 'Enter a valid approved amount.';
  }
  if (!Number.isFinite(received) || received < 0) {
    errors.receivedAmount = 'Enter a valid received amount.';
  }
  if (Number.isFinite(approved) && Number.isFinite(requested) && approved > requested) {
    errors.approvedAmount = 'Approved cannot be larger than the requested amount.';
  }
  if (Number.isFinite(received) && Number.isFinite(approved) && received > approved) {
    errors.receivedAmount = 'Received cannot be larger than the approved amount.';
  }
  return errors;
}

/* ------------------------------------------------------------ modal: opp */

function OpportunityModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<OpportunityFormState>(EMPTY_OPPORTUNITY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_OPPORTUNITY_FORM);
    setErrors({});
    setServerError(null);
  }, [open]);

  const update = (patch: Partial<OpportunityFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    const validation = validateOpportunity(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    setServerError(null);
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        organization: form.organization.trim(),
        category: form.category,
        domain: form.domain.trim(),
        eligibility: form.eligibility.trim(),
        description: form.description.trim(),
        opensOn: form.opensOn,
        closesOn: form.closesOn,
        externalUrl: form.externalUrl.trim(),
        internalNotes: form.internalNotes.trim(),
        status: form.status,
      };
      if (form.amountMin.trim() !== '') body.amountMin = Number(form.amountMin);
      if (form.amountMax.trim() !== '') body.amountMax = Number(form.amountMax);

      const res = await api.post<{ id: number; code: string; message: string }>(
        '/funding/opportunities',
        body,
      );
      toast.success('Opportunity added', `${res.code} · ${form.title.trim()}`);
      onSaved();
      onClose();
    } catch (err) {
      const message = errorText(err, 'The opportunity could not be saved.');
      setServerError(message);
      toast.error('Could not add the opportunity', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add funding opportunity"
      description="Adds an entry to the internal catalogue. No application is ever submitted to an external funder."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            Add opportunity
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {serverError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {serverError}
          </div>
        ) : null}

        <Input
          label="Title"
          required
          value={form.title}
          error={errors.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="e.g. National Research Fellowship Programme"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Funding organization"
            required
            value={form.organization}
            error={errors.organization}
            onChange={(e) => update({ organization: e.target.value })}
            placeholder="e.g. Department of Science"
          />
          <Select
            label="Category"
            required
            value={form.category}
            options={[
              { value: 'RESEARCH', label: CATEGORY_LABELS.RESEARCH },
              { value: 'STARTUP', label: CATEGORY_LABELS.STARTUP },
              { value: 'BOTH', label: CATEGORY_LABELS.BOTH },
            ]}
            onChange={(e) => update({ category: e.target.value as OpportunityCategory })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Domain"
            value={form.domain}
            onChange={(e) => update({ domain: e.target.value })}
            placeholder="e.g. Renewable energy"
          />
          <Select
            label="Status"
            value={form.status}
            options={[
              { value: 'UPCOMING', label: 'Upcoming' },
              { value: 'OPEN', label: 'Open' },
              { value: 'CLOSED', label: 'Closed' },
            ]}
            onChange={(e) => update({ status: e.target.value as OpportunityStatus })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Grant amount — minimum"
            type="number"
            min={0}
            value={form.amountMin}
            error={errors.amountMin}
            hint="Grant range offered by the funder (not a requested/approved/received figure)."
            onChange={(e) => update({ amountMin: e.target.value })}
          />
          <Input
            label="Grant amount — maximum"
            type="number"
            min={0}
            value={form.amountMax}
            error={errors.amountMax}
            onChange={(e) => update({ amountMax: e.target.value })}
          />
        </div>
        <Input
          label="Opens on"
          type="date"
          value={form.opensOn}
          onChange={(e) => update({ opensOn: e.target.value })}
        />
        <Input
          label="Closes on"
          type="date"
          required
          value={form.closesOn}
          error={errors.closesOn}
          onChange={(e) => update({ closesOn: e.target.value })}
        />
        <Textarea
          label="Eligibility summary"
          required
          rows={3}
          value={form.eligibility}
          error={errors.eligibility}
          onChange={(e) => update({ eligibility: e.target.value })}
          placeholder="Who inside the institution is allowed to apply."
        />
        <Textarea
          label="Description"
          required
          rows={4}
          value={form.description}
          error={errors.description}
          onChange={(e) => update({ description: e.target.value })}
        />
        <Input
          label="External reference URL"
          value={form.externalUrl}
          error={errors.externalUrl}
          hint="Optional. Shown as a read-only external link on the detail page."
          onChange={(e) => update({ externalUrl: e.target.value })}
          placeholder="https://…"
        />
        <Textarea
          label="Internal notes"
          rows={3}
          value={form.internalNotes}
          onChange={(e) => update({ internalNotes: e.target.value })}
          placeholder="Visible to every internal user — this field is not confidential."
        />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ modal: record */

function RecordModal({
  open,
  onClose,
  record,
  opportunities,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  record: FundingRecord | null;
  opportunities: OpportunityRow[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<RecordFormState>(EMPTY_RECORD_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(record ? recordToForm(record) : EMPTY_RECORD_FORM);
    setErrors({});
    setServerError(null);
  }, [open, record]);

  const update = (patch: Partial<RecordFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    const validation = validateRecord(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    setServerError(null);
    try {
      const requested = Number(form.requestedAmount);
      const approved = form.approvedAmount.trim() === '' ? 0 : Number(form.approvedAmount);
      const received = form.receivedAmount.trim() === '' ? 0 : Number(form.receivedAmount);

      const body: Record<string, unknown> = {
        subjectType: form.subjectType,
        subjectId: Number(form.subjectId),
        source: form.source.trim(),
        requestedAmount: requested,
        approvedAmount: approved,
        receivedAmount: received,
        applicationDate: form.applicationDate,
        decisionDate: form.decisionDate,
        status: form.status,
        notes: form.notes.trim(),
      };

      if (record) {
        await api.put(`/funding/records/${record.id}`, body);
        toast.success('Funding record updated', `${form.source.trim()} — requested, approved and received amounts saved.`);
      } else {
        if (form.opportunityId) body.opportunityId = Number(form.opportunityId);
        await api.post('/funding/records', body);
        toast.success('Funding record created', `${form.source.trim()} — requested, approved and received amounts tracked separately.`);
      }
      onSaved();
      onClose();
    } catch (err) {
      const message = errorText(err, 'The funding record could not be saved.');
      setServerError(message);
      toast.error('Could not save the funding record', message);
    } finally {
      setSubmitting(false);
    }
  };

  const approvedNumber = form.approvedAmount.trim() === '' ? 0 : Number(form.approvedAmount);
  const receivedNumber = form.receivedAmount.trim() === '' ? 0 : Number(form.receivedAmount);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={record ? 'Edit funding record' : 'Record funding'}
      description="Requested, approved and received are stored as three separate values and are never merged."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            {record ? 'Save changes' : 'Create record'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {serverError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {serverError}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Linked record type"
            required
            value={form.subjectType}
            options={[
              { value: 'PROJECT', label: 'Research project' },
              { value: 'STARTUP', label: 'Startup' },
            ]}
            onChange={(e) => update({ subjectType: e.target.value as 'PROJECT' | 'STARTUP' })}
          />
          <Input
            label="Linked record id"
            required
            type="number"
            min={1}
            value={form.subjectId}
            error={errors.subjectId}
            hint="Numeric id of the project or startup."
            onChange={(e) => update({ subjectId: e.target.value })}
          />
        </div>

        <Input
          label="Funding source"
          required
          value={form.source}
          error={errors.source}
          onChange={(e) => update({ source: e.target.value })}
          placeholder="e.g. Department of Science — Seed Grant"
        />

        {record ? (
          <div className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-600">
            Linked opportunity:{' '}
            <span className="font-semibold text-ink-800">
              {record.opportunity_code ?? '—'} {record.opportunity_title ?? ''}
            </span>
            . The opportunity link of an existing record cannot be changed.
          </div>
        ) : (
          <Select
            label="Linked catalogue opportunity"
            value={form.opportunityId}
            placeholder="Not linked to a catalogue entry"
            options={opportunities.map((o) => ({ value: String(o.id), label: `${o.code} — ${o.title}` }))}
            onChange={(e) => update({ opportunityId: e.target.value })}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Requested amount"
            required
            type="number"
            min={0}
            value={form.requestedAmount}
            error={errors.requestedAmount}
            onChange={(e) => update({ requestedAmount: e.target.value })}
          />
          <Input
            label="Approved amount"
            type="number"
            min={0}
            value={form.approvedAmount}
            error={errors.approvedAmount}
            hint="Cannot exceed the requested amount."
            onChange={(e) => update({ approvedAmount: e.target.value })}
          />
          <Input
            label="Received amount"
            type="number"
            min={0}
            value={form.receivedAmount}
            error={errors.receivedAmount}
            hint="Cannot exceed the approved amount."
            onChange={(e) => update({ receivedAmount: e.target.value })}
          />
        </div>

        <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
          Requested {formatCurrency(Number(form.requestedAmount) || 0)} · Approved{' '}
          {formatCurrency(approvedNumber || 0)} · Received {formatCurrency(receivedNumber || 0)}. These three figures are
          reported separately everywhere in the system.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Application date"
            type="date"
            value={form.applicationDate}
            onChange={(e) => update({ applicationDate: e.target.value })}
          />
          <Input
            label="Decision date"
            type="date"
            value={form.decisionDate}
            onChange={(e) => update({ decisionDate: e.target.value })}
          />
        </div>

        <Select
          label="Status"
          value={form.status}
          options={RECORD_STATUSES.map((s) => ({ value: s, label: label(s) }))}
          onChange={(e) => update({ status: e.target.value as RecordStatus })}
        />

        <Textarea
          label="Notes"
          rows={3}
          value={form.notes}
          onChange={(e) => update({ notes: e.target.value })}
          placeholder="Internal notes about this request."
        />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------- opportunity card */

function OpportunityCard({ opportunity }: { opportunity: OpportunityRow }) {
  const days = opportunity.days_to_close;
  return (
    <Card className="flex h-full flex-col">
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={`/funding/${opportunity.id}`}
              className="block text-sm font-semibold leading-snug text-ink-900 hover:text-brand-700"
            >
              {opportunity.title}
            </Link>
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">
              <Landmark className="h-3.5 w-3.5 shrink-0" />
              {opportunity.organization}
            </p>
          </div>
          <StatusBadge status={opportunity.status} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <MetaChip>{opportunity.code}</MetaChip>
          <Badge tone="info">{CATEGORY_LABELS[opportunity.category]}</Badge>
          {opportunity.domain ? <MetaChip>{opportunity.domain}</MetaChip> : null}
        </div>

        <div className="rounded-lg border border-ink-200 bg-ink-50/70 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Grant range offered</p>
          <p className="mt-0.5 text-sm font-semibold text-ink-900">
            {grantRange(opportunity.amount_min, opportunity.amount_max)}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-500">
            A funder-offered range — separate from requested, approved and received amounts.
          </p>
        </div>

        <p className="text-xs leading-relaxed text-ink-600">{truncate(opportunity.eligibility, 130)}</p>

        <div className="mt-auto space-y-2 border-t border-ink-100 pt-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1 text-ink-500">
              <CalendarClock className="h-3.5 w-3.5" />
              Closes {formatDate(opportunity.closes_on)}
            </span>
            <Badge tone={deadlineTone(days)}>{deadlineLabel(days)}</Badge>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-ink-500">
            <span>
              {formatNumber(opportunity.application_count)} application
              {opportunity.application_count === 1 ? '' : 's'} tracked
            </span>
            <span className="font-medium text-ink-700">
              {formatCurrency(opportunity.requested_total)} requested
            </span>
          </div>
          <Link
            to={`/funding/${opportunity.id}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            View details <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ page */

export default function Funding() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<'opportunities' | 'records'>('opportunities');

  // --- opportunity filters
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState('');
  const [organization, setOrganization] = useState('');
  const [status, setStatus] = useState('');
  const [deadlineBefore, setDeadlineBefore] = useState('');
  const [deadlineAfter, setDeadlineAfter] = useState('');
  const search = useDebounced(searchInput, 350);

  const oppParams = useMemo(
    () => ({ search, category, organization, status, deadlineBefore, deadlineAfter }),
    [search, category, organization, status, deadlineBefore, deadlineAfter],
  );

  const oppList = usePaged<OpportunityRow>('/funding/opportunities', oppParams, 9);
  const oppMeta = useAsync<OpportunityMeta>(() => api.get('/funding/opportunities/meta'), []);

  // --- funding records
  const [recordStatus, setRecordStatus] = useState('');
  const [recordSource, setRecordSource] = useState('');
  const [recordSubjectType, setRecordSubjectType] = useState('');
  const [recordPage, setRecordPage] = useState(1);
  const RECORD_PAGE_SIZE = 10;

  const recordsQuery = useAsync<RecordsResponse>(
    () =>
      api.get('/funding/records', {
        status: recordStatus,
        source: recordSource,
        subjectType: recordSubjectType,
      }),
    [recordStatus, recordSource, recordSubjectType],
  );

  const dash = useAsync<DashboardKpis>(() => api.get('/dashboard', { days: 365 }), []);

  // --- opportunity picker for the record modal
  const oppPicker = useAsync<Paged<OpportunityRow>>(
    () => api.get('/funding/opportunities', { pageSize: 100 }),
    [],
  );

  // --- modals
  const [opportunityModalOpen, setOpportunityModalOpen] = useState(false);
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<FundingRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<FundingRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const totals = recordsQuery.data?.totals ?? EMPTY_TOTALS;
  const allRecords = recordsQuery.data?.records ?? [];
  const recordTotalPages = Math.max(1, Math.ceil(allRecords.length / RECORD_PAGE_SIZE));
  const visibleRecords = useMemo(
    () => allRecords.slice((recordPage - 1) * RECORD_PAGE_SIZE, recordPage * RECORD_PAGE_SIZE),
    [allRecords, recordPage],
  );

  // Keeps the client-side pagination inside range after a delete or a filter change.
  useEffect(() => {
    if (recordPage > recordTotalPages) setRecordPage(recordTotalPages);
  }, [recordPage, recordTotalPages]);

  const kpis = dash.data?.kpis;
  const reconciliation = useMemo(() => {
    if (!kpis) return null;
    const rows = [
      { key: 'requested', page: totals.requested, dash: Number(kpis.fundingRequested ?? 0) },
      { key: 'approved', page: totals.approved, dash: Number(kpis.totalFunding ?? 0) },
      { key: 'received', page: totals.received, dash: Number(kpis.fundingReceived ?? 0) },
    ];
    return { rows, mismatches: rows.filter((r) => Math.abs(r.page - r.dash) > 0.5) };
  }, [kpis, totals]);

  const resetOpportunityFilters = () => {
    setSearchInput('');
    setCategory('');
    setOrganization('');
    setStatus('');
    setDeadlineBefore('');
    setDeadlineAfter('');
    oppList.setPage(1);
  };

  const changeOpportunityFilter = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    oppList.setPage(1);
  };

  const changeRecordFilter = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setRecordPage(1);
  };

  const reloadAll = () => {
    oppList.reload();
    oppMeta.reload();
    recordsQuery.reload();
    dash.reload();
  };

  const confirmDeleteRecord = async () => {
    if (!deletingRecord) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/funding/records/${deletingRecord.id}`);
      toast.success('Funding record deleted', `${deletingRecord.source} was removed.`);
      setDeletingRecord(null);
      reloadAll();
    } catch (err) {
      const message = errorText(err, 'The funding record could not be deleted.');
      toast.error('Could not delete the funding record', message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const canManage = can('funding.manage');
  const canApply = can('funding.apply');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Funding Opportunities"
        description="An internal catalogue of sample funding opportunities maintained inside this system. It is reference data only — no application is ever submitted to an external funder by this platform. Funding amounts are tracked separately as requested, approved and received."
        actions={
          <>
            {canApply ? (
              <Button
                variant={canManage ? 'secondary' : 'primary'}
                icon={<HandCoins className="h-4 w-4" />}
                onClick={() => {
                  setEditingRecord(null);
                  setRecordModalOpen(true);
                }}
              >
                Record funding
              </Button>
            ) : null}
            {canManage ? (
              <Button
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setOpportunityModalOpen(true)}
              >
                Add opportunity
              </Button>
            ) : null}
          </>
        }
      />

      <NoticeBanner tone="warning" title="Illustrative catalogue — no external submission">
        <p>
          The opportunity catalogue is <strong>illustrative sample data</strong> maintained inside this system. This
          platform <strong>never submits an application to an external funder</strong> — records here only track what the
          institution requested, approved and actually received.
        </p>
      </NoticeBanner>

      <NoticeBanner tone="info" title="Requested, approved and received are different figures">
        <p>
          Amounts are tracked as three separate values: requested, approved and received. Approved is not the same as
          received.
        </p>
      </NoticeBanner>

      {/* ---------------------------------------------------------- summary */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Requested"
          value={formatCurrency(totals.requested, true)}
          icon={<Coins className="h-5 w-5" />}
          hint="Amount asked for — not yet sanctioned"
          tone="brand"
        />
        <StatCard
          title="Approved"
          value={formatCurrency(totals.approved, true)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          hint="Sanctioned, but not necessarily disbursed"
          tone="emerald"
        />
        <StatCard
          title="Received"
          value={formatCurrency(totals.received, true)}
          icon={<Wallet className="h-5 w-5" />}
          hint="Actually disbursed to the institution"
          tone="violet"
        />
        <StatCard
          title="Funding records"
          value={formatNumber(totals.records)}
          icon={<HandCoins className="h-5 w-5" />}
          hint="Request, approval and receipt entries"
          tone="ink"
        />
      </div>

      {reconciliation ? (
        reconciliation.mismatches.length > 0 ? (
          <NoticeBanner tone="warning" title="Totals differ from the dashboard">
            <p>
              {reconciliation.mismatches
                .map((m) => `${m.key}: ${formatCurrency(m.page)} here vs ${formatCurrency(m.dash)} on the dashboard`)
                .join(' · ')}
              . Reload the dashboard if the two views should agree.
            </p>
          </NoticeBanner>
        ) : (
          <p className="text-xs text-ink-500">
            These totals match the dashboard KPIs (requested {formatCurrency(kpis?.fundingRequested ?? 0)} · approved{' '}
            {formatCurrency(kpis?.totalFunding ?? 0)} · received {formatCurrency(kpis?.fundingReceived ?? 0)}).
          </p>
        )
      ) : null}

      {/* ------------------------------------------------------------- tabs */}
      <Card>
        <Tabs
          tabs={[
            { key: 'opportunities', label: 'Opportunities', count: oppList.total },
            { key: 'records', label: 'Funding records', count: allRecords.length },
          ]}
          active={tab}
          onChange={(key) => setTab(key as 'opportunities' | 'records')}
          className="px-2 pt-1"
        />

        {/* ------------------------------------------------ opportunities */}
        <TabPanel active={tab} activeKey="opportunities">
          <FilterBar>
            <div className="relative min-w-[16rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search title, code or organization…"
                aria-label="Search opportunities"
                className="input-base pl-9"
              />
            </div>
            <Select
              aria-label="Category"
              className="h-9 py-0 text-xs sm:w-40"
              value={category}
              placeholder="All categories"
              options={(oppMeta.data?.categories ?? ['RESEARCH', 'STARTUP', 'BOTH']).map((c) => ({
                value: c,
                label: CATEGORY_LABELS[c as OpportunityCategory] ?? c,
              }))}
              onChange={(e) => changeOpportunityFilter(setCategory)(e.target.value)}
            />
            <Select
              aria-label="Organization"
              className="h-9 py-0 text-xs sm:w-48"
              value={organization}
              placeholder="All organizations"
              options={(oppMeta.data?.organizations ?? []).map((o) => ({ value: o.organization, label: o.organization }))}
              onChange={(e) => changeOpportunityFilter(setOrganization)(e.target.value)}
            />
            <Select
              aria-label="Status"
              className="h-9 py-0 text-xs sm:w-36"
              value={status}
              placeholder="All statuses"
              options={(oppMeta.data?.statuses ?? ['UPCOMING', 'OPEN', 'CLOSED']).map((s) => ({
                value: s,
                label: label(s),
              }))}
              onChange={(e) => changeOpportunityFilter(setStatus)(e.target.value)}
            />
            <div className="w-full sm:w-[9.5rem]">
              <input
                type="date"
                aria-label="Closing before"
                value={deadlineBefore}
                onChange={(e) => changeOpportunityFilter(setDeadlineBefore)(e.target.value)}
                title="Closing on or before"
                className="input-base h-9 py-0 text-xs"
              />
            </div>
            <div className="w-full sm:w-[9.5rem]">
              <input
                type="date"
                aria-label="Closing after"
                value={deadlineAfter}
                onChange={(e) => changeOpportunityFilter(setDeadlineAfter)(e.target.value)}
                title="Closing on or after"
                className="input-base h-9 py-0 text-xs"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={<FilterX className="h-4 w-4" />}
              onClick={resetOpportunityFilters}
            >
              Clear filters
            </Button>
          </FilterBar>

          {oppList.error ? (
            <ErrorState message={oppList.error} onRetry={oppList.reload} />
          ) : oppList.loading && !oppList.data ? (
            <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card h-56 animate-pulse bg-ink-50" />
              ))}
            </div>
          ) : (oppList.data?.data ?? []).length === 0 ? (
            <EmptyState
              title="No opportunities match these filters"
              description="Adjust the filters above, or add a new catalogue entry."
              icon={<Landmark className="h-6 w-6" />}
              action={
                canManage ? (
                  <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpportunityModalOpen(true)}>
                    Add opportunity
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {(oppList.data?.data ?? []).map((o) => (
                  <OpportunityCard key={o.id} opportunity={o} />
                ))}
              </div>
              <Pagination
                page={oppList.page}
                pageSize={oppList.pageSize}
                total={oppList.total}
                totalPages={oppList.totalPages}
                onPageChange={oppList.setPage}
                onPageSizeChange={oppList.setPageSize}
                itemLabel="opportunities"
              />
            </>
          )}
        </TabPanel>

        {/* ------------------------------------------------ funding records */}
        <TabPanel active={tab} activeKey="records">
          <FilterBar>
            <div className="relative min-w-[15rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={recordSource}
                onChange={(e) => changeRecordFilter(setRecordSource)(e.target.value)}
                placeholder="Search funding source…"
                aria-label="Search funding source"
                className="input-base pl-9"
              />
            </div>
            <Select
              aria-label="Record status"
              className="h-9 py-0 text-xs sm:w-44"
              value={recordStatus}
              placeholder="All statuses"
              options={RECORD_STATUSES.map((s) => ({ value: s, label: label(s) }))}
              onChange={(e) => changeRecordFilter(setRecordStatus)(e.target.value)}
            />
            <Select
              aria-label="Linked record type"
              className="h-9 py-0 text-xs sm:w-40"
              value={recordSubjectType}
              placeholder="All record types"
              options={[
                { value: 'PROJECT', label: 'Research project' },
                { value: 'STARTUP', label: 'Startup' },
              ]}
              onChange={(e) => changeRecordFilter(setRecordSubjectType)(e.target.value)}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<FilterX className="h-4 w-4" />}
              onClick={() => {
                setRecordSource('');
                setRecordStatus('');
                setRecordSubjectType('');
                setRecordPage(1);
              }}
            >
              Clear filters
            </Button>
          </FilterBar>

          {recordsQuery.error ? (
            <ErrorState message={recordsQuery.error} onRetry={recordsQuery.reload} />
          ) : recordsQuery.loading && !recordsQuery.data ? (
            <TableSkeleton rows={6} cols={8} />
          ) : allRecords.length === 0 ? (
            <EmptyState
              title={recordStatus || recordSource || recordSubjectType ? 'No funding records match these filters' : 'No funding records'}
              description="Track what was requested, approved and received for a project or startup."
              icon={<HandCoins className="h-6 w-6" />}
              action={
                canApply ? (
                  <Button
                    icon={<Plus className="h-4 w-4" />}
                    onClick={() => {
                      setEditingRecord(null);
                      setRecordModalOpen(true);
                    }}
                  >
                    Record funding
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink-200">
                  <thead className="table-head">
                    <tr>
                      <th className="px-4 py-2.5">Subject</th>
                      <th className="px-4 py-2.5">Source</th>
                      <th className="px-4 py-2.5">Requested</th>
                      <th className="px-4 py-2.5">Approved</th>
                      <th className="px-4 py-2.5">Received</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Application date</th>
                      <th className="px-4 py-2.5">Decision date</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {visibleRecords.map((r) => (
                      <tr key={r.id} className="transition hover:bg-ink-50">
                        <td className="table-cell">
                          <span className="font-medium text-ink-900">{r.subject_code ?? `#${r.subject_id}`}</span>
                          <p className="max-w-[16rem] truncate text-xs text-ink-500">{r.subject_title ?? '—'}</p>
                        </td>
                        <td className="table-cell">
                          <span className="block max-w-[14rem] truncate">{r.source}</span>
                          {r.opportunity_code ? (
                            <span className="text-xs text-ink-500">{r.opportunity_code}</span>
                          ) : null}
                        </td>
                        <td className="table-cell font-medium text-ink-900">{formatCurrency(r.requested_amount)}</td>
                        <td className="table-cell">{formatCurrency(r.approved_amount)}</td>
                        <td className="table-cell">{formatCurrency(r.received_amount)}</td>
                        <td className="table-cell">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="table-cell">{formatDate(r.application_date)}</td>
                        <td className="table-cell">{formatDate(r.decision_date)}</td>
                        <td className="table-cell text-right">
                          <div className="flex items-center justify-end gap-2">
                            {r.opportunity_id ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/funding/${r.opportunity_id}`)}
                              >
                                View opportunity
                              </Button>
                            ) : null}
                            {canManage ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  icon={<Pencil className="h-3.5 w-3.5" />}
                                  onClick={() => {
                                    setEditingRecord(r);
                                    setRecordModalOpen(true);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  icon={<Trash2 className="h-3.5 w-3.5" />}
                                  onClick={() => setDeletingRecord(r)}
                                >
                                  Delete
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={recordPage}
                pageSize={RECORD_PAGE_SIZE}
                total={allRecords.length}
                totalPages={recordTotalPages}
                onPageChange={setRecordPage}
                itemLabel="funding records"
              />
            </>
          )}
        </TabPanel>
      </Card>

      {recordsQuery.error ? (
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          The funding totals above could not be refreshed.
        </div>
      ) : null}

      <OpportunityModal
        open={opportunityModalOpen}
        onClose={() => setOpportunityModalOpen(false)}
        onSaved={reloadAll}
      />

      <RecordModal
        open={recordModalOpen}
        onClose={() => {
          setRecordModalOpen(false);
          setEditingRecord(null);
        }}
        record={editingRecord}
        opportunities={oppPicker.data?.data ?? []}
        onSaved={reloadAll}
      />

      <ConfirmDialog
        open={Boolean(deletingRecord)}
        title="Delete funding record"
        message={
          <p>
            This permanently removes the funding record for{' '}
            <strong>{deletingRecord?.source ?? 'this entry'}</strong>. The requested, approved and received amounts are
            deleted with it.
          </p>
        }
        confirmLabel="Delete record"
        tone="danger"
        loading={deleteBusy}
        onCancel={() => setDeletingRecord(null)}
        onConfirm={() => {
          void confirmDeleteRecord();
        }}
      />
    </div>
  );
}
