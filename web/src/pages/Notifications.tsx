import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlarmClock,
  Bell,
  CalendarClock,
  CheckCheck,
  ClipboardCheck,
  ExternalLink,
  Flag,
  Inbox,
  Lightbulb,
  Mail,
  RefreshCw,
  Trash2,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { usePaged } from '../lib/hooks';
import { relativeTime } from '../lib/format';
import { NOTIFICATION_CATEGORY_LABELS } from '../lib/constants';
import { FilterBar } from '../components/common';
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
  Pagination,
  Select,
  StatCard,
  TableSkeleton,
  useToast,
} from '../components/ui';

interface NotificationRecord {
  id: number;
  user_id: number;
  category: string;
  title: string;
  description: string | null;
  link: string | null;
  is_read: 0 | 1;
  created_at: string;
}

const CATEGORY_ICONS: Record<string, ReactNode> = {
  DEADLINE: <CalendarClock className="h-4 w-4" />,
  OVERDUE: <AlarmClock className="h-4 w-4" />,
  NEW_APPROVAL: <ClipboardCheck className="h-4 w-4" />,
  APPROVAL_DECISION: <CheckCheck className="h-4 w-4" />,
  RETURNED_FOR_CORRECTION: <Flag className="h-4 w-4" />,
  PROJECT_MILESTONE: <CheckCheck className="h-4 w-4" />,
  STARTUP_MILESTONE: <Lightbulb className="h-4 w-4" />,
  FUNDING_DEADLINE: <Wallet className="h-4 w-4" />,
  SYSTEM: <Mail className="h-4 w-4" />,
};

function categoryLabel(category: string): string {
  return NOTIFICATION_CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ').toLowerCase();
}

export default function Notifications() {
  const navigate = useNavigate();
  const toast = useToast();

  const [category, setCategory] = useState('');
  const [readFilter, setReadFilter] = useState('');
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<NotificationRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const params = useMemo(
    () => ({
      category: category || undefined,
      read: readFilter || undefined,
    }),
    [category, readFilter],
  );

  const {
    data,
    loading,
    error,
    reload,
    page,
    pageSize,
    total,
    totalPages,
    setPage,
    setPageSize,
  } = usePaged<NotificationRecord>('/notifications', params, 12);

  const rows = data?.data ?? [];
  const unread = data?.unread ?? 0;
  const counts = data?.counts ?? [];
  const categories = data?.categories ?? [];
  const overdueCount = counts.find((c) => c.category === 'OVERDUE')?.count ?? 0;

  const countFor = (cat: string) => counts.find((c) => c.category === cat);
  const hasFilters = Boolean(category || readFilter);

  const clearFilters = () => {
    setCategory('');
    setReadFilter('');
  };

  const markAsRead = async (record: NotificationRecord) => {
    try {
      await api.post<{ message: string }>(`/notifications/${record.id}/read`);
      toast.success('Marked as read', record.title);
      reload();
    } catch (err) {
      toast.error('Could not mark as read', err instanceof Error ? err.message : undefined);
    }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      const res = await api.post<{ message: string; count: number }>('/notifications/read-all');
      toast.success(res.message ?? 'Notifications updated', `${res.count} notification(s) marked as read.`);
      reload();
    } catch (err) {
      toast.error('Could not mark all as read', err instanceof Error ? err.message : undefined);
    } finally {
      setMarkingAll(false);
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const res = await api.post<{ message: string; created: number }>('/notifications/generate', {});
      toast.success('Reminder scan complete', res.message);
      setRegenOpen(false);
      reload();
    } catch (err) {
      toast.error('Could not regenerate reminders', err instanceof Error ? err.message : undefined);
    } finally {
      setRegenerating(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.delete<{ message: string }>(`/notifications/${pendingDelete.id}`);
      toast.success('Notification removed', pendingDelete.title);
      setPendingDelete(null);
      reload();
    } catch (err) {
      toast.error('Could not remove notification', err instanceof Error ? err.message : undefined);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Every deadline reminder, approval assignment, milestone update and system message raised for your account."
        actions={
          <>
            <Button
              variant="outline"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => setRegenOpen(true)}
            >
              Regenerate deadline reminders
            </Button>
            <Button
              variant="primary"
              loading={markingAll}
              icon={<CheckCheck className="h-4 w-4" />}
              onClick={markAllRead}
              disabled={unread === 0}
            >
              Mark all read
            </Button>
          </>
        }
      />

      {/* ------------------------------------------------------- summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Unread"
          value={unread}
          icon={<Bell className="h-5 w-5" />}
          hint="Notifications still waiting for your attention"
          tone="brand"
        />
        <StatCard
          title="Total notifications"
          value={total}
          icon={<Inbox className="h-5 w-5" />}
          hint="Records matching the current filters"
          tone="ink"
        />
        <StatCard
          title="Categories covered"
          value={categories.length}
          icon={<Flag className="h-5 w-5" />}
          hint="Notification categories enabled for this deployment"
          tone="violet"
        />
        <StatCard
          title="Overdue tasks"
          value={overdueCount}
          icon={<AlarmClock className="h-5 w-5" />}
          hint="Notifications filed under the OVERDUE category"
          tone="rose"
        />
      </div>

      {/* --------------------------------------------------- category chips */}
      <Card>
        <CardHeader
          title="Filter by category"
          description="Counts are taken from every notification on your account."
        />
        <CardBody>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory('')}
              aria-pressed={category === ''}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                category === ''
                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                  : 'border-ink-300 bg-white text-ink-600 hover:bg-ink-50'
              }`}
            >
              All categories
              <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600">
                {counts.reduce((sum, c) => sum + (c.count ?? 0), 0)}
              </span>
            </button>

            {categories.map((cat) => {
              const info = countFor(cat);
              const active = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(active ? '' : cat)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'border-brand-300 bg-brand-50 text-brand-700'
                      : 'border-ink-300 bg-white text-ink-600 hover:bg-ink-50'
                  }`}
                >
                  {CATEGORY_ICONS[cat] ?? <Bell className="h-3.5 w-3.5" />}
                  {categoryLabel(cat)}
                  <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600">
                    {info?.count ?? 0}
                  </span>
                  {info && info.unread > 0 ? (
                    <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">
                      {info.unread} unread
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* ------------------------------------------------------- notification list */}
      <Card>
        <FilterBar>
          <Select
            aria-label="Filter by read state"
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value)}
            placeholder="Read and unread"
            options={[
              { value: 'false', label: 'Unread only' },
              { value: 'true', label: 'Read only' },
            ]}
            wrapperClassName="w-full sm:w-44"
          />

          <Select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="All categories"
            options={categories.map((c) => ({ value: c, label: categoryLabel(c) }))}
            wrapperClassName="w-full sm:w-56"
          />

          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </FilterBar>

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <TableSkeleton rows={6} cols={3} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No notifications"
            description={
              hasFilters
                ? 'No notification matches the filters you have applied. Try widening the search.'
                : 'Nothing has been raised for your account yet.'
            }
            icon={<Bell className="h-6 w-6" />}
          />
        ) : (
          <>
            <ul className="divide-y divide-ink-100">
              {rows.map((n) => {
                const unreadRow = n.is_read === 0;
                return (
                  <li
                    key={n.id}
                    className={`flex flex-col gap-3 px-4 py-3.5 transition sm:flex-row sm:items-start sm:gap-4 ${
                      unreadRow ? 'bg-brand-50/40' : 'bg-white hover:bg-ink-50'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        unreadRow ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-500'
                      }`}
                    >
                      {CATEGORY_ICONS[n.category] ?? <Bell className="h-4 w-4" />}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={`text-sm ${
                            unreadRow ? 'font-semibold text-ink-900' : 'font-medium text-ink-800'
                          }`}
                        >
                          {n.title}
                        </p>
                        {unreadRow ? <Badge tone="info" dot>Unread</Badge> : null}
                        <Badge tone="neutral">{categoryLabel(n.category)}</Badge>
                      </div>
                      {n.description ? (
                        <p className="mt-1 text-xs leading-relaxed text-ink-600">{n.description}</p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-ink-400">{relativeTime(n.created_at)}</p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {unreadRow ? (
                        <Button
                          variant="outline"
                          size="sm"
                          icon={<CheckCheck className="h-3.5 w-3.5" />}
                          onClick={() => markAsRead(n)}
                        >
                          Mark as read
                        </Button>
                      ) : null}
                      {n.link ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<ExternalLink className="h-3.5 w-3.5" />}
                          onClick={() => navigate(n.link as string)}
                        >
                          Open
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => setPendingDelete(n)}
                        aria-label={`Delete notification ${n.title}`}
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              itemLabel="notifications"
            />
          </>
        )}
      </Card>

      {/* -------------------------------------------------- regenerate reminders */}
      <Modal
        open={regenOpen}
        onClose={() => setRegenOpen(false)}
        title="Regenerate deadline reminders"
        description="This rebuilds every deadline-driven reminder from the current records in the database."
        footer={
          <>
            <Button variant="outline" onClick={() => setRegenOpen(false)} disabled={regenerating}>
              Cancel
            </Button>
            <Button variant="primary" loading={regenerating} onClick={regenerate}>
              Run reminder scan
            </Button>
          </>
        }
      >
        <ul className="space-y-2 text-sm leading-relaxed text-ink-700">
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            Reminders are recalculated from the live project, IPR, startup and funding deadlines —
            nothing is invented locally.
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            Only reminders that are not already on record for your account are created, so repeated
            scans do not duplicate your inbox.
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            Your other notifications, including approvals and milestones, are left untouched.
          </li>
        </ul>
      </Modal>

      {/* ------------------------------------------------------- delete confirm */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete notification"
        message={
          <>
            <p>
              This permanently removes{' '}
              <span className="font-semibold text-ink-900">{pendingDelete?.title}</span> from your
              inbox.
            </p>
            <p className="mt-2 text-ink-600">This action cannot be undone.</p>
          </>
        }
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
