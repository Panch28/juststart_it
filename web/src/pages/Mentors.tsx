import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  CalendarClock,
  Handshake,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { Paged } from '../lib/api';
import { useAsync, useDebounced } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { formatDate, formatNumber, initials } from '../lib/format';
import { label } from '../lib/constants';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  StatCard,
  Textarea,
  useToast,
} from '../components/ui';
import {
  InlineProgress,
  MetaChip,
  NoticeBanner,
  StatusBadge,
} from '../components/common';

interface Mentor {
  id: number;
  user_id: number;
  full_name: string;
  email: string;
  designation: string | null;
  expertise: string | null;
  industries: string | null;
  bio: string | null;
  max_startups: number;
  status: string;
  assigned_count: number;
  meeting_count: number;
  active_incubations: number;
}

interface MyAssignment {
  id: number;
  mentor_id: number;
  startup_id: number;
  assigned_at: string;
  status: string;
  next_meeting_at: string | null;
  startup_name: string;
  startup_code: string;
  stage: string;
  industry: string;
}

interface MentorResponse {
  mentors: Mentor[];
  myAssignments: MyAssignment[];
}

interface DirectoryUser {
  id: number;
  fullName: string;
  email: string;
  role: string;
  designation: string | null;
  department: string | null;
}

interface CandidateResponse {
  candidates: DirectoryUser[];
}

type DirectoryAccess = 'unknown' | 'allowed' | 'denied' | 'failed';

function splitTags(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function Mentors() {
  const { user, can } = useAuth();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 350);

  const list = useAsync<MentorResponse>(
    () => api.get<MentorResponse>('/mentors', { search: debouncedSearch }),
    [debouncedSearch],
  );

  // The candidate directory requires the mentor-management permission. Probe it
  // once so the UI can explain clearly why adding a mentor is unavailable.
  const [directoryAccess, setDirectoryAccess] = useState<DirectoryAccess>('unknown');
  const probe = useRef(0);
  useEffect(() => {
    const ticket = ++probe.current;
    api
      .get<CandidateResponse>('/mentors/candidates', { q: '' })
      .then(() => {
        if (ticket === probe.current) setDirectoryAccess('allowed');
      })
      .catch((err: unknown) => {
        if (ticket !== probe.current) return;
        if (err instanceof ApiError && err.status === 403) setDirectoryAccess('denied');
        else setDirectoryAccess('failed');
      });
  }, []);

  // Add mentor modal
  const [addOpen, setAddOpen] = useState(false);
  const [lookupTerm, setLookupTerm] = useState('');
  const [lookupResults, setLookupResults] = useState<DirectoryUser[] | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);
  const [expertise, setExpertise] = useState('');
  const [industries, setIndustries] = useState('');
  const [bio, setBio] = useState('');
  const [maxStartups, setMaxStartups] = useState('3');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit mentor modal
  const [editTarget, setEditTarget] = useState<Mentor | null>(null);
  const [editExpertise, setEditExpertise] = useState('');
  const [editIndustries, setEditIndustries] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editMaxStartups, setEditMaxStartups] = useState('3');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [toggleBusyId, setToggleBusyId] = useState<number | null>(null);

  const mentors = list.data?.mentors ?? [];
  const myAssignments = list.data?.myAssignments ?? [];

  const summary = useMemo(
    () => ({
      total: mentors.length,
      active: mentors.filter((m) => m.status === 'ACTIVE').length,
      assignments: mentors.reduce((sum, m) => sum + (m.assigned_count ?? 0), 0),
      meetings: mentors.reduce((sum, m) => sum + (m.meeting_count ?? 0), 0),
    }),
    [mentors],
  );

  const canManage = can('mentor.manage');
  const addBlocked = directoryAccess === 'denied' || directoryAccess === 'failed';

  const runLookup = async () => {
    setLookupBusy(true);
    setLookupError(null);
    try {
      const res = await api.get<CandidateResponse>('/mentors/candidates', {
        q: lookupTerm.trim(),
      });
      setLookupResults(res.candidates ?? []);
      if (!res.candidates || res.candidates.length === 0) {
        setLookupError('No institutional account matched that search.');
      }
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Could not search the user directory.';
      setLookupError(message);
      setLookupResults(null);
    } finally {
      setLookupBusy(false);
    }
  };

  const openAddModal = () => {
    setAddError(null);
    setLookupError(null);
    setLookupResults(null);
    setSelectedUser(null);
    setLookupTerm('');
    setExpertise('');
    setIndustries('');
    setBio('');
    setMaxStartups('3');
    setAddOpen(true);
  };

  const submitAdd = async () => {
    setAddError(null);
    if (!selectedUser) {
      setAddError('Look up and select the person who will become the mentor.');
      return;
    }
    if (expertise.trim().length < 3) {
      setAddError('Expertise must be at least 3 characters.');
      return;
    }
    if (industries.trim().length < 2) {
      setAddError('Industry information is required.');
      return;
    }
    setAddBusy(true);
    try {
      await api.post('/mentors', {
        userId: selectedUser.id,
        expertise: expertise.trim(),
        industries: industries.trim(),
        bio: bio.trim(),
        maxStartups: Number(maxStartups) || 3,
      });
      toast.success('Mentor added', `${selectedUser.fullName} can now be assigned to startups.`);
      setAddOpen(false);
      list.reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not add the mentor.';
      setAddError(message);
      toast.error('Could not add mentor', message);
    } finally {
      setAddBusy(false);
    }
  };

  const openEditModal = (mentor: Mentor) => {
    setEditTarget(mentor);
    setEditExpertise(mentor.expertise ?? '');
    setEditIndustries(mentor.industries ?? '');
    setEditBio(mentor.bio ?? '');
    setEditMaxStartups(String(mentor.max_startups ?? 3));
    setEditError(null);
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    setEditError(null);
    setEditBusy(true);
    try {
      const body: Record<string, unknown> = {
        expertise: editExpertise.trim(),
        industries: editIndustries.trim(),
        bio: editBio.trim(),
      };
      if (canManage) body.maxStartups = Number(editMaxStartups) || editTarget.max_startups;
      await api.put(`/mentors/${editTarget.id}`, body);
      toast.success('Mentor profile updated', editTarget.full_name);
      setEditTarget(null);
      list.reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not update the mentor profile.';
      setEditError(message);
      toast.error('Update failed', message);
    } finally {
      setEditBusy(false);
    }
  };

  const toggleStatus = async (mentor: Mentor) => {
    const next = mentor.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setToggleBusyId(mentor.id);
    try {
      await api.put(`/mentors/${mentor.id}`, { status: next });
      toast.success(
        next === 'ACTIVE' ? 'Mentor activated' : 'Mentor deactivated',
        `${mentor.full_name} is now ${next.toLowerCase()}.`,
      );
      list.reload();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not change the mentor status.';
      toast.error('Update failed', message);
    } finally {
      setToggleBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mentors"
        description="The mentor pool available to guide incubated ventures — expertise, capacity and the startups each mentor currently supports."
        actions={
          <>
            <Button
              variant="outline"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={list.reload}
            >
              Refresh
            </Button>
            {canManage ? (
              <Button
                icon={<UserPlus className="h-4 w-4" />}
                onClick={openAddModal}
                disabled={addBlocked || directoryAccess === 'unknown'}
                title={
                  addBlocked
                    ? 'You do not have access to the institutional account directory.'
                    : 'Add a person to the mentor pool'
                }
              >
                Add mentor
              </Button>
            ) : null}
          </>
        }
      />

      {canManage && directoryAccess === 'denied' ? (
        <NoticeBanner tone="warning" title="The account directory is unavailable">
          <p>
            Adding a mentor requires an institutional user account, and the account directory is
            restricted to administrators and incubation managers. You can still review the mentor
            pool, edit your own expertise and assign mentors to startups. Ask an administrator to
            register a new mentor.
          </p>
        </NoticeBanner>
      ) : null}

      {canManage && directoryAccess === 'failed' ? (
        <NoticeBanner tone="warning" title="The account directory is unavailable">
          <p>
            The directory of institutional accounts could not be reached, so mentors cannot be
            added right now. Refresh the page to try again.
          </p>
        </NoticeBanner>
      ) : null}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Mentors"
          value={formatNumber(summary.total)}
          icon={<Users className="h-5 w-5" />}
          hint="Shown for the current search"
          tone="brand"
        />
        <StatCard
          title="Active mentors"
          value={formatNumber(summary.active)}
          icon={<ShieldCheck className="h-5 w-5" />}
          hint="Available for new assignments"
          tone="emerald"
        />
        <StatCard
          title="Active assignments"
          value={formatNumber(summary.assignments)}
          icon={<Handshake className="h-5 w-5" />}
          hint="Mentor–startup pairings in progress"
          tone="violet"
        />
        <StatCard
          title="Meetings recorded"
          value={formatNumber(summary.meetings)}
          icon={<CalendarClock className="h-5 w-5" />}
          hint="Mentorship meetings logged"
          tone="amber"
        />
      </div>

      {/* My assignments */}
      <Card>
        <CardHeader
          title="My assignments"
          description="Startups you are currently mentoring."
          action={
            <Link
              to="/startups"
              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              View startups
            </Link>
          }
        />
        {myAssignments.length === 0 ? (
          <EmptyState
            title="No assignments for your account"
            description="When a mentor is assigned to a startup it appears here with the next scheduled meeting."
            icon={<Handshake className="h-6 w-6" />}
          />
        ) : (
          <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 xl:grid-cols-3">
            {myAssignments.map((a) => (
              <Link
                key={a.id}
                to={`/startups/${a.startup_id}`}
                className="rounded-xl border border-ink-200 p-4 transition hover:border-brand-300 hover:bg-brand-50/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-ink-900">{a.startup_name}</p>
                  <StatusBadge status={a.stage} />
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {a.startup_code} · {a.industry}
                </p>
                <p className="mt-2 text-xs text-ink-500">
                  Assigned {formatDate(a.assigned_at)} · Next meeting{' '}
                  {a.next_meeting_at ? formatDate(a.next_meeting_at) : 'not scheduled'}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Mentor pool */}
      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-200 bg-ink-50/50 px-4 py-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              aria-label="Search mentors"
              placeholder="Search by name or expertise…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {search ? (
            <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
              Clear search
            </Button>
          ) : null}
          <p className="ml-auto text-xs text-ink-500">
            {mentors.length} {mentors.length === 1 ? 'mentor' : 'mentors'} shown
          </p>
        </div>

        {list.loading && !list.data ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-ink-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 animate-pulse rounded-full bg-ink-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 animate-pulse rounded bg-ink-100" />
                    <div className="h-3 w-20 animate-pulse rounded bg-ink-100" />
                  </div>
                </div>
                <div className="h-3 w-full animate-pulse rounded bg-ink-100" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-ink-100" />
                <div className="h-1.5 w-full animate-pulse rounded bg-ink-100" />
              </div>
            ))}
          </div>
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : mentors.length === 0 ? (
          <EmptyState
            title={search ? 'No mentors match that search' : 'No mentors registered yet'}
            description={
              search
                ? 'Try a different name or area of expertise.'
                : 'Mentors registered by an administrator will appear here with their expertise and capacity.'
            }
            icon={<Users className="h-6 w-6" />}
          />
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {mentors.map((m) => {
              const capacity = Math.min(
                100,
                m.max_startups > 0 ? Math.round((m.assigned_count / m.max_startups) * 100) : 0,
              );
              const isSelf = m.user_id === user?.id;
              const canEdit = canManage || (can('mentor.update.own') && isSelf);
              const industryTags = splitTags(m.industries);
              const expertiseTags = splitTags(m.expertise);
              return (
                <div
                  key={m.id}
                  className="flex flex-col rounded-xl border border-ink-200 bg-white transition hover:border-brand-300"
                >
                  <div className="flex-1 space-y-3 p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                        {initials(m.full_name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-900">{m.full_name}</p>
                        <p className="truncate text-xs text-ink-500">
                          {m.designation ?? 'Mentor'}
                        </p>
                      </div>
                      <Badge tone={m.status === 'ACTIVE' ? 'success' : 'neutral'} dot>
                        {label(m.status)}
                      </Badge>
                    </div>

                    <p className="truncate text-xs text-ink-500">{m.email}</p>

                    <div className="flex flex-wrap gap-1.5">
                      {expertiseTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 ring-1 ring-inset ring-brand-200"
                        >
                          {tag}
                        </span>
                      ))}
                      {industryTags.map((tag) => (
                        <MetaChip key={tag}>{tag}</MetaChip>
                      ))}
                    </div>

                    {m.bio ? (
                      <p className="line-clamp-3 text-xs leading-relaxed text-ink-600">{m.bio}</p>
                    ) : null}

                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-ink-600">Capacity</span>
                        <span className="font-semibold text-ink-800">
                          {m.assigned_count}/{m.max_startups} startups
                        </span>
                      </div>
                      <InlineProgress value={capacity} />
                    </div>

                    <div className="grid grid-cols-2 gap-2 border-t border-ink-100 pt-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                          <CalendarClock className="h-3.5 w-3.5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-ink-900">{m.meeting_count}</p>
                          <p className="text-[11px] text-ink-500">Meetings</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                          <Briefcase className="h-3.5 w-3.5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-ink-900">
                            {m.active_incubations}
                          </p>
                          <p className="text-[11px] text-ink-500">Active incubations</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 border-t border-ink-100 bg-ink-50/50 px-4 py-2.5">
                    {canEdit ? (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => openEditModal(m)}
                      >
                        Edit
                      </Button>
                    ) : null}
                    {canManage ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={toggleBusyId === m.id}
                        onClick={() => {
                          void toggleStatus(m);
                        }}
                      >
                        {m.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </Button>
                    ) : null}
                    {!canEdit && !canManage ? (
                      <p className="text-[11px] text-ink-400">View only</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* --------------------------------------------------------- Add mentor */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a mentor"
        description="Find the institutional account of the person, then describe their expertise and capacity."
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addBusy}>
              Cancel
            </Button>
            <Button onClick={submitAdd} loading={addBusy}>
              Add mentor
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {addError ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {addError}
            </p>
          ) : null}

          <div className="rounded-xl border border-ink-200 p-3">
            <p className="label-base">1 · Find the person</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Input
                aria-label="Mentor email or full name"
                placeholder="Email or full name"
                className="flex-1"
                value={lookupTerm}
                onChange={(e) => setLookupTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void runLookup();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                icon={<Search className="h-4 w-4" />}
                loading={lookupBusy}
                onClick={() => {
                  void runLookup();
                }}
              >
                Search
              </Button>
            </div>

            {lookupError ? (
              <p className="mt-2 text-xs font-medium text-rose-600">{lookupError}</p>
            ) : null}

            {lookupResults && lookupResults.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {lookupResults.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedUser(u)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition ${
                        selectedUser?.id === u.id
                          ? 'border-brand-400 bg-brand-50'
                          : 'border-ink-200 hover:bg-ink-50'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink-900">
                          {u.fullName}
                        </span>
                        <span className="block truncate text-xs text-ink-500">
                          {u.email} · {label(u.role)}
                          {u.department ? ` · ${u.department}` : ''}
                        </span>
                      </span>
                      {selectedUser?.id === u.id ? (
                        <ShieldCheck className="h-4 w-4 shrink-0 text-brand-600" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {selectedUser ? (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                {selectedUser.fullName} ({selectedUser.email}) selected
                <button
                  type="button"
                  className="ml-auto text-brand-600 hover:text-brand-800"
                  aria-label="Clear selection"
                  onClick={() => setSelectedUser(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </p>
            ) : null}
          </div>

          <div className="space-y-4 rounded-xl border border-ink-200 p-3">
            <p className="label-base">2 · Mentor profile</p>
            <Input
              label="Expertise"
              required
              placeholder="e.g. Bioprocess engineering, scale-up"
              value={expertise}
              onChange={(e) => setExpertise(e.target.value)}
            />
            <Input
              label="Industries"
              required
              placeholder="e.g. Biotechnology, Clean energy"
              hint="Separate multiple industries with commas."
              value={industries}
              onChange={(e) => setIndustries(e.target.value)}
            />
            <Textarea
              label="Bio"
              rows={3}
              placeholder="A short summary of the mentor's background and track record."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
            <Input
              label="Maximum active startups"
              type="number"
              min={1}
              max={10}
              hint="Between 1 and 10 concurrent assignments."
              value={maxStartups}
              onChange={(e) => setMaxStartups(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* --------------------------------------------------------- Edit mentor */}
      <Modal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title="Edit mentor profile"
        description={
          editTarget
            ? `Update the public profile of ${editTarget.full_name}.`
            : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editBusy}>
              Cancel
            </Button>
            <Button onClick={submitEdit} loading={editBusy}>
              Save profile
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {editError ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {editError}
            </p>
          ) : null}

          {!canManage ? (
            <NoticeBanner tone="info" title="Limited editing">
              <p>Mentors can update their own expertise, industries and biography.</p>
            </NoticeBanner>
          ) : null}

          <Input
            label="Expertise"
            required
            value={editExpertise}
            onChange={(e) => setEditExpertise(e.target.value)}
          />
          <Input
            label="Industries"
            required
            hint="Separate multiple industries with commas."
            value={editIndustries}
            onChange={(e) => setEditIndustries(e.target.value)}
          />
          <Textarea
            label="Bio"
            rows={4}
            value={editBio}
            onChange={(e) => setEditBio(e.target.value)}
          />
          {canManage ? (
            <Input
              label="Maximum active startups"
              type="number"
              min={1}
              max={10}
              value={editMaxStartups}
              onChange={(e) => setEditMaxStartups(e.target.value)}
            />
          ) : null}
        </div>
      </Modal>

      <p className="flex items-center gap-1.5 text-xs text-ink-400">
        <Plus className="h-3.5 w-3.5" />
        Mentor capacity, meetings and incubation counts are derived from the live records. All data
        is fictional demonstration data.
      </p>
    </div>
  );
}
