import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  FlaskConical,
  Plus,
  Save,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/format';
import { DetailItem, DetailGrid, NoticeBanner, StatusBadge } from '../components/common';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  ErrorState,
  Input,
  PageHeader,
  Select,
  Spinner,
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
  created_at: string;
}

interface TeamMember {
  id: number;
  user_id: number | null;
  name: string;
  email: string | null;
  member_role: string;
  contribution: string | null;
}

interface ProjectDetailResponse {
  project: ProjectRecord;
  team: TeamMember[];
}

interface ProjectsMeta {
  departments: Array<{ id: number; code: string; name: string }>;
  investigators: Array<{
    id: number;
    full_name: string;
    email: string;
    department_name: string | null;
  }>;
  categories: Array<{ category: string }>;
  domains: Array<{ domain: string }>;
  statuses: string[];
  transitions: Record<string, string[]>;
}

interface FormState {
  title: string;
  description: string;
  domain: string;
  category: string;
  departmentId: string;
  principalInvestigatorId: string;
  startDate: string;
  expectedCompletionDate: string;
  fundingRequired: string;
  objectives: string;
  expectedOutcomes: string;
  progress: string;
}

interface MemberForm {
  key: string;
  name: string;
  email: string;
  role: string;
  contribution: string;
  userId: string;
}

const TEAM_ROLE_OPTIONS = [
  { value: 'CO_INVESTIGATOR', label: 'Co-Investigator' },
  { value: 'RESEARCH_ASSISTANT', label: 'Research Assistant' },
  { value: 'TECHNICIAN', label: 'Technician' },
  { value: 'STUDENT', label: 'Student' },
  { value: 'EXTERNAL_COLLABORATOR', label: 'External Collaborator' },
];

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  domain: '',
  category: '',
  departmentId: '',
  principalInvestigatorId: '',
  startDate: '',
  expectedCompletionDate: '',
  fundingRequired: '',
  objectives: '',
  expectedOutcomes: '',
  progress: '0',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The API stores dates as ISO strings — keep only the calendar day for a date input. */
function toDateInput(value?: string | null): string {
  if (!value) return '';
  return String(value).slice(0, 10);
}

/** Maps a server `details[]` entry onto the matching form field. */
function mapServerDetails(details?: { field: string; message: string }[]): Record<string, string> {
  const next: Record<string, string> = {};
  (details ?? []).forEach((d) => {
    const field = d.field.startsWith('teamMembers.')
      ? d.field.replace('teamMembers.', 'members.')
      : d.field;
    next[field] = d.message;
  });
  return next;
}

export default function ProjectForm() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const isEdit = Boolean(id);
  const prefillProjectId = isEdit ? null : searchParams.get('projectId');
  const recordId = id ?? prefillProjectId ?? null;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [members, setMembers] = useState<MemberForm[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const keyCounter = useRef(0);
  const nextKey = () => {
    keyCounter.current += 1;
    return `member-${keyCounter.current}`;
  };

  const { data: meta } = useAsync<ProjectsMeta>(() => api.get<ProjectsMeta>('/projects/meta'), []);

  const { data: record, loading: recordLoading, error: recordError, reload } =
    useAsync<ProjectDetailResponse | null>(
      async () => (recordId ? api.get<ProjectDetailResponse>(`/projects/${recordId}`) : null),
      [recordId],
    );

  // Prefill the form once the record arrives (edit mode, or ?projectId= prefill).
  const hydrated = useRef(false);
  useEffect(() => {
    if (!record || hydrated.current) return;
    hydrated.current = true;
    const p = record.project;
    setForm({
      title: p.title ?? '',
      description: p.description ?? '',
      domain: p.domain ?? '',
      category: p.category ?? '',
      departmentId: p.department_id ? String(p.department_id) : '',
      principalInvestigatorId: p.principal_investigator_id ? String(p.principal_investigator_id) : '',
      startDate: toDateInput(p.start_date),
      expectedCompletionDate: toDateInput(p.expected_completion_date),
      fundingRequired:
        p.funding_required === null || p.funding_required === undefined ? '' : String(p.funding_required),
      objectives: p.objectives ?? '',
      expectedOutcomes: p.expected_outcomes ?? '',
      progress: String(p.progress ?? 0),
    });
    setMembers(
      record.team.map((t) => ({
        key: nextKey(),
        name: t.name ?? '',
        email: t.email ?? '',
        role: t.member_role ?? 'CO_INVESTIGATOR',
        contribution: t.contribution ?? '',
        userId: t.user_id ? String(t.user_id) : '',
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  // A researcher creating a project is, by default, its principal investigator.
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (!user || defaultsApplied.current || hydrated.current) return;
    defaultsApplied.current = true;
    if (user.role === 'RESEARCHER') {
      setForm((f) => ({
        ...f,
        principalInvestigatorId: f.principalInvestigatorId || String(user.id),
        departmentId: f.departmentId || (user.departmentId ? String(user.departmentId) : ''),
      }));
    }
  }, [user]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key as string]) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  const updateMember = (index: number, patch: Partial<MemberForm>) => {
    setMembers((list) => list.map((m, i) => (i === index ? { ...m, ...patch } : m)));
    setErrors((e) => {
      const key = `members.${index}.name`;
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const addMember = () => {
    setMembers((list) => [
      ...list,
      { key: nextKey(), name: '', email: '', role: 'CO_INVESTIGATOR', contribution: '', userId: '' },
    ]);
  };

  const removeMember = (index: number) => {
    setMembers((list) => list.filter((_, i) => i !== index));
  };

  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};
    if (form.title.trim().length < 5) next.title = 'Project title must be at least 5 characters';
    if (form.description.trim().length < 20) next.description = 'Description must be at least 20 characters';
    if (!form.domain.trim()) next.domain = 'Research domain is required';
    if (!form.category) next.category = 'Project category is required';
    if (!form.departmentId) next.departmentId = 'Select a department';
    if (!form.principalInvestigatorId) next.principalInvestigatorId = 'Select a principal investigator';
    if (!form.startDate) next.startDate = 'Start date is required';
    if (!form.expectedCompletionDate) {
      next.expectedCompletionDate = 'Expected completion date is required';
    } else if (form.startDate && form.expectedCompletionDate < form.startDate) {
      next.expectedCompletionDate = 'Expected completion date must be on or after the start date';
    }
    if (form.fundingRequired !== '') {
      const amount = Number(form.fundingRequired);
      if (Number.isNaN(amount)) next.fundingRequired = 'Enter a valid amount';
      else if (amount < 0) next.fundingRequired = 'Funding cannot be negative';
    }
    if (form.objectives.trim().length < 10) next.objectives = 'Objectives must be at least 10 characters';
    members.forEach((m, i) => {
      if (!m.name.trim()) next[`members.${i}.name`] = 'Member name is required';
      else if (m.name.trim().length < 2) next[`members.${i}.name`] = 'Member name must be at least 2 characters';
      if (m.email.trim() && !EMAIL_PATTERN.test(m.email.trim())) {
        next[`members.${i}.email`] = 'Enter a valid email address';
      }
    });
    return next;
  };

  const submit = async () => {
    const validation = validate();
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      toast.error('Please fix the highlighted fields', 'Some values do not meet the minimum requirements.');
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      domain: form.domain.trim(),
      category: form.category,
      departmentId: Number(form.departmentId),
      principalInvestigatorId: Number(form.principalInvestigatorId),
      startDate: form.startDate,
      expectedCompletionDate: form.expectedCompletionDate,
      fundingRequired: form.fundingRequired === '' ? 0 : Number(form.fundingRequired),
      objectives: form.objectives.trim(),
      expectedOutcomes: form.expectedOutcomes.trim(),
      teamMembers: members
        .filter((m) => m.name.trim().length > 0)
        .map((m) => ({
          name: m.name.trim(),
          email: m.email.trim(),
          role: m.role,
          contribution: m.contribution.trim(),
          userId: m.userId ? Number(m.userId) : undefined,
        })),
    };

    setSaving(true);
    try {
      if (isEdit && id) {
        const body: typeof payload & { progress?: number } = { ...payload };
        // Progress is only editable while the project is running.
        if (record?.project.status === 'ACTIVE') body.progress = Number(form.progress || 0);
        await api.put(`/projects/${id}`, body);
        toast.success('Project updated', form.title.trim());
        navigate(`/projects/${id}`);
      } else {
        const res = await api.post<{ id: number; projectCode: string; message: string }>(
          '/projects',
          payload,
        );
        toast.success('Project created', `${res.projectCode} — ${res.message ?? 'Saved as a draft.'}`);
        navigate(`/projects/${res.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.details) {
        setErrors(mapServerDetails(err.details));
        toast.error('Validation failed', 'Please correct the highlighted fields.');
      } else {
        toast.error('Could not save the project', err instanceof Error ? err.message : undefined);
      }
    } finally {
      setSaving(false);
    }
  };

  const investigatorOptions = useMemo(
    () =>
      (meta?.investigators ?? []).map((inv) => ({
        value: String(inv.id),
        label: `${inv.full_name}${inv.department_name ? ` — ${inv.department_name}` : ''}`,
      })),
    [meta],
  );

  const categoryOptions = useMemo(
    () => (meta?.categories ?? []).map((c) => ({ value: c.category, label: c.category })),
    [meta],
  );

  const departmentOptions = useMemo(
    () =>
      (meta?.departments ?? []).map((d) => ({ value: String(d.id), label: `${d.code} — ${d.name}` })),
    [meta],
  );

  const domainListId = 'project-domain-options';
  const showProgress = isEdit && record?.project.status === 'ACTIVE';

  if (isEdit && recordLoading && !record) {
    return (
      <div className="space-y-6">
        <Card>
          <Spinner label="Loading project…" />
        </Card>
      </div>
    );
  }

  if (isEdit && recordError && !record) {
    return (
      <div className="space-y-6">
        <Card>
          <ErrorState message={recordError} onRetry={reload} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to={isEdit && id ? `/projects/${id}` : '/projects'}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition hover:text-brand-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        {isEdit ? 'Back to project' : 'Back to projects'}
      </Link>

      <PageHeader
        title={isEdit ? 'Edit project' : 'New research project'}
        description={
          isEdit
            ? 'Update the details, timeline, funding and team of this research project. Changes are written to the project record immediately.'
            : 'Register a research project with its objectives, funding requirement and team. New projects are saved as a draft and can be submitted for review afterwards.'
        }
        meta={
          isEdit && record ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <span className="rounded-md bg-ink-100 px-2 py-0.5 font-medium text-ink-700">
                {record.project.project_code}
              </span>
              <StatusBadge status={record.project.status} />
              <span>Created {formatDate(record.project.created_at)}</span>
            </div>
          ) : null
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => navigate(isEdit && id ? `/projects/${id}` : '/projects')}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button icon={<Save className="h-4 w-4" />} loading={saving} onClick={() => void submit()}>
              {isEdit ? 'Save changes' : 'Create project'}
            </Button>
          </>
        }
      />

      {prefillProjectId && record ? (
        <NoticeBanner tone="info" title="Prefilled from an existing project">
          <p>
            This form was prefilled from project <strong>{record.project.project_code}</strong> —{' '}
            {record.project.title}. Adjust the values before saving.
          </p>
        </NoticeBanner>
      ) : null}

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {/* --------------------------------------------------------- details */}
        <Card>
          <CardHeader title="Project details" description="The identity and ownership of the research work." />
          <CardBody className="space-y-4">
            <Input
              label="Project title"
              required
              value={form.title}
              error={errors.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="e.g. AI-assisted crop disease detection"
            />

            <Textarea
              label="Description"
              required
              rows={4}
              value={form.description}
              error={errors.description}
              hint="At least 20 characters. Explain what the project will do and why it matters."
              onChange={(e) => update('description', e.target.value)}
              placeholder="Describe the research problem, the approach and the expected contribution…"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Input
                  label="Research domain"
                  required
                  list={domainListId}
                  value={form.domain}
                  error={errors.domain}
                  hint="Pick an existing domain or type a new one."
                  onChange={(e) => update('domain', e.target.value)}
                  placeholder="e.g. Artificial Intelligence"
                />
                <datalist id={domainListId}>
                  {(meta?.domains ?? []).map((d) => (
                    <option key={d.domain} value={d.domain} />
                  ))}
                </datalist>
              </div>

              <Select
                label="Project category"
                required
                value={form.category}
                error={errors.category}
                placeholder="Select a category"
                options={categoryOptions}
                onChange={(e) => update('category', e.target.value)}
              />

              <Select
                label="Department"
                required
                value={form.departmentId}
                error={errors.departmentId}
                placeholder="Select a department"
                options={departmentOptions}
                onChange={(e) => update('departmentId', e.target.value)}
              />

              <Select
                label="Principal investigator"
                required
                value={form.principalInvestigatorId}
                error={errors.principalInvestigatorId}
                hint="The investigator accountable for the project."
                placeholder="Select an investigator"
                options={investigatorOptions}
                onChange={(e) => update('principalInvestigatorId', e.target.value)}
              />
            </div>
          </CardBody>
        </Card>

        {/* ------------------------------------------- timeline & funding */}
        <Card>
          <CardHeader
            title="Timeline & funding"
            description="When the project runs, how long it takes and what it costs."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                label="Start date"
                required
                type="date"
                value={form.startDate}
                error={errors.startDate}
                onChange={(e) => update('startDate', e.target.value)}
              />

              <Input
                label="Expected completion date"
                required
                type="date"
                value={form.expectedCompletionDate}
                error={errors.expectedCompletionDate}
                hint="Must be on or after the start date."
                onChange={(e) => update('expectedCompletionDate', e.target.value)}
              />

              <Input
                label="Funding required (USD)"
                type="number"
                min={0}
                step={100}
                value={form.fundingRequired}
                error={errors.fundingRequired}
                hint="Enter 0 if no funding is sought."
                onChange={(e) => update('fundingRequired', e.target.value)}
                placeholder="0"
              />

              {showProgress ? (
                <Input
                  label="Progress (%)"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={form.progress}
                  hint="Completion of an active project, between 0 and 100."
                  onChange={(e) => update('progress', e.target.value)}
                />
              ) : null}
            </div>

            <Textarea
              label="Objectives"
              required
              rows={4}
              value={form.objectives}
              error={errors.objectives}
              hint="At least 10 characters. List what the project sets out to achieve."
              onChange={(e) => update('objectives', e.target.value)}
              placeholder="1. Build the dataset…&#10;2. Train and validate the model…"
            />

            <Textarea
              label="Expected outcomes"
              rows={3}
              value={form.expectedOutcomes}
              hint="What the institution gains once the project ends."
              onChange={(e) => update('expectedOutcomes', e.target.value)}
              placeholder="Publications, prototypes, patents, datasets…"
            />
          </CardBody>
        </Card>

        {/* --------------------------------------------------- team members */}
        <Card>
          <CardHeader
            title="Team members"
            description="Everyone contributing to the project besides the principal investigator."
            action={
              <Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={addMember}>
                Add member
              </Button>
            }
          />
          <CardBody className="space-y-4">
            {members.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-ink-300 px-6 py-8 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-ink-400">
                  <Users className="h-5 w-5" aria-hidden />
                </span>
                <p className="text-sm text-ink-500">
                  No team member added yet. A project can be saved without a team and extended later.
                </p>
                <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={addMember}>
                  Add the first member
                </Button>
              </div>
            ) : (
              members.map((m, index) => (
                <div key={m.key} className="rounded-lg border border-ink-200 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                      Member {index + 1}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      onClick={() => removeMember(index)}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Input
                      label="Full name"
                      required
                      value={m.name}
                      error={errors[`members.${index}.name`]}
                      onChange={(e) => updateMember(index, { name: e.target.value })}
                      placeholder="e.g. Dr. A. Sharma"
                    />
                    <Input
                      label="Email"
                      type="email"
                      value={m.email}
                      error={errors[`members.${index}.email`]}
                      onChange={(e) => updateMember(index, { email: e.target.value })}
                      placeholder="name@university.edu"
                    />
                    <Select
                      label="Role"
                      value={m.role}
                      options={TEAM_ROLE_OPTIONS}
                      onChange={(e) => updateMember(index, { role: e.target.value })}
                    />
                    <Select
                      label="Linked portal user"
                      value={m.userId}
                      placeholder="Not linked"
                      options={investigatorOptions}
                      onChange={(e) => updateMember(index, { userId: e.target.value })}
                      wrapperClassName="sm:col-span-2 lg:col-span-3"
                    />
                    <Textarea
                      label="Contribution"
                      rows={2}
                      value={m.contribution}
                      onChange={(e) => updateMember(index, { contribution: e.target.value })}
                      placeholder="What does this member contribute?"
                      wrapperClassName="sm:col-span-2 lg:col-span-3"
                    />
                  </div>
                </div>
              ))
            )}
          </CardBody>
          <CardFooter className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(isEdit && id ? `/projects/${id}` : '/projects')}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" icon={<Save className="h-4 w-4" />} loading={saving}>
              {isEdit ? 'Save changes' : 'Create project'}
            </Button>
          </CardFooter>
        </Card>
      </form>

      {isEdit && record ? (
        <Card>
          <CardHeader title="Record snapshot" description="Read-only values stored on the server." />
          <CardBody>
            <DetailGrid columns={4}>
              <DetailItem label="Project code">{record.project.project_code}</DetailItem>
              <DetailItem label="Status">
                <StatusBadge status={record.project.status} />
              </DetailItem>
              <DetailItem label="Progress">{record.project.progress ?? 0}%</DetailItem>
              <DetailItem label="Team members">{record.team.length}</DetailItem>
            </DetailGrid>
          </CardBody>
        </Card>
      ) : null}

      <p className="flex items-center gap-1.5 text-xs text-ink-400">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden />
        All project data in this demo environment is fictional sample data.
      </p>
    </div>
  );
}
