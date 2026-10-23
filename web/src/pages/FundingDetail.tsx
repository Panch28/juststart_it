import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  Download,
  ExternalLink,
  FileText,
  Landmark,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { api, ApiError, fileUrl } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { formatCurrency, formatDate, formatNumber } from '../lib/format';
import { DOCUMENT_CATEGORY_LABELS } from '../lib/constants';
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
  TableWrapper,
  Textarea,
  useToast,
} from '../components/ui';
import { DetailGrid, DetailItem, MetaChip, NoticeBanner, StatusBadge } from '../components/common';

/* ------------------------------------------------------------------ types */

type OpportunityCategory = 'RESEARCH' | 'STARTUP' | 'BOTH';
type OpportunityStatus = 'UPCOMING' | 'OPEN' | 'CLOSED';

interface Opportunity {
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
  days_to_close: number | null;
}

interface ApplicationRow {
  id: number;
  opportunity_id: number;
  subject_type: 'PROJECT' | 'STARTUP';
  subject_id: number;
  requested_amount: number;
  application_date: string | null;
  status: string;
  approved_amount: number | null;
  decision_date: string | null;
  notes: string | null;
  created_at: string;
  subject_code: string | null;
  subject_title: string | null;
}

interface DetailDocumentRow {
  id: number;
  name: string;
  category: string;
  file_type: string;
  file_size: number;
  upload_date: string;
  uploaded_by_name: string | null;
}

interface FundingDetailResponse {
  opportunity: Opportunity;
  applications: ApplicationRow[];
  documents: DetailDocumentRow[];
  permissions: { canManage: boolean; canApply: boolean };
  notice: string;
}

interface DocumentsMeta {
  categories: string[];
  statuses: string[];
  relatedTypes: string[];
  maxFileSizeBytes: number;
  allowedExtensions: string[];
}

/* --------------------------------------------------------------- helpers */

const CATEGORY_LABELS: Record<OpportunityCategory, string> = {
  RESEARCH: 'Research',
  STARTUP: 'Startup',
  BOTH: 'Research & Startup',
};

function grantRange(min: number | null | undefined, max: number | null | undefined): string {
  const hasMin = typeof min === 'number' && Number.isFinite(min);
  const hasMax = typeof max === 'number' && Number.isFinite(max);
  if (hasMin && hasMax) return `${formatCurrency(min)} – ${formatCurrency(max)}`;
  if (hasMin) return `From ${formatCurrency(min)}`;
  if (hasMax) return `Up to ${formatCurrency(max)}`;
  return 'Amount not specified';
}

function deadlineLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return 'No deadline';
  if (days < 0) return `OVERDUE by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  if (days === 0) return 'Closes today';
  return `${days} day${days === 1 ? '' : 's'} remaining`;
}

function deadlineTone(days: number | null | undefined): 'neutral' | 'info' | 'warning' | 'danger' {
  if (days === null || days === undefined) return 'neutral';
  if (days < 0) return 'danger';
  if (days <= 7) return 'warning';
  return 'info';
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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

/* ----------------------------------------------------------- edit modal */

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

function opportunityToForm(opportunity: Opportunity): OpportunityFormState {
  return {
    title: opportunity.title,
    organization: opportunity.organization,
    category: opportunity.category,
    domain: opportunity.domain ?? '',
    amountMin: opportunity.amount_min === null ? '' : String(opportunity.amount_min),
    amountMax: opportunity.amount_max === null ? '' : String(opportunity.amount_max),
    eligibility: opportunity.eligibility ?? '',
    description: opportunity.description ?? '',
    opensOn: opportunity.opens_on ? opportunity.opens_on.slice(0, 10) : '',
    closesOn: opportunity.closes_on ? opportunity.closes_on.slice(0, 10) : '',
    externalUrl: opportunity.external_url ?? '',
    internalNotes: opportunity.internal_notes ?? '',
    status: opportunity.status,
  };
}

function validateOpportunityForm(form: OpportunityFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (form.title.trim().length < 5) errors.title = 'Title must be at least 5 characters.';
  if (form.organization.trim().length < 3) errors.organization = 'Organization is required.';
  if (form.eligibility.trim().length < 10) errors.eligibility = 'Eligibility must be at least 10 characters.';
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

/* --------------------------------------------------------- upload modal */

function UploadDocumentModal({
  open,
  onClose,
  opportunityId,
  meta,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  opportunityId: number;
  meta: DocumentsMeta | null;
  onUploaded: () => void;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('FUNDING_DOCUMENT');
  const [description, setDescription] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setName('');
    setCategory('FUNDING_DOCUMENT');
    setDescription('');
    setFileError(null);
    setServerError(null);
  }, [open]);

  const allowed = meta?.allowedExtensions ?? [];
  const maxSize = meta?.maxFileSizeBytes ?? 10 * 1024 * 1024;

  const pickFile = (selected: File | null) => {
    setFileError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    const dot = selected.name.lastIndexOf('.');
    const extension = dot >= 0 ? selected.name.slice(dot).toLowerCase() : '';
    if (allowed.length > 0 && !allowed.includes(extension)) {
      setFileError(
        `File type "${extension || 'unknown'}" is not allowed. Accepted types: ${allowed.join(', ')}.`,
      );
      setFile(null);
      return;
    }
    if (selected.size > maxSize) {
      setFileError(`This file is ${formatBytes(selected.size)}. The maximum allowed size is ${formatBytes(maxSize)}.`);
      setFile(null);
      return;
    }
    setFile(selected);
    setName((prev) => (prev.trim() ? prev : selected.name));
  };

  const submit = async () => {
    if (!file) {
      setFileError('Select a file to upload.');
      return;
    }
    if (name.trim().length < 3) {
      setFileError('Document name must be at least 3 characters.');
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      const payload = new FormData();
      payload.append('name', name.trim());
      payload.append('category', category);
      payload.append('description', description.trim());
      payload.append('relatedType', 'FUNDING');
      payload.append('relatedId', String(opportunityId));
      payload.append('files', file);

      await api.post('/documents', payload);
      toast.success('Document uploaded', `${name.trim()} is now linked to this opportunity.`);
      onUploaded();
      onClose();
    } catch (err) {
      const message = errorText(err, 'The document could not be uploaded.');
      setServerError(message);
      toast.error('Upload failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload a document"
      description={`The file is stored and linked to this funding opportunity (related type FUNDING).`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button loading={submitting} onClick={submit} icon={<Upload className="h-4 w-4" />}>
            Upload
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

        <div>
          <label className="label-base" htmlFor="funding-doc-file">
            File <span className="text-rose-500">*</span>
          </label>
          <input
            id="funding-doc-file"
            type="file"
            accept={allowed.join(',')}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
          />
          <p className="mt-1 text-xs text-ink-500">
            Accepted: {allowed.join(', ') || '—'} · Maximum size {formatBytes(maxSize)}.
          </p>
          {fileError ? (
            <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
              {fileError}
            </p>
          ) : null}
          {file ? (
            <p className="mt-1 text-xs text-ink-600">
              Selected: <span className="font-medium text-ink-800">{file.name}</span> · {formatBytes(file.size)}
            </p>
          ) : null}
        </div>

        <Input
          label="Document name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Defaults to the file name"
        />
        <Select
          label="Category"
          required
          value={category}
          options={Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, lbl]) => ({ value, label: lbl }))}
          onChange={(e) => setCategory(e.target.value)}
        />
        <Textarea
          label="Description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ page */

export default function FundingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const opportunityId = Number(id);

  const query = useAsync<FundingDetailResponse>(
    () => api.get<FundingDetailResponse>(`/funding/opportunities/${id}`),
    [id],
  );
  const docMeta = useAsync<DocumentsMeta>(() => api.get<DocumentsMeta>('/documents/meta'), []);

  const [editOpen, setEditOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [form, setForm] = useState<OpportunityFormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const opportunity = query.data?.opportunity;
  const permissions = query.data?.permissions;

  useEffect(() => {
    if (editOpen && opportunity) {
      setForm(opportunityToForm(opportunity));
      setErrors({});
      setSaveError(null);
    }
  }, [editOpen, opportunity]);

  const canManage = permissions?.canManage ?? can('funding.manage');
  const canUpload = can('document.upload');

  const update = (patch: Partial<OpportunityFormState>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const save = async () => {
    if (!form || !opportunity) return;
    const validation = validateOpportunityForm(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    setSaveError(null);
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

      await api.put(`/funding/opportunities/${opportunity.id}`, body);
      toast.success('Opportunity updated', `${form.title.trim()} was saved.`);
      setEditOpen(false);
      query.reload();
    } catch (err) {
      const message = errorText(err, 'The opportunity could not be saved.');
      setSaveError(message);
      toast.error('Could not update the opportunity', message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!opportunity) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/funding/opportunities/${opportunity.id}`);
      toast.success('Opportunity deleted', `${opportunity.code} was removed from the catalogue.`);
      navigate('/funding');
    } catch (err) {
      const message = errorText(err, 'The opportunity could not be deleted.');
      toast.error('Could not delete the opportunity', message);
      setDeleteBusy(false);
    }
  };

  const documents = query.data?.documents ?? [];
  const applications = query.data?.applications ?? [];

  const applicationTotals = useMemo(() => {
    const requested = applications.reduce((sum, a) => sum + (a.requested_amount ?? 0), 0);
    const approved = applications.reduce((sum, a) => sum + (a.approved_amount ?? 0), 0);
    return { requested, approved };
  }, [applications]);

  if (query.error) {
    return (
      <div className="space-y-4">
        <Link
          to="/funding"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to funding
        </Link>
        <Card>
          <ErrorState message={query.error} onRetry={query.reload} />
        </Card>
      </div>
    );
  }

  if (query.loading && !query.data) {
    return (
      <div className="space-y-4">
        <Spinner label="Loading funding opportunity…" />
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="space-y-4">
        <Link
          to="/funding"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to funding
        </Link>
        <Card>
          <EmptyState
            title="Opportunity not found"
            description="This catalogue entry may have been removed."
            action={
              <Link
                to="/funding"
                className="text-sm font-semibold text-brand-600 hover:text-brand-700"
              >
                Back to funding
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const days = opportunity.days_to_close;

  return (
    <div className="space-y-6">
      <Link
        to="/funding"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to funding opportunities
      </Link>

      <PageHeader
        title={opportunity.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5">
              <Landmark className="h-4 w-4 text-ink-400" />
              {opportunity.organization}
            </span>
            <span className="text-ink-300">·</span>
            <span>{opportunity.code}</span>
            <span className="text-ink-300">·</span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 text-ink-400" />
              Closes {formatDate(opportunity.closes_on)}
            </span>
            <Badge tone={deadlineTone(days)}>{deadlineLabel(days)}</Badge>
          </span>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">{CATEGORY_LABELS[opportunity.category]}</Badge>
            <StatusBadge status={opportunity.status} />
            {opportunity.domain ? <MetaChip>{opportunity.domain}</MetaChip> : null}
          </div>
        }
      />

      {query.data?.notice ? (
        <NoticeBanner tone="warning" title="Illustrative catalogue entry">
          <p>{query.data.notice}</p>
        </NoticeBanner>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ------------------------------------------------------ left column */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Overview" description="Catalogue metadata for this opportunity" />
            <CardBody>
              <DetailGrid columns={2}>
                <DetailItem label="Code">{opportunity.code}</DetailItem>
                <DetailItem label="Organization">{opportunity.organization}</DetailItem>
                <DetailItem label="Category">{CATEGORY_LABELS[opportunity.category]}</DetailItem>
                <DetailItem label="Domain">{opportunity.domain || '—'}</DetailItem>
                <DetailItem label="Grant range offered">
                  {grantRange(opportunity.amount_min, opportunity.amount_max)}
                  <span className="mt-0.5 block text-xs font-normal text-ink-500">
                    The range the funder offers — not a requested, approved or received amount.
                  </span>
                </DetailItem>
                <DetailItem label="Status">
                  <StatusBadge status={opportunity.status} />
                </DetailItem>
                <DetailItem label="Opens on">{formatDate(opportunity.opens_on)}</DetailItem>
                <DetailItem label="Closes on">{formatDate(opportunity.closes_on)}</DetailItem>
                <DetailItem label="Days remaining">
                  <Badge tone={deadlineTone(days)}>{deadlineLabel(days)}</Badge>
                </DetailItem>
                <DetailItem label="Last updated">{formatDate(opportunity.updated_at)}</DetailItem>
              </DetailGrid>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Description" />
            <CardBody>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">
                {opportunity.description || 'No description was recorded for this entry.'}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Eligibility" description="Who inside the institution may apply" />
            <CardBody>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">
                {opportunity.eligibility || 'No eligibility summary was recorded for this entry.'}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Internal notes"
              description="Visible to every internal user — this field is not confidential"
            />
            <CardBody>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">
                {opportunity.internal_notes || 'No internal notes were recorded for this entry.'}
              </p>
            </CardBody>
          </Card>

          {opportunity.external_url ? (
            <Card>
              <CardHeader title="External reference" description="Opens the funder page in a new tab" />
              <CardBody>
                <a
                  href={opportunity.external_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 break-all text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  {opportunity.external_url}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
                <p className="mt-2 text-xs text-ink-500">
                  This platform never submits an application to an external funder — the link is provided for reference
                  only.
                </p>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Linked documents"
              description={`Files stored against this opportunity (${documents.length})`}
              action={
                canUpload ? (
                  <Button variant="outline" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setUploadOpen(true)}>
                    Upload
                  </Button>
                ) : undefined
              }
            />
            {documents.length === 0 ? (
              <EmptyState
                title="No documents linked"
                description="Upload call circulars, guidelines or approval letters for this opportunity."
                icon={<FileText className="h-6 w-6" />}
              />
            ) : (
              <TableWrapper>
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
                  {documents.map((d) => (
                    <tr key={d.id} className="transition hover:bg-ink-50">
                      <td className="table-cell font-medium text-ink-900">{d.name}</td>
                      <td className="table-cell">
                        {DOCUMENT_CATEGORY_LABELS[d.category] ?? d.category ?? '—'}
                      </td>
                      <td className="table-cell">{d.file_type || '—'}</td>
                      <td className="table-cell">{formatBytes(d.file_size)}</td>
                      <td className="table-cell">{d.uploaded_by_name ?? '—'}</td>
                      <td className="table-cell">{formatDate(d.upload_date)}</td>
                      <td className="table-cell text-right">
                        <a
                          href={fileUrl(d.id, true)}
                          download
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
                        >
                          <Download className="h-3.5 w-3.5" /> Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrapper>
            )}
          </Card>
        </div>

        {/* ----------------------------------------------------- right column */}
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Applications"
              description="Internal tracking records linked to this catalogue entry"
            />
            <div className="border-b border-ink-100 px-5 py-3">
              <p className="text-xs text-ink-500">
                Requested {formatCurrency(applicationTotals.requested)} · Approved{' '}
                {formatCurrency(applicationTotals.approved)}. These are internal records only — no external submission is
                made by this platform.
              </p>
            </div>
            {applications.length === 0 ? (
              <EmptyState
                title="No applications tracked"
                description="Link a funding record to this opportunity from the funding page."
                icon={<FileText className="h-6 w-6" />}
              />
            ) : (
              <div className="divide-y divide-ink-100">
                {applications.map((a) => (
                  <div key={a.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-900">
                          {a.subject_code ?? `#${a.subject_id}`}
                        </p>
                        <p className="truncate text-xs text-ink-500">{a.subject_title ?? '—'}</p>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="text-ink-500">Requested</dt>
                        <dd className="font-semibold text-ink-900">{formatCurrency(a.requested_amount)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-500">Approved</dt>
                        <dd className="font-semibold text-ink-900">{formatCurrency(a.approved_amount ?? 0)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-500">Application date</dt>
                        <dd className="text-ink-700">{formatDate(a.application_date)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-500">Decision date</dt>
                        <dd className="text-ink-700">{formatDate(a.decision_date)}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Actions" description="Manage this catalogue entry" />
            <CardBody className="space-y-2.5">
              {canManage ? (
                <>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    icon={<Pencil className="h-4 w-4" />}
                    onClick={() => setEditOpen(true)}
                  >
                    Edit opportunity
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-rose-600 hover:bg-rose-50"
                    icon={<Trash2 className="h-4 w-4" />}
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete opportunity
                  </Button>
                </>
              ) : (
                <p className="text-xs text-ink-500">
                  Your role can view this entry but cannot add, edit or remove catalogue entries.
                </p>
              )}
              {canUpload ? (
                <Button
                  variant="secondary"
                  className="w-full justify-start"
                  icon={<Upload className="h-4 w-4" />}
                  onClick={() => setUploadOpen(true)}
                >
                  Upload document
                </Button>
              ) : null}
              <p className="pt-1 text-xs text-ink-500">
                {formatNumber(applications.length)} application{applications.length === 1 ? '' : 's'} linked. Deleting this
                entry fails while applications are attached to it.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------------------ modals */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit opportunity"
        description="Changes are stored in the internal catalogue only."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button loading={saving} onClick={save}>
              Save changes
            </Button>
          </>
        }
      >
        {form ? (
          <div className="space-y-4">
            {saveError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {saveError}
              </div>
            ) : null}

            <Input
              label="Title"
              required
              value={form.title}
              error={errors.title}
              onChange={(e) => update({ title: e.target.value })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Funding organization"
                required
                value={form.organization}
                error={errors.organization}
                onChange={(e) => update({ organization: e.target.value })}
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
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
            <Textarea
              label="Eligibility summary"
              required
              rows={3}
              value={form.eligibility}
              error={errors.eligibility}
              onChange={(e) => update({ eligibility: e.target.value })}
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
              onChange={(e) => update({ externalUrl: e.target.value })}
              placeholder="https://…"
            />
            <Textarea
              label="Internal notes"
              rows={3}
              value={form.internalNotes}
              onChange={(e) => update({ internalNotes: e.target.value })}
            />
          </div>
        ) : null}
      </Modal>

      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        opportunityId={opportunity.id}
        meta={docMeta.data}
        onUploaded={query.reload}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete funding opportunity"
        message={
          <div className="space-y-2">
            <p>
              This removes <strong>{opportunity.code}</strong> — {opportunity.title} — from the internal catalogue.
            </p>
            <p className="text-ink-500">
              The delete fails while any funding application is linked to this opportunity
              {applications.length > 0 ? ` (${applications.length} currently linked)` : ''}.
            </p>
          </div>
        }
        confirmLabel="Delete opportunity"
        tone="danger"
        loading={deleteBusy}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          void remove();
        }}
      />
    </div>
  );
}
