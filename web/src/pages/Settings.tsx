import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Building2,
  Check,
  KeyRound,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { Paged } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { NOTIFICATION_CATEGORY_LABELS, label } from '../lib/constants';
import { DetailItem, DetailGrid, NoticeBanner } from '../components/common';
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
  PageHeader,
  Select,
  Spinner,
  TabPanel,
  Tabs,
  TableSkeleton,
  TableWrapper,
  Textarea,
  useToast,
} from '../components/ui';

interface NotificationPreferences {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  categories: string[];
}

interface SystemPreferences {
  institutionName: string;
  systemName: string;
  supportEmail: string;
  demoMode: boolean;
  fileSizeLimitMb: number;
  sessionDays: number;
}

interface WorkflowConfiguration {
  project: Record<string, string[]>;
  ipr: Record<string, string[]>;
}

interface SettingsPayload {
  deadline_reminder_days: number[];
  project_categories: string[];
  research_domains: string[];
  workflow_configuration: WorkflowConfiguration;
  notification_preferences: NotificationPreferences;
  system_preferences: SystemPreferences;
  [key: string]: unknown;
}

interface SettingsResponse {
  settings: SettingsPayload;
  editableBy: string;
  notice: string;
}

interface DepartmentRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  hod_user_id: number | null;
  hod_name: string | null;
  user_count: number;
  project_count: number;
}

interface DepartmentsResponse {
  departments: DepartmentRow[];
}

interface StaffRow {
  id: number;
  full_name: string;
  role: string;
  department_name: string | null;
}

interface DepartmentForm {
  code: string;
  name: string;
  description: string;
  hodUserId: string;
}

const EMPTY_DEPARTMENT: DepartmentForm = { code: '', name: '', description: '', hodUserId: '' };

const CATEGORY_OPTIONS = Object.keys(NOTIFICATION_CATEGORY_LABELS);

function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}

function isNotificationPreferences(value: unknown): value is NotificationPreferences {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray((value as NotificationPreferences).categories)
  );
}

export default function Settings() {
  const { user: sessionUser, can } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState('profile');

  const {
    data: settingsResponse,
    loading: settingsLoading,
    error: settingsError,
    reload: reloadSettings,
  } = useAsync<SettingsResponse>(() => api.get<SettingsResponse>('/settings'), []);

  const {
    data: departmentsResponse,
    loading: departmentsLoading,
    error: departmentsError,
    reload: reloadDepartments,
  } = useAsync<DepartmentsResponse>(() => api.get<DepartmentsResponse>('/departments'), []);

  const { data: staffList } = useAsync<Paged<StaffRow> | null>(
    () => (can('users.manage') ? api.get<Paged<StaffRow>>('/users', { pageSize: 100 }) : Promise.resolve(null)),
    [],
  );

  const settings = settingsResponse?.settings;
  const canManageSettings = can('settings.manage');
  const canManageDepartments = can('departments.manage');

  /* ------------------------------------------------------------- profile */
  const [fullName, setFullName] = useState('');
  const [designation, setDesignation] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [savingPassword, setSavingPassword] = useState(false);

  /* ------------------------------------------------ personal preferences */
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [prefCategories, setPrefCategories] = useState<string[]>([]);
  const [savingPrefs, setSavingPrefs] = useState(false);

  /* --------------------------------------------------------- system tab */
  const [deadlineDays, setDeadlineDays] = useState<number[]>([]);
  const [projectCategories, setProjectCategories] = useState<string[]>([]);
  const [researchDomains, setResearchDomains] = useState<string[]>([]);
  const [systemPrefs, setSystemPrefs] = useState<SystemPreferences | null>(null);
  const [systemNotificationPrefs, setSystemNotificationPrefs] = useState<NotificationPreferences | null>(null);
  const [workflowJson, setWorkflowJson] = useState('');
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  /* ------------------------------------------------------- departments */
  const [departmentModalOpen, setDepartmentModalOpen] = useState(false);
  const [departmentEditingId, setDepartmentEditingId] = useState<number | null>(null);
  const [departmentForm, setDepartmentForm] = useState<DepartmentForm>(EMPTY_DEPARTMENT);
  const [departmentFormError, setDepartmentFormError] = useState<string | null>(null);
  const [savingDepartment, setSavingDepartment] = useState(false);
  const [departmentDeleteTarget, setDepartmentDeleteTarget] = useState<DepartmentRow | null>(null);
  const [deletingDepartment, setDeletingDepartment] = useState(false);

  // Seed the editable state whenever fresh settings arrive.
  useEffect(() => {
    if (!settings) return;
    setFullName(sessionUser?.fullName ?? '');
    // The session payload does not expose the stored phone/designation values, so the
    // fields start blank and are only written when the user actually types something.
    setDesignation('');
    setPhone('');

    const personalKey = `notification_prefs:${sessionUser?.id ?? 0}`;
    const personalRaw = settings[personalKey];
    const personal = isNotificationPreferences(personalRaw) ? personalRaw : settings.notification_preferences;
    setEmailEnabled(Boolean(personal?.emailEnabled));
    setInAppEnabled(personal?.inAppEnabled ?? true);
    setPrefCategories(personal?.categories ?? []);

    setDeadlineDays(settings.deadline_reminder_days ?? []);
    setProjectCategories(settings.project_categories ?? []);
    setResearchDomains(settings.research_domains ?? []);
    setSystemPrefs(settings.system_preferences ?? null);
    setSystemNotificationPrefs(settings.notification_preferences ?? null);
    setWorkflowJson(JSON.stringify(settings.workflow_configuration ?? {}, null, 2));
  }, [settings, sessionUser]);

  const tabs = useMemo(
    () => [
      { key: 'profile', label: 'Profile', icon: <UserCog className="h-4 w-4" /> },
      { key: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
      { key: 'departments', label: 'Departments', icon: <Building2 className="h-4 w-4" /> },
      ...(canManageSettings
        ? [{ key: 'system', label: 'System', icon: <ShieldCheck className="h-4 w-4" /> }]
        : []),
    ],
    [canManageSettings],
  );

  /* ------------------------------------------------------------ actions */

  const saveProfile = async () => {
    if (fullName.trim().length < 3) {
      toast.error('Full name is too short', 'Full name must be at least 3 characters.');
      return;
    }
    setSavingProfile(true);
    try {
      const payload: Record<string, string> = { fullName: fullName.trim() };
      if (designation.trim()) payload.designation = designation.trim();
      if (phone.trim()) payload.phone = phone.trim();
      const res = await api.put<{ message: string }>('/settings/profile/me', payload);
      toast.success(res.message ?? 'Profile updated.', 'Your details have been saved.');
      reloadSettings();
    } catch (err) {
      toast.error('Could not save your profile', messageOf(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    const errors: Record<string, string> = {};
    if (!currentPassword) errors.currentPassword = 'Enter your current password.';
    if (newPassword.length < 8) errors.newPassword = 'New password must be at least 8 characters.';
    if (newPassword !== confirmPassword) errors.confirmPassword = 'The two passwords do not match.';
    setPasswordErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSavingPassword(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      toast.success(res.message ?? 'Password updated.', 'Use the new password the next time you sign in.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error('Could not change your password', messageOf(err));
    } finally {
      setSavingPassword(false);
    }
  };

  const savePersonalPreferences = async () => {
    setSavingPrefs(true);
    try {
      const res = await api.put<{ message: string }>('/settings/profile/me', {
        notificationPreferences: {
          emailEnabled,
          inAppEnabled,
          categories: prefCategories,
        },
      });
      toast.success(res.message ?? 'Preferences saved.', 'Your personal notification preferences were updated.');
    } catch (err) {
      toast.error('Could not save your preferences', messageOf(err));
    } finally {
      setSavingPrefs(false);
    }
  };

  const saveSetting = async (key: string, value: unknown, label_: string) => {
    setSavingKey(key);
    try {
      const res = await api.put<{ message: string }>(`/settings/${key}`, { value });
      toast.success(res.message ?? 'Setting saved.', label_);
      reloadSettings();
    } catch (err) {
      toast.error('Could not save the setting', messageOf(err));
    } finally {
      setSavingKey(null);
    }
  };

  const saveWorkflow = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(workflowJson);
    } catch {
      setWorkflowError('The workflow configuration must be valid JSON.');
      return;
    }
    setWorkflowError(null);
    await saveSetting('workflow_configuration', parsed, 'Workflow transitions were updated.');
  };

  const openDepartmentModal = (row?: DepartmentRow) => {
    setDepartmentFormError(null);
    if (row) {
      setDepartmentEditingId(row.id);
      setDepartmentForm({
        code: row.code,
        name: row.name,
        description: row.description ?? '',
        hodUserId: row.hod_user_id ? String(row.hod_user_id) : '',
      });
    } else {
      setDepartmentEditingId(null);
      setDepartmentForm(EMPTY_DEPARTMENT);
    }
    setDepartmentModalOpen(true);
  };

  const submitDepartment = async () => {
    if (departmentForm.code.trim().length < 2 || departmentForm.code.trim().length > 10) {
      setDepartmentFormError('Code must be between 2 and 10 characters.');
      return;
    }
    if (departmentForm.name.trim().length < 3) {
      setDepartmentFormError('Department name must be at least 3 characters.');
      return;
    }
    setSavingDepartment(true);
    setDepartmentFormError(null);
    try {
      if (departmentEditingId === null) {
        const res = await api.post<{ id: number; message: string }>('/departments', {
          code: departmentForm.code.trim().toUpperCase(),
          name: departmentForm.name.trim(),
          description: departmentForm.description.trim() || undefined,
        });
        toast.success(res.message ?? 'Department created.', departmentForm.name.trim());
      } else {
        const res = await api.put<{ message: string }>(`/departments/${departmentEditingId}`, {
          name: departmentForm.name.trim(),
          description: departmentForm.description.trim() || undefined,
          hodUserId: departmentForm.hodUserId ? Number(departmentForm.hodUserId) : null,
        });
        toast.success(res.message ?? 'Department updated.', departmentForm.name.trim());
      }
      setDepartmentModalOpen(false);
      reloadDepartments();
    } catch (err) {
      const message = messageOf(err);
      setDepartmentFormError(message);
      toast.error('Could not save the department', message);
    } finally {
      setSavingDepartment(false);
    }
  };

  const deleteDepartment = async () => {
    if (!departmentDeleteTarget) return;
    setDeletingDepartment(true);
    try {
      const res = await api.delete<{ message: string }>(`/departments/${departmentDeleteTarget.id}`);
      toast.success(res.message ?? 'Department deleted.', departmentDeleteTarget.name);
      setDepartmentDeleteTarget(null);
      reloadDepartments();
    } catch (err) {
      toast.error('Could not delete the department', messageOf(err));
      setDepartmentDeleteTarget(null);
    } finally {
      setDeletingDepartment(false);
    }
  };

  /* -------------------------------------------------------------- render */

  if (settingsLoading && !settingsResponse) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" description="Personal preferences, departments and system configuration." />
        <Card>
          <Spinner label="Loading settings…" />
        </Card>
      </div>
    );
  }

  if (settingsError && !settingsResponse) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" description="Personal preferences, departments and system configuration." />
        <Card>
          <ErrorState message={settingsError} onRetry={reloadSettings} />
        </Card>
      </div>
    );
  }

  const departments = departmentsResponse?.departments ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your own profile and notification preferences, the department directory, and the institution-wide configuration used by every module."
        meta={
          <p className="text-xs text-ink-500">
            Signed in as{' '}
            <span className="font-semibold text-ink-700">{sessionUser?.fullName}</span> ·{' '}
            {sessionUser?.roleLabel} · {sessionUser?.departmentName ?? 'No department'}
          </p>
        }
      />

      {settingsResponse?.notice ? (
        <NoticeBanner tone="info" title="Configuration notice">
          <p>{settingsResponse.notice}</p>
        </NoticeBanner>
      ) : null}

      <Card>
        <Tabs tabs={tabs} active={tab} onChange={setTab} className="px-2" />

        {/* ------------------------------------------------------- profile */}
        <TabPanel active={tab} activeKey="profile">
          <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-2">
            <Card className="shadow-none">
              <CardHeader title="Your profile" description="How your name and contact details appear on the portal." />
              <CardBody className="space-y-4">
                <Input
                  label="Full name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Dr. Aisha Rahman"
                />
                <Input
                  label="Designation"
                  hint="Leave blank to keep the value already stored on your account."
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="Associate Professor"
                />
                <Input
                  label="Phone"
                  hint="Leave blank to keep the value already stored on your account."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 40 1234 5678"
                />
                <Button variant="primary" loading={savingProfile} icon={<Save className="h-4 w-4" />} onClick={saveProfile}>
                  Save profile
                </Button>
              </CardBody>
            </Card>

            <div className="space-y-4">
              <Card className="shadow-none">
                <CardHeader title="Account details" description="Read-only — maintained by your administrator." />
                <CardBody>
                  <DetailGrid columns={2}>
                    <DetailItem label="Email">{sessionUser?.email ?? '—'}</DetailItem>
                    <DetailItem label="Role">{sessionUser?.roleLabel ?? '—'}</DetailItem>
                    <DetailItem label="Department">{sessionUser?.departmentName ?? '—'}</DetailItem>
                    <DetailItem label="Permissions granted">{sessionUser?.permissions.length ?? 0}</DetailItem>
                  </DetailGrid>
                </CardBody>
              </Card>

              <Card className="shadow-none">
                <CardHeader title="Change password" description="You will stay signed in on this device." />
                <CardBody className="space-y-4">
                  <Input
                    label="Current password"
                    type="password"
                    required
                    value={currentPassword}
                    error={passwordErrors.currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <Input
                    label="New password"
                    type="password"
                    required
                    hint="At least 8 characters."
                    value={newPassword}
                    error={passwordErrors.newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <Input
                    label="Confirm new password"
                    type="password"
                    required
                    value={confirmPassword}
                    error={passwordErrors.confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <Button
                    variant="primary"
                    loading={savingPassword}
                    icon={<KeyRound className="h-4 w-4" />}
                    onClick={savePassword}
                  >
                    Update password
                  </Button>
                </CardBody>
              </Card>
            </div>
          </div>
        </TabPanel>

        {/* -------------------------------------------------- notifications */}
        <TabPanel active={tab} activeKey="notifications">
          <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-2">
            <Card className="shadow-none">
              <CardHeader
                title="Personal notification preferences"
                description="Choose how this portal should reach you. These settings belong to your account only."
              />
              <CardBody className="space-y-4">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-200 px-3.5 py-3">
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={(e) => setEmailEnabled(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink-800">Email notifications</span>
                    <span className="block text-xs text-ink-500">
                      Send a copy of each notification to your registered email address.
                    </span>
                  </span>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-200 px-3.5 py-3">
                  <input
                    type="checkbox"
                    checked={inAppEnabled}
                    onChange={(e) => setInAppEnabled(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink-800">In-app notifications</span>
                    <span className="block text-xs text-ink-500">
                      Show notifications in the bell menu and on the notifications page.
                    </span>
                  </span>
                </label>

                <div>
                  <p className="label-base">Categories you want to receive</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {CATEGORY_OPTIONS.map((cat) => {
                      const checked = prefCategories.includes(cat);
                      return (
                        <label
                          key={cat}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-700"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setPrefCategories((prev) =>
                                e.target.checked ? [...prev, cat] : prev.filter((c) => c !== cat),
                              )
                            }
                            className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                          />
                          {NOTIFICATION_CATEGORY_LABELS[cat]}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <Button
                  variant="primary"
                  loading={savingPrefs}
                  icon={<Save className="h-4 w-4" />}
                  onClick={savePersonalPreferences}
                >
                  Save preferences
                </Button>
              </CardBody>
            </Card>

            <Card className="shadow-none">
              <CardHeader
                title="Institution-wide notification defaults"
                description="Applied to accounts that have not set their own preferences."
              />
              <CardBody className="space-y-3 text-sm text-ink-700">
                {settings?.notification_preferences ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ink-600">Email notifications</span>
                      <Badge tone={settings.notification_preferences.emailEnabled ? 'success' : 'neutral'}>
                        {settings.notification_preferences.emailEnabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ink-600">In-app notifications</span>
                      <Badge tone={settings.notification_preferences.inAppEnabled ? 'success' : 'neutral'}>
                        {settings.notification_preferences.inAppEnabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                        Default categories
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(settings.notification_preferences.categories ?? []).map((cat) => (
                          <Badge key={cat} tone="info">
                            {NOTIFICATION_CATEGORY_LABELS[cat] ?? cat}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-ink-500">No defaults have been published.</p>
                )}
              </CardBody>
            </Card>
          </div>
        </TabPanel>

        {/* --------------------------------------------------- departments */}
        <TabPanel active={tab} activeKey="departments">
          <div className="p-4 sm:p-5">
            <Card>
              <CardHeader
                title="Department directory"
                description="Every department that owns research projects, users and heads of department."
                action={
                  canManageDepartments ? (
                    <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => openDepartmentModal()}>
                      Add department
                    </Button>
                  ) : null
                }
              />

              {!canManageDepartments ? (
                <div className="px-4 pt-4 sm:px-5">
                  <NoticeBanner tone="info" title="Read-only view">
                    <p>
                      Only administrators with the <em>departments.manage</em> permission can add, edit
                      or remove a department. You can view the current directory below.
                    </p>
                  </NoticeBanner>
                </div>
              ) : null}

              {departmentsError ? (
                <ErrorState message={departmentsError} onRetry={reloadDepartments} />
              ) : departmentsLoading ? (
                <TableSkeleton rows={5} cols={6} />
              ) : departments.length === 0 ? (
                <EmptyState
                  title="No departments"
                  description="No department has been created yet."
                  icon={<Building2 className="h-6 w-6" />}
                />
              ) : (
                <TableWrapper>
                  <table className="min-w-full divide-y divide-ink-200">
                    <thead className="table-head">
                      <tr>
                        <th className="px-4 py-2.5">Code</th>
                        <th className="px-4 py-2.5">Department</th>
                        <th className="px-4 py-2.5">Head of department</th>
                        <th className="px-4 py-2.5">Users</th>
                        <th className="px-4 py-2.5">Projects</th>
                        {canManageDepartments ? (
                          <th className="px-4 py-2.5 text-right">Actions</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {departments.map((d) => (
                        <tr key={d.id} className="transition hover:bg-ink-50">
                          <td className="table-cell font-medium text-ink-800">{d.code}</td>
                          <td className="table-cell whitespace-normal">
                            <span className="font-medium text-ink-900">{d.name}</span>
                            {d.description ? (
                              <p className="mt-0.5 text-xs text-ink-500">{d.description}</p>
                            ) : null}
                          </td>
                          <td className="table-cell">{d.hod_name ?? 'Unassigned'}</td>
                          <td className="table-cell">{d.user_count}</td>
                          <td className="table-cell">{d.project_count}</td>
                          {canManageDepartments ? (
                            <td className="table-cell text-right">
                              <span className="inline-flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openDepartmentModal(d)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  icon={<Trash2 className="h-3.5 w-3.5" />}
                                  onClick={() => setDepartmentDeleteTarget(d)}
                                  aria-label={`Delete ${d.name}`}
                                >
                                  Delete
                                </Button>
                              </span>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrapper>
              )}
            </Card>
          </div>
        </TabPanel>

        {/* -------------------------------------------------------- system */}
        <TabPanel active={tab} activeKey="system">
          <div className="space-y-4 p-4 sm:p-5">
            {settings?.system_preferences?.demoMode ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <Badge tone="warning" dot>
                  Demo mode
                </Badge>
                <p className="text-sm text-amber-900">
                  <span className="font-semibold">This deployment runs in demo mode.</span> Every record
                  is fictional sample data and no action taken here reaches a production system.
                </p>
              </div>
            ) : null}

            <NoticeBanner tone="info" title="About these settings">
              <p>
                {settingsResponse?.notice ??
                  'Secrets, API keys and infrastructure credentials are never exposed through this endpoint.'}
              </p>
            </NoticeBanner>

            <div className="grid gap-4 xl:grid-cols-2">
              {/* reminder days */}
              <Card className="shadow-none">
                <CardHeader
                  title="Deadline reminder days"
                  description="How many days before a deadline the reminders are raised."
                />
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {deadlineDays.length === 0 ? (
                      <p className="text-sm text-ink-500">No reminder thresholds configured.</p>
                    ) : (
                      deadlineDays.map((d) => (
                        <span
                          key={d}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200"
                        >
                          {d} day{d === 1 ? '' : 's'}
                          <button
                            type="button"
                            onClick={() => setDeadlineDays((prev) => prev.filter((x) => x !== d))}
                            aria-label={`Remove ${d} day reminder`}
                            className="rounded p-0.5 text-brand-500 transition hover:bg-brand-100 hover:text-brand-800"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <ReminderDayAdder
                    onAdd={(value) => setDeadlineDays((prev) => (prev.includes(value) ? prev : [...prev, value]))}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    loading={savingKey === 'deadline_reminder_days'}
                    icon={<Save className="h-4 w-4" />}
                    onClick={() =>
                      saveSetting('deadline_reminder_days', deadlineDays, 'Reminder days were updated.')
                    }
                  >
                    Save reminder days
                  </Button>
                </CardBody>
              </Card>

              {/* system preferences */}
              <Card className="shadow-none">
                <CardHeader title="System preferences" description="Naming and contact details used across the portal." />
                <CardBody className="space-y-4">
                  {systemPrefs ? (
                    <>
                      <Input
                        label="Institution name"
                        value={systemPrefs.institutionName}
                        onChange={(e) => setSystemPrefs((p) => (p ? { ...p, institutionName: e.target.value } : p))}
                      />
                      <Input
                        label="System name"
                        value={systemPrefs.systemName}
                        onChange={(e) => setSystemPrefs((p) => (p ? { ...p, systemName: e.target.value } : p))}
                      />
                      <Input
                        label="Support email"
                        type="email"
                        value={systemPrefs.supportEmail}
                        onChange={(e) => setSystemPrefs((p) => (p ? { ...p, supportEmail: e.target.value } : p))}
                      />
                      <dl className="grid grid-cols-2 gap-3 border-t border-ink-200 pt-3 text-xs">
                        <div>
                          <dt className="font-semibold uppercase tracking-wide text-ink-500">File size limit</dt>
                          <dd className="mt-0.5 text-ink-800">{systemPrefs.fileSizeLimitMb} MB</dd>
                        </div>
                        <div>
                          <dt className="font-semibold uppercase tracking-wide text-ink-500">Session length</dt>
                          <dd className="mt-0.5 text-ink-800">{systemPrefs.sessionDays} day(s)</dd>
                        </div>
                      </dl>
                      <Button
                        variant="primary"
                        size="sm"
                        loading={savingKey === 'system_preferences'}
                        icon={<Save className="h-4 w-4" />}
                        onClick={() =>
                          saveSetting('system_preferences', systemPrefs, 'System preferences were updated.')
                        }
                      >
                        Save system preferences
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-ink-500">System preferences are not available.</p>
                  )}
                </CardBody>
              </Card>

              {/* project categories */}
              <Card className="shadow-none">
                <CardHeader title="Project categories" description="The categories available when a project is registered." />
                <CardBody className="space-y-3">
                  <ListEditor
                    values={projectCategories}
                    onChange={setProjectCategories}
                    placeholder="Add a project category"
                    emptyLabel="No categories configured."
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    loading={savingKey === 'project_categories'}
                    icon={<Save className="h-4 w-4" />}
                    onClick={() =>
                      saveSetting('project_categories', projectCategories, 'Project categories were updated.')
                    }
                  >
                    Save categories
                  </Button>
                </CardBody>
              </Card>

              {/* research domains */}
              <Card className="shadow-none">
                <CardHeader title="Research domains" description="The domains available when a project is registered." />
                <CardBody className="space-y-3">
                  <ListEditor
                    values={researchDomains}
                    onChange={setResearchDomains}
                    placeholder="Add a research domain"
                    emptyLabel="No domains configured."
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    loading={savingKey === 'research_domains'}
                    icon={<Save className="h-4 w-4" />}
                    onClick={() => saveSetting('research_domains', researchDomains, 'Research domains were updated.')}
                  >
                    Save domains
                  </Button>
                </CardBody>
              </Card>

              {/* notification preferences (system) */}
              <Card className="shadow-none">
                <CardHeader
                  title="Default notification preferences"
                  description="Applied to every account that has not chosen its own."
                />
                <CardBody className="space-y-4">
                  {systemNotificationPrefs ? (
                    <>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-ink-200 px-3.5 py-3">
                        <input
                          type="checkbox"
                          checked={systemNotificationPrefs.emailEnabled}
                          onChange={(e) =>
                            setSystemNotificationPrefs((p) =>
                              p ? { ...p, emailEnabled: e.target.checked } : p,
                            )
                          }
                          className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-sm text-ink-700">Email notifications enabled by default</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-ink-200 px-3.5 py-3">
                        <input
                          type="checkbox"
                          checked={systemNotificationPrefs.inAppEnabled}
                          onChange={(e) =>
                            setSystemNotificationPrefs((p) =>
                              p ? { ...p, inAppEnabled: e.target.checked } : p,
                            )
                          }
                          className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-sm text-ink-700">In-app notifications enabled by default</span>
                      </label>
                      <div>
                        <p className="label-base">Default categories</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {CATEGORY_OPTIONS.map((cat) => {
                            const checked = systemNotificationPrefs.categories.includes(cat);
                            return (
                              <label key={cat} className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    setSystemNotificationPrefs((p) =>
                                      p
                                        ? {
                                            ...p,
                                            categories: e.target.checked
                                              ? [...p.categories, cat]
                                              : p.categories.filter((c) => c !== cat),
                                          }
                                        : p,
                                    )
                                  }
                                  className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                                />
                                {NOTIFICATION_CATEGORY_LABELS[cat]}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        loading={savingKey === 'notification_preferences'}
                        icon={<Save className="h-4 w-4" />}
                        onClick={() =>
                          saveSetting(
                            'notification_preferences',
                            systemNotificationPrefs,
                            'Default notification preferences were updated.',
                          )
                        }
                      >
                        Save defaults
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-ink-500">No defaults are published.</p>
                  )}
                </CardBody>
              </Card>

              {/* workflow configuration */}
              <Card className="shadow-none xl:col-span-2">
                <CardHeader
                  title="Workflow configuration"
                  description="Allowed status transitions for projects and IPR records."
                />
                <CardBody className="space-y-4">
                  {settings?.workflow_configuration ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {(['project', 'ipr'] as const).map((flow) => (
                        <div key={flow} className="rounded-lg border border-ink-200">
                          <p className="border-b border-ink-200 bg-ink-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-600">
                            {flow === 'project' ? 'Research project' : 'IPR record'} transitions
                          </p>
                          <TableWrapper>
                            <table className="min-w-full divide-y divide-ink-200">
                              <thead className="table-head">
                                <tr>
                                  <th className="px-3 py-2">From</th>
                                  <th className="px-3 py-2">To</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-ink-100">
                                {Object.entries(settings.workflow_configuration[flow] ?? {}).map(
                                  ([from, targets]) => (
                                    <tr key={from}>
                                      <td className="px-3 py-2 text-sm font-medium text-ink-800">{label(from)}</td>
                                      <td className="px-3 py-2 text-sm text-ink-600">
                                        <span className="flex flex-wrap gap-1">
                                          {targets.map((t) => (
                                            <Badge key={t} tone="neutral">
                                              {label(t)}
                                            </Badge>
                                          ))}
                                        </span>
                                      </td>
                                    </tr>
                                  ),
                                )}
                              </tbody>
                            </table>
                          </TableWrapper>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-ink-500">No workflow configuration has been published.</p>
                  )}

                  <div>
                    <Field
                      label="Workflow configuration (JSON)"
                      error={workflowError}
                      hint="Saved as a whole value. The matrix above is regenerated from the JSON you save."
                    >
                      <Textarea
                        value={workflowJson}
                        onChange={(e) => setWorkflowJson(e.target.value)}
                        rows={12}
                        className="font-mono text-xs"
                        spellCheck={false}
                      />
                    </Field>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        loading={savingKey === 'workflow_configuration'}
                        icon={<Save className="h-4 w-4" />}
                        onClick={saveWorkflow}
                      >
                        Save workflow configuration
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<RotateCcw className="h-3.5 w-3.5" />}
                        onClick={() => {
                          setWorkflowJson(JSON.stringify(settings?.workflow_configuration ?? {}, null, 2));
                          setWorkflowError(null);
                        }}
                      >
                        Reset to published value
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
        </TabPanel>
      </Card>

      {/* ------------------------------------------------ department modal */}
      <Modal
        open={departmentModalOpen}
        onClose={() => setDepartmentModalOpen(false)}
        title={departmentEditingId === null ? 'Add department' : 'Edit department'}
        description={
          departmentEditingId === null
            ? 'Create a new department that can own projects, users and a head of department.'
            : 'Update the department name, description or head of department.'
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDepartmentModalOpen(false)} disabled={savingDepartment}>
              Cancel
            </Button>
            <Button variant="primary" loading={savingDepartment} onClick={submitDepartment}>
              {departmentEditingId === null ? 'Create department' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {departmentFormError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-medium text-rose-700">
              {departmentFormError}
            </div>
          ) : null}

          {departmentEditingId === null ? (
            <Input
              label="Code"
              required
              hint="2 to 10 characters, used in report exports."
              value={departmentForm.code}
              onChange={(e) => setDepartmentForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="CSE"
            />
          ) : (
            <Field label="Code" hint="The department code cannot be changed.">
              <Input value={departmentForm.code} readOnly disabled />
            </Field>
          )}

          <Input
            label="Name"
            required
            value={departmentForm.name}
            onChange={(e) => setDepartmentForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Computer Science & Engineering"
          />

          <Textarea
            label="Description"
            rows={3}
            value={departmentForm.description}
            onChange={(e) => setDepartmentForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Short description of the department"
          />

          {departmentEditingId !== null ? (
            staffList?.data?.length ? (
              <Select
                label="Head of department"
                value={departmentForm.hodUserId}
                onChange={(e) => setDepartmentForm((f) => ({ ...f, hodUserId: e.target.value }))}
                placeholder="Unassigned"
                options={staffList.data.map((s) => ({
                  value: String(s.id),
                  label: `${s.full_name}${s.department_name ? ` — ${s.department_name}` : ''}`,
                }))}
              />
            ) : (
              <Input
                label="Head of department (user id)"
                type="number"
                value={departmentForm.hodUserId}
                onChange={(e) => setDepartmentForm((f) => ({ ...f, hodUserId: e.target.value }))}
                placeholder="Leave blank for unassigned"
              />
            )
          ) : null}
        </div>
      </Modal>

      {/* ----------------------------------------------- department delete */}
      <ConfirmDialog
        open={departmentDeleteTarget !== null}
        title="Delete department"
        message={
          <>
            <p>
              Remove{' '}
              <span className="font-semibold text-ink-900">{departmentDeleteTarget?.name}</span> from
              the department directory?
            </p>
            <p className="mt-2 text-ink-600">
              A department that still owns research projects cannot be removed — the request will be
              rejected by the server.
            </p>
          </>
        }
        confirmLabel="Delete department"
        tone="danger"
        loading={deletingDepartment}
        onConfirm={deleteDepartment}
        onCancel={() => setDepartmentDeleteTarget(null)}
      />

      <p className="flex items-center gap-1.5 text-xs text-ink-400">
        <Check className="h-3.5 w-3.5" />
        Changes are written to the application settings table and recorded in the audit trail. All
        values shown are fictional demonstration data.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- helpers */

/** Adds a numeric reminder threshold (days before the deadline). */
function ReminderDayAdder({ onAdd }: { onAdd: (value: number) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        label="Add a threshold"
        type="number"
        min={0}
        max={365}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="14"
        wrapperClassName="w-32"
      />
      <Button
        variant="outline"
        icon={<Plus className="h-4 w-4" />}
        onClick={() => {
          const parsed = Number(value);
          if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 365) {
            onAdd(parsed);
            setValue('');
          }
        }}
      >
        Add
      </Button>
    </div>
  );
}

/** A simple list editor used for the project categories and research domains. */
function ListEditor({
  values,
  onChange,
  placeholder,
  emptyLabel,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  emptyLabel: string;
}) {
  const [value, setValue] = useState('');

  return (
    <div className="space-y-3">
      {values.length === 0 ? (
        <p className="text-sm text-ink-500">{emptyLabel}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700 ring-1 ring-inset ring-ink-200"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
                className="rounded p-0.5 text-ink-400 transition hover:bg-ink-200 hover:text-ink-700"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Input
          label="Add a value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          wrapperClassName="w-full sm:w-64"
        />
        <Button
          variant="outline"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => {
            const trimmed = value.trim();
            if (!trimmed || values.includes(trimmed)) return;
            onChange([...values, trimmed]);
            setValue('');
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
