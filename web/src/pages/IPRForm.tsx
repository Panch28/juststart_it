import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, Plus, Save, Trash2, Users } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { IPR_TYPE_LABELS, label } from '../lib/constants';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Input,
  Select,
  Spinner,
  Textarea,
  useToast,
} from '../components/ui';
import { NoticeBanner } from '../components/common';

interface InventorRow {
  key: string;
  name: string;
  email: string;
}

interface IprMeta {
  types: string[];
  statuses: string[];
  transitions: Record<string, string[]>;
  officers: Array<{ id: number; full_name: string; email: string }>;
  eligibleProjects: Array<{
    id: number;
    project_code: string;
    title: string;
    status: string;
  }>;
}

interface IprDetailResponse {
  record: {
    id: number;
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
  };
  inventors: Array<{
    id: number;
    name: string;
    email: string | null;
    creator_order: number;
  }>;
  permissions: {
    allowedTransitions: string[];
  };
}

type Errors = Record<string, string>;

let rowCounter = 0;
function newRow(): InventorRow {
  rowCounter += 1;
  return { key: `inv-${rowCounter}`, name: '', email: '' };
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function IPRForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const isEdit = Boolean(id);
  const recordId = Number(id);

  const meta = useAsync<IprMeta>(() => api.get<IprMeta>('/ipr/meta'), []);
  const detail = useAsync<IprDetailResponse | null>(
    async () => (isEdit ? api.get<IprDetailResponse>(`/ipr/${recordId}`) : null),
    [recordId, isEdit],
  );

  const [title, setTitle] = useState('');
  const [iprType, setIprType] = useState('PATENT');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(() => searchParams.get('projectId') ?? '');
  const [disclosureDate, setDisclosureDate] = useState('');
  const [filingDate, setFilingDate] = useState('');
  const [nextDeadline, setNextDeadline] = useState('');
  const [iprOfficerId, setIprOfficerId] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [inventors, setInventors] = useState<InventorRow[]>([newRow()]);

  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  /* Prefill the form once the record is loaded (edit mode only). */
  useEffect(() => {
    if (!isEdit || !detail.data || hydrated) return;
    const record = detail.data.record;
    setTitle(record.title ?? '');
    setIprType(record.ipr_type ?? 'PATENT');
    setDescription(record.description ?? '');
    setProjectId(record.project_id ? String(record.project_id) : '');
    setDisclosureDate(toDateInput(record.disclosure_date));
    setFilingDate(toDateInput(record.filing_date));
    setNextDeadline(toDateInput(record.next_deadline));
    setIprOfficerId(record.ipr_officer_id ? String(record.ipr_officer_id) : '');
    setNotes(record.notes ?? '');
    setStatus(record.status ?? 'DRAFT');
    setInventors(
      detail.data.inventors.length > 0
        ? detail.data.inventors.map((inv) => {
            rowCounter += 1;
            return {
              key: `inv-${rowCounter}`,
              name: inv.name ?? '',
              email: inv.email ?? '',
            };
          })
        : [newRow()],
    );
    setHydrated(true);
  }, [detail.data, isEdit, hydrated]);

  const types = meta.data?.types ?? [];
  const statuses = meta.data?.statuses ?? [];
  const officers = meta.data?.officers ?? [];
  const eligibleProjects = meta.data?.eligibleProjects ?? [];

  /* Status options: on create only DRAFT plus the states reachable from DRAFT;
     on edit the current state plus the transitions the server allows. */
  const statusOptions = useMemo(() => {
    if (!isEdit) {
      const fromDraft = meta.data?.transitions?.DRAFT ?? [];
      return Array.from(new Set(['DRAFT', ...fromDraft])).map((value) => ({
        value,
        label: label(value),
        disabled: false,
      }));
    }
    const allowed = detail.data?.permissions?.allowedTransitions ?? [];
    const current = status;
    return Array.from(new Set([current, ...allowed]))
      .filter((value) => statuses.length === 0 || statuses.includes(value))
      .map((value) => ({
        value,
        label: label(value),
        disabled: value !== current && !allowed.includes(value),
      }));
  }, [isEdit, meta.data, detail.data, statuses, status]);

  const projectOptions = useMemo(() => {
    const options = eligibleProjects.map((p) => ({
      value: String(p.id),
      label: `${p.project_code} — ${p.title}`,
    }));
    if (projectId && !options.some((o) => o.value === projectId)) {
      options.push({ value: projectId, label: `Project #${projectId}` });
    }
    return options;
  }, [eligibleProjects, projectId]);

  function updateInventor(key: string, patch: Partial<InventorRow>) {
    setInventors((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeInventor(key: string) {
    setInventors((prev) => {
      const next = prev.filter((row) => row.key !== key);
      return next.length > 0 ? next : [newRow()];
    });
  }

  function validate(): Errors {
    const next: Errors = {};
    if (title.trim().length < 5) {
      next.title = 'IPR title must be at least 5 characters.';
    }
    if (description.trim().length < 20) {
      next.description = 'Description must be at least 20 characters.';
    }
    const named = inventors.filter((row) => row.name.trim().length > 0);
    if (named.length === 0) {
      next.inventors = 'At least one inventor or creator is required.';
    }
    named.forEach((row, index) => {
      if (row.name.trim().length < 2) {
        next[`inventor-${index}`] = 'Inventor name must be at least 2 characters.';
      }
      if (row.email.trim() && !EMAIL_PATTERN.test(row.email.trim())) {
        next[`inventor-email-${index}`] = 'Enter a valid email address.';
      }
    });
    if (
      disclosureDate &&
      filingDate &&
      new Date(filingDate).getTime() < new Date(disclosureDate).getTime()
    ) {
      next.filingDate = 'Filing date cannot be earlier than the disclosure date.';
    }
    return next;
  }

  function mapServerDetails(details: { field: string; message: string }[]): Errors {
    const mapped: Errors = {};
    details.forEach((detailItem) => {
      const field = detailItem.field ?? '';
      if (field.startsWith('inventors')) {
        mapped.inventors = detailItem.message;
      } else if (field) {
        mapped[field] = detailItem.message;
      }
    });
    return mapped;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const validation = validate();
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      setFormError('Please correct the highlighted fields before saving.');
      return;
    }

    const payload = {
      title: title.trim(),
      iprType,
      description: description.trim(),
      projectId: projectId ? Number(projectId) : null,
      inventors: inventors
        .filter((row) => row.name.trim().length > 0)
        .map((row, index) => ({
          name: row.name.trim(),
          email: row.email.trim(),
          order: index + 1,
        })),
      disclosureDate,
      filingDate,
      nextDeadline,
      iprOfficerId: iprOfficerId ? Number(iprOfficerId) : null,
      notes: notes.trim(),
      status,
    };

    setSaving(true);
    try {
      if (isEdit) {
        const res = await api.put<{ message: string }>(`/ipr/${recordId}`, payload);
        toast.success('IPR record updated', res.message);
        navigate(`/ipr/${recordId}`);
      } else {
        const res = await api.post<{ id: number; iprCode: string; message: string }>(
          '/ipr',
          payload,
        );
        toast.success('IPR record created', `${res.iprCode} · ${res.message}`);
        navigate(`/ipr/${res.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.details && err.details.length > 0) {
        setErrors(mapServerDetails(err.details));
      }
      setFormError(err instanceof Error ? err.message : 'Unable to save the IPR record.');
    } finally {
      setSaving(false);
    }
  }

  if (isEdit && detail.loading && !detail.data) {
    return (
      <Card>
        <Spinner label="Loading IPR record…" />
      </Card>
    );
  }

  if (isEdit && detail.error && !detail.data) {
    return (
      <Card>
        <ErrorState message={detail.error} onRetry={detail.reload} />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={isEdit ? `/ipr/${recordId}` : '/ipr'}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 transition hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {isEdit ? 'Back to record' : 'Back to IPR management'}
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">
          {isEdit ? 'Edit IPR record' : 'New IPR record'}
        </h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-500">
          {isEdit
            ? 'Update the administrative details, inventors and workflow status of this record.'
            : 'Register a new intellectual property disclosure with its inventors, linked project and administrative deadlines.'}
        </p>
      </div>

      <NoticeBanner tone="info" title="Administrative record only">
        <p>
          The values captured here describe internal workflow state and deadlines. They are not a legal determination of
          patentability or filing eligibility.
        </p>
      </NoticeBanner>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Record details */}
        <Card>
          <CardHeader title="Record details" description="Type, title and a short description of the disclosure." />
          <CardBody className="space-y-4">
            <Input
              label="IPR title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={errors.title}
              placeholder="e.g. Low-cost water purification membrane"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="IPR type"
                required
                value={iprType}
                onChange={(e) => setIprType(e.target.value)}
                options={types.map((t) => ({ value: t, label: IPR_TYPE_LABELS[t] ?? label(t) }))}
              />
              <Select
                label="Linked research project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="Not linked to a project"
                options={projectOptions}
                hint="Only approved, active or completed projects can be linked."
              />
            </div>
            <Textarea
              label="Description"
              required
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={errors.description}
              hint="Describe the invention, creation or authorship in at least 20 characters."
              placeholder="Summarise the subject matter, the problem it addresses and how it differs from existing work…"
            />
          </CardBody>
        </Card>

        {/* Inventors */}
        <Card>
          <CardHeader
            title="Inventors / creators"
            description="List everyone credited as an inventor or creator, in order."
          />
          <CardBody className="space-y-4">
            {errors.inventors ? (
              <p className="text-xs font-medium text-rose-600" role="alert">
                {errors.inventors}
              </p>
            ) : null}
            <div className="space-y-3">
              {inventors.map((row, index) => (
                <div
                  key={row.key}
                  className="grid gap-3 rounded-lg border border-ink-200 p-3 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end"
                >
                  <div className="flex h-9 items-center text-xs font-semibold text-ink-500">
                    #{index + 1}
                  </div>
                  <Input
                    label="Name"
                    required
                    value={row.name}
                    onChange={(e) => updateInventor(row.key, { name: e.target.value })}
                    error={errors[`inventor-${index}`]}
                    placeholder="Full name"
                  />
                  <Input
                    label="Email"
                    type="email"
                    value={row.email}
                    onChange={(e) => updateInventor(row.key, { email: e.target.value })}
                    error={errors[`inventor-email-${index}`]}
                    placeholder="name@university.edu"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove inventor"
                    icon={<Trash2 className="h-4 w-4" />}
                    onClick={() => removeInventor(row.key)}
                    className="sm:mb-0.5"
                  />
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setInventors((prev) => [...prev, newRow()])}
            >
              Add inventor
            </Button>
            <p className="text-xs text-ink-500">
              Use the exact registered email address if the person already has an account, so the record can be linked to
              their profile.
            </p>
          </CardBody>
        </Card>

        {/* Dates & administration */}
        <Card>
          <CardHeader
            title="Dates & administration"
            description="Administrative deadlines, ownership and workflow status."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Disclosure date"
                type="date"
                value={disclosureDate}
                onChange={(e) => setDisclosureDate(e.target.value)}
              />
              <Input
                label="Filing date"
                type="date"
                value={filingDate}
                onChange={(e) => setFilingDate(e.target.value)}
                error={errors.filingDate}
              />
              <Input
                label="Next deadline"
                type="date"
                value={nextDeadline}
                onChange={(e) => setNextDeadline(e.target.value)}
                hint="Used for deadline reminders on the dashboard."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="IPR officer"
                value={iprOfficerId}
                onChange={(e) => setIprOfficerId(e.target.value)}
                placeholder="Not assigned"
                options={officers.map((o) => ({ value: o.id, label: `${o.full_name} (${o.email})` }))}
              />
              <Select
                label="Workflow status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                hint="Only statuses permitted by the workflow can be selected."
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <Textarea
              label="Administrative notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes for the IPR officer and committee…"
            />
          </CardBody>
        </Card>

        {formError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-700">
            {formError}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={saving} icon={<Save className="h-4 w-4" />}>
            {isEdit ? 'Save changes' : 'Create IPR record'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(isEdit ? `/ipr/${recordId}` : '/ipr')}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-4 text-xs text-ink-400">
        <span className="inline-flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          All IPR records are tracked administratively.
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Inventor details are used for internal attribution only.
        </span>
      </div>
    </div>
  );
}
