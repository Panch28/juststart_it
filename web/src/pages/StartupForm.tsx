import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info, Lightbulb, Plus, Save, Trash2, Users } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { label } from '../lib/constants';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Textarea,
  useToast,
} from '../components/ui';
import { NoticeBanner } from '../components/common';

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

interface StartupDetailResponse {
  startup: {
    id: number;
    startup_code: string;
    name: string;
    founder_user_id: number | null;
    founder_name: string | null;
    founder_email: string | null;
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
  };
  team: Array<{
    id: number;
    name: string;
    email: string | null;
    member_role: string;
  }>;
}

interface TeamMemberRow {
  key: string;
  id?: number;
  name: string;
  email: string;
  role: string;
}

const TEAM_ROLES = ['FOUNDER', 'CO_FOUNDER', 'MEMBER', 'ADVISOR', 'TECHNICAL'];

const MIN_LENGTHS = {
  name: 3,
  description: 20,
  problem: 10,
  solution: 10,
  industry: 2,
  founderName: 2,
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeRow(): TeamMemberRow {
  return { key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, name: '', email: '', role: 'MEMBER' };
}

export default function StartupForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const isEdit = Boolean(id);
  const prefillProjectId = searchParams.get('projectId');

  const meta = useAsync<StartupMeta>(() => api.get<StartupMeta>('/startups/meta'), []);
  const detail = useAsync<StartupDetailResponse | null>(
    () => (id ? api.get<StartupDetailResponse>(`/startups/${id}`) : Promise.resolve(null)),
    [id],
  );

  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');
  const [problem, setProblem] = useState('');
  const [solution, setSolution] = useState('');
  const [supportRequired, setSupportRequired] = useState('');

  const [founderName, setFounderName] = useState('');
  const [founderEmail, setFounderEmail] = useState('');
  const [founderUserId, setFounderUserId] = useState<number | null>(null);

  const [relatedProjectId, setRelatedProjectId] = useState('');
  const [applicationDate, setApplicationDate] = useState(today());
  const [currentStage, setCurrentStage] = useState('');
  const [stage, setStage] = useState('APPLIED');

  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const hydrated = useRef(false);

  // Hydrate the form from the server when editing.
  useEffect(() => {
    if (!detail.data || hydrated.current) return;
    hydrated.current = true;
    const s = detail.data.startup;
    setName(s.name ?? '');
    setIndustry(s.industry ?? '');
    setDescription(s.description ?? '');
    setProblem(s.problem ?? '');
    setSolution(s.solution ?? '');
    setSupportRequired(s.support_required ?? '');
    setFounderName(s.founder_name ?? '');
    setFounderEmail('');
    setFounderUserId(s.founder_user_id);
    setRelatedProjectId(s.related_project_id ? String(s.related_project_id) : '');
    setApplicationDate(s.application_date ?? today());
    setStage(s.stage ?? 'APPLIED');
    setTeamMembers(
      (detail.data.team ?? []).map((m) => ({
        key: `team-${m.id}`,
        id: m.id,
        name: m.name,
        email: m.email ?? '',
        role: m.member_role,
      })),
    );
  }, [detail.data]);

  // Prefill the linked project from ?projectId= when registering a new startup.
  const prefilled = useRef(false);
  useEffect(() => {
    if (isEdit || prefilled.current || !prefillProjectId) return;
    prefilled.current = true;
    const match = (meta.data?.eligibleProjects ?? []).find(
      (p) => String(p.id) === String(prefillProjectId),
    );
    if (match) setRelatedProjectId(String(match.id));
  }, [isEdit, prefillProjectId, meta.data]);

  const industryOptions = meta.data?.industries ?? [];
  const projectOptions = (meta.data?.eligibleProjects ?? []).map((p) => ({
    value: String(p.id),
    label: `${p.project_code} — ${p.title}`,
  }));
  const stageOptions = (meta.data?.stages ?? []).map((s) => ({ value: s, label: label(s) }));

  const updateMember = (key: string, patch: Partial<TeamMemberRow>) => {
    setTeamMembers((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  };

  const removeMember = (key: string) => {
    setTeamMembers((prev) => prev.filter((m) => m.key !== key));
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (name.trim().length < MIN_LENGTHS.name) {
      errors.name = `Startup name must be at least ${MIN_LENGTHS.name} characters.`;
    }
    if (industry.trim().length < MIN_LENGTHS.industry) {
      errors.industry = 'Industry is required.';
    }
    if (description.trim().length < MIN_LENGTHS.description) {
      errors.description = `Business idea description must be at least ${MIN_LENGTHS.description} characters.`;
    }
    if (problem.trim().length < MIN_LENGTHS.problem) {
      errors.problem = `Problem statement must be at least ${MIN_LENGTHS.problem} characters.`;
    }
    if (solution.trim().length < MIN_LENGTHS.solution) {
      errors.solution = `Proposed solution must be at least ${MIN_LENGTHS.solution} characters.`;
    }
    if (founderName.trim().length < MIN_LENGTHS.founderName) {
      errors.founderName = 'Founder name is required.';
    }
    if (founderEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(founderEmail.trim())) {
      errors.founderEmail = 'Enter a valid email address.';
    }
    teamMembers.forEach((m, index) => {
      if (m.name.trim().length < 2) {
        errors[`teamMembers.${index}.name`] = 'Member name is required.';
      }
      if (m.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email.trim())) {
        errors[`teamMembers.${index}.email`] = 'Enter a valid email address.';
      }
    });
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    if (!validate()) {
      toast.error('Check the highlighted fields', 'Some details are missing or too short.');
      return;
    }

    const body: Record<string, unknown> = {
      name: name.trim(),
      industry: industry.trim(),
      description: description.trim(),
      problem: problem.trim(),
      solution: solution.trim(),
      supportRequired: supportRequired.trim(),
      founderName: founderName.trim(),
      founderEmail: founderEmail.trim(),
      currentStage: currentStage.trim(),
      applicationDate: applicationDate,
      relatedProjectId: relatedProjectId ? Number(relatedProjectId) : null,
    };
    if (founderUserId) body.founderUserId = founderUserId;
    if (isEdit) {
      body.stage = stage;
    } else {
      body.teamMembers = teamMembers
        .filter((m) => m.name.trim().length > 0)
        .map((m) => ({
          name: m.name.trim(),
          email: m.email.trim(),
          role: m.role,
        }));
    }

    setSaving(true);
    try {
      if (isEdit && id) {
        await api.put(`/startups/${id}`, body);
        toast.success('Startup updated', 'The changes have been saved.');
        navigate(`/startups/${id}`);
      } else {
        const res = await api.post<{ id: number; startupCode: string; message: string }>(
          '/startups',
          body,
        );
        toast.success('Startup registered', `${res.startupCode} was created successfully.`);
        navigate(`/startups/${res.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        const map: Record<string, string> = {};
        err.details.forEach((d) => {
          map[d.field] = d.message;
        });
        setFieldErrors(map);
        setSubmitError('The server rejected some values. Please correct the highlighted fields.');
        toast.error('Validation failed', 'Please correct the highlighted fields.');
      } else {
        const message =
          err instanceof ApiError ? err.message : 'Could not save the startup. Please try again.';
        setSubmitError(message);
        toast.error('Save failed', message);
      }
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && detail.loading && !detail.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Edit startup" description="Loading the startup record…" />
        <Card>
          <Spinner label="Loading startup…" />
        </Card>
      </div>
    );
  }

  if (isEdit && detail.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Edit startup" description="The startup record could not be loaded." />
        <Card>
          <ErrorState message={detail.error} onRetry={detail.reload} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to={isEdit && id ? `/startups/${id}` : '/startups'}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 transition hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" />
        {isEdit ? 'Back to startup' : 'Back to startups'}
      </Link>

      <PageHeader
        title={isEdit ? 'Edit startup' : 'Register a startup'}
        description={
          isEdit
            ? 'Update the venture profile, founder details and the incubation stage of this application.'
            : 'Record a venture application. Incubation is optional — a research project does not have to become a startup.'
        }
        actions={
          <Button
            variant="outline"
            onClick={() => navigate(isEdit && id ? `/startups/${id}` : '/startups')}
            disabled={saving}
          >
            Cancel
          </Button>
        }
      />

      {submitError ? (
        <NoticeBanner tone="danger" title="Could not save">
          <p>{submitError}</p>
        </NoticeBanner>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* ------------------------------------------------------ Profile */}
        <Card>
          <CardHeader
            title="Startup profile"
            description="The core idea, the problem it addresses and the proposed solution."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Startup name"
                required
                placeholder="e.g. Nova Analytics"
                error={fieldErrors.name}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div>
                <Input
                  label="Industry"
                  required
                  list="startup-industry-options"
                  placeholder="e.g. Clean Energy"
                  error={fieldErrors.industry}
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                />
                <datalist id="startup-industry-options">
                  {industryOptions.map((i) => (
                    <option key={i.industry} value={i.industry} />
                  ))}
                </datalist>
              </div>
            </div>

            <Textarea
              label="Business idea description"
              required
              rows={4}
              hint={`At least ${MIN_LENGTHS.description} characters. ${
                description.trim().length
              } entered.`}
              error={fieldErrors.description}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <Textarea
              label="Problem statement"
              required
              rows={3}
              hint={`At least ${MIN_LENGTHS.problem} characters. ${problem.trim().length} entered.`}
              error={fieldErrors.problem}
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
            />

            <Textarea
              label="Proposed solution"
              required
              rows={3}
              hint={`At least ${MIN_LENGTHS.solution} characters. ${solution.trim().length} entered.`}
              error={fieldErrors.solution}
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
            />

            <Textarea
              label="Support required from the incubator"
              rows={3}
              hint="Optional — lab access, prototype budget, legal or IP counselling."
              value={supportRequired}
              onChange={(e) => setSupportRequired(e.target.value)}
            />
          </CardBody>
        </Card>

        {/* ------------------------------------------------- Founder & team */}
        <Card>
          <CardHeader
            title="Founder & team"
            description="Who is behind the venture and what they need from the incubator."
          />
          <CardBody className="space-y-5">
            <NoticeBanner tone="info" title="Account linking is done by an administrator">
              <p>
                There is no public directory of user accounts, so the founder is recorded by name
                and email here. An administrator links this application to the founder&rsquo;s
                institutional account — until then the application appears under the name below.
              </p>
            </NoticeBanner>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Founder name"
                required
                placeholder="Full name of the founder"
                error={fieldErrors.founderName}
                value={founderName}
                onChange={(e) => setFounderName(e.target.value)}
              />
              <Input
                label="Founder email"
                type="email"
                placeholder="founder@example.edu"
                error={fieldErrors.founderEmail}
                value={founderEmail}
                onChange={(e) => setFounderEmail(e.target.value)}
              />
            </div>

            {isEdit ? (
              <Field
                label="Linked founder account"
                hint={
                  founderUserId
                    ? `Account #${founderUserId} is linked to this application.`
                    : 'No founder account is linked to this application yet.'
                }
              >
                <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2">
                  <Users className="h-4 w-4 text-ink-400" />
                  <span className="text-sm text-ink-600">
                    {founderUserId ? `Linked account #${founderUserId}` : 'Not linked'}
                  </span>
                </div>
              </Field>
            ) : null}

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="label-base mb-0">Team members</p>
                  <p className="text-xs text-ink-500">
                    {isEdit
                      ? 'Team membership is captured at registration. Ask an administrator to change it.'
                      : 'Optional — add the co-founders and core team members.'}
                  </p>
                </div>
                {!isEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    icon={<Plus className="h-4 w-4" />}
                    onClick={() => setTeamMembers((prev) => [...prev, makeRow()])}
                  >
                    Add member
                  </Button>
                ) : null}
              </div>

              {teamMembers.length === 0 ? (
                <p className="rounded-lg border border-dashed border-ink-300 px-4 py-6 text-center text-xs text-ink-500">
                  No team members recorded.
                </p>
              ) : (
                <div className="space-y-3">
                  {teamMembers.map((m, index) => (
                    <div
                      key={m.key}
                      className="grid gap-3 rounded-lg border border-ink-200 bg-ink-50/40 p-3 sm:grid-cols-[1fr_1fr_10rem_auto]"
                    >
                      <Input
                        aria-label={`Team member ${index + 1} name`}
                        placeholder="Full name"
                        disabled={isEdit}
                        error={fieldErrors[`teamMembers.${index}.name`]}
                        value={m.name}
                        onChange={(e) => updateMember(m.key, { name: e.target.value })}
                      />
                      <Input
                        aria-label={`Team member ${index + 1} email`}
                        type="email"
                        placeholder="email@example.edu"
                        disabled={isEdit}
                        error={fieldErrors[`teamMembers.${index}.email`]}
                        value={m.email}
                        onChange={(e) => updateMember(m.key, { email: e.target.value })}
                      />
                      <Select
                        aria-label={`Team member ${index + 1} role`}
                        disabled={isEdit}
                        options={TEAM_ROLES.map((r) => ({ value: r, label: label(r) }))}
                        value={m.role}
                        onChange={(e) => updateMember(m.key, { role: e.target.value })}
                      />
                      {!isEdit ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove team member ${index + 1}`}
                          onClick={() => removeMember(m.key)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        {/* ---------------------------------------------- Source project & dates */}
        <Card>
          <CardHeader
            title="Source project & dates"
            description="Optionally link the venture to an approved, active or completed research project."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Linked research project"
                placeholder="Not linked to a project"
                options={projectOptions}
                value={relatedProjectId}
                onChange={(e) => setRelatedProjectId(e.target.value)}
                hint="Only approved, active or completed projects can be incubated."
              />
              <Input
                label="Application date"
                type="date"
                value={applicationDate}
                onChange={(e) => setApplicationDate(e.target.value)}
              />
            </div>

            <Input
              label="Current stage note"
              placeholder="e.g. Prototype in pilot with two departments"
              hint="A short description of where the venture stands today."
              value={currentStage}
              onChange={(e) => setCurrentStage(e.target.value)}
            />

            {isEdit ? (
              <Select
                label="Incubation stage"
                options={stageOptions}
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                hint="Changing the stage here also updates the status of the application."
              />
            ) : (
              <NoticeBanner tone="info" title="New applications start at the Applied stage">
                <p>
                  The incubation stage is set by the incubation manager after the application is
                  reviewed. You can still change the founder, team and project links at any time.
                </p>
              </NoticeBanner>
            )}

            <div className="flex items-start gap-2.5 rounded-lg border border-ink-200 bg-ink-50/60 px-3.5 py-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
              <p className="text-xs leading-relaxed text-ink-600">
                A startup application is a record of a venture interest. Linking a research project
                does not convert that project into a company — projects may stay as research, be
                published, patented or licensed instead.
              </p>
            </div>
          </CardBody>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(isEdit && id ? `/startups/${id}` : '/startups')}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" icon={<Save className="h-4 w-4" />} loading={saving}>
            {isEdit ? 'Save changes' : 'Register startup'}
          </Button>
        </div>
      </form>

      {meta.error ? (
        <p className="text-xs text-rose-600">
          Filter options could not be loaded: {meta.error}
        </p>
      ) : null}

      <p className="flex items-center gap-1.5 text-xs text-ink-400">
        <Lightbulb className="h-3.5 w-3.5" />
        All records created here are fictional demonstration data.
      </p>
    </div>
  );
}
