import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  FileText,
  FlaskConical,
  FolderOpen,
  Lightbulb,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDebounced } from '../../lib/hooks';
import { initials, relativeTime } from '../../lib/format';
import { NOTIFICATION_CATEGORY_LABELS } from '../../lib/constants';
import { Button, Modal } from '../ui';
import { Dropdown, DropdownDivider, DropdownItem, DropdownLabel } from '../ui/Dropdown';

interface SearchGroup {
  key: string;
  label: string;
  link: string;
  items: Array<{ id: number; code?: string; title: string; status?: string; subtitle?: string }>;
}

interface NotificationRow {
  id: number;
  title: string;
  description: string | null;
  category: string;
  link: string | null;
  is_read: number;
  created_at: string;
}

const GROUP_ICONS: Record<string, typeof Search> = {
  projects: FlaskConical,
  ipr: ShieldCheck,
  startups: Lightbulb,
  approvals: FolderOpen,
  funding: Wallet,
  documents: FileText,
};

const SEGMENT_LABELS: Record<string, string> = {
  projects: 'Research Projects',
  ipr: 'IPR Management',
  approvals: 'Approvals',
  startups: 'Startup Incubation',
  mentors: 'Mentors',
  funding: 'Funding Opportunities',
  documents: 'Documents',
  analytics: 'Analytics & Reports',
  notifications: 'Notifications',
  users: 'User Management',
  settings: 'Settings',
  new: 'New',
};

function useBreadcrumb() {
  const { pathname } = useLocation();
  const parts = pathname.split('/').filter(Boolean);
  const crumbs: Array<{ label: string; to: string }> = [{ label: 'Dashboard', to: '/' }];
  let acc = '';
  parts.forEach((part, i) => {
    acc += `/${part}`;
    const isId = /^\d+$/.test(part);
    const label = SEGMENT_LABELS[part] ?? (isId ? `#${part}` : part.replace(/-/g, ' '));
    crumbs.push({ label: isId ? `#${part}` : label, to: acc });
    void i;
  });
  return crumbs;
}

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const crumbs = useBreadcrumb();

  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SearchGroup[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounced = useDebounced(term, 250);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  const [helpOpen, setHelpOpen] = useState(false);

  // ---- global search ------------------------------------------------------
  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    api
      .get<{ groups: SearchGroup[] }>('/search', { q })
      .then((res) => {
        if (!cancelled) setResults(res.groups ?? []);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        inputRef.current?.blur();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  // ---- notifications ------------------------------------------------------
  const loadNotifications = async () => {
    try {
      const res = await api.get<{ notifications: NotificationRow[]; unread: number }>(
        '/notifications/dropdown',
      );
      setNotifications(res.notifications ?? []);
      setUnread(res.unread ?? 0);
    } catch {
      /* silent — the bell simply keeps the previous count */
    }
  };

  useEffect(() => {
    void loadNotifications();
    const timer = window.setInterval(() => void loadNotifications(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      await loadNotifications();
    } catch {
      /* ignore */
    }
  };

  const markRead = async (id: number) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await api.post(`/notifications/${id}/read`);
    } catch {
      void loadNotifications();
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      {/* mobile nav trigger */}
      <button
        type="button"
        onClick={onOpenMobileNav}
        className="rounded-lg p-2 text-ink-600 transition hover:bg-ink-100 lg:hidden"
        aria-label="Open navigation"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {/* breadcrumb */}
      <nav aria-label="Breadcrumb" className="hidden min-w-0 md:block">
        <ol className="flex items-center gap-1 text-sm">
          {crumbs.map((c, i) => (
            <li key={c.to} className="flex items-center gap-1">
              {i > 0 ? <ChevronRight className="h-3.5 w-3.5 text-ink-300" /> : null}
              {i === crumbs.length - 1 ? (
                <span className="truncate font-semibold text-ink-900">{c.label}</span>
              ) : (
                <Link to={c.to} className="truncate text-ink-500 transition hover:text-ink-800">
                  {c.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex-1" />

      {/* global search */}
      <div ref={searchRef} className="relative w-full max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search projects, IPR, startups…"
            aria-label="Global search"
            className="h-9 w-full rounded-lg border border-ink-300 bg-ink-50 pl-9 pr-16 text-sm text-ink-900 placeholder:text-ink-400 transition focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {term ? (
            <button
              type="button"
              onClick={() => {
                setTerm('');
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:bg-ink-200 hover:text-ink-700"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-ink-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-ink-500 sm:block">
              Ctrl K
            </kbd>
          )}
        </div>

        {searchOpen && debounced.trim().length >= 2 ? (
          <div className="absolute right-0 z-30 mt-2 max-h-[70vh] w-full overflow-y-auto rounded-lg border border-ink-200 bg-white shadow-pop">
            {searching && results.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-500">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-500">
                No matches for “{debounced}”.
              </p>
            ) : (
              results.map((group) => {
                const Icon = GROUP_ICONS[group.key] ?? FileText;
                return (
                  <div key={group.key} className="border-b border-ink-200 py-2 last:border-b-0">
                    <div className="flex items-center gap-2 px-4 pb-1 pt-1">
                      <Icon className="h-3.5 w-3.5 text-ink-400" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                        {group.label}
                      </span>
                    </div>
                    {group.items.map((item) => (
                      <button
                        key={`${group.key}-${item.id}`}
                        type="button"
                        onClick={() => {
                          setSearchOpen(false);
                          setTerm('');
                          navigate(`${group.link}/${item.id}`);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-ink-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink-900">{item.title}</p>
                          <p className="truncate text-xs text-ink-500">
                            {item.code ? `${item.code} · ` : ''}
                            {item.subtitle}
                          </p>
                        </div>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-ink-300" />
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      {/* notifications */}
      <div ref={notifRef} className="relative">
        <button
          type="button"
          onClick={() => {
            setNotifOpen((v) => !v);
            void loadNotifications();
          }}
          className="relative rounded-lg p-2 text-ink-600 transition hover:bg-ink-100"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </button>

        {notifOpen ? (
          <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-pop sm:w-96">
            <div className="flex items-center justify-between border-b border-ink-200 px-4 py-2.5">
              <p className="text-sm font-semibold text-ink-900">Notifications</p>
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              ) : null}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-500">No notifications yet.</p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={clsx(
                      'border-b border-ink-100 px-4 py-3 last:border-b-0',
                      !n.is_read && 'bg-brand-50/50',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!n.is_read ? (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                      ) : (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-transparent" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink-900">{n.title}</p>
                        {n.description ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-ink-600">{n.description}</p>
                        ) : null}
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-400">
                          <span>
                            {NOTIFICATION_CATEGORY_LABELS[n.category] ?? n.category.replace(/_/g, ' ')}
                          </span>
                          <span>·</span>
                          <span>{relativeTime(n.created_at)}</span>
                          {n.link ? (
                            <button
                              type="button"
                              onClick={() => {
                                void markRead(n.id);
                                setNotifOpen(false);
                                navigate(n.link as string);
                              }}
                              className="ml-auto font-medium text-brand-600 hover:text-brand-700"
                            >
                              Open
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-ink-200 bg-ink-50/60 px-4 py-2">
              <Link
                to="/notifications"
                onClick={() => setNotifOpen(false)}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                View all notifications →
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      {/* help */}
      <button
        type="button"
        onClick={() => setHelpOpen(true)}
        className="rounded-lg p-2 text-ink-600 transition hover:bg-ink-100"
        aria-label="Help and demo information"
      >
        <CircleHelp className="h-5 w-5" />
      </button>

      {/* user menu */}
      <Dropdown
        align="right"
        trigger={
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
            {initials(user?.fullName)}
          </span>
        }
      >
        {(close) => (
          <>
            <DropdownLabel>{user?.roleLabel}</DropdownLabel>
            <div className="px-3.5 pb-2">
              <p className="text-sm font-semibold text-ink-900">{user?.fullName}</p>
              <p className="truncate text-xs text-ink-500">{user?.email}</p>
              {user?.departmentName ? (
                <p className="mt-0.5 text-xs text-ink-500">{user.departmentName}</p>
              ) : null}
            </div>
            <DropdownDivider />
            <DropdownItem
              icon={<User style={{ width: 16, height: 16 }} />}
              onClick={() => {
                close();
                navigate('/settings');
              }}
            >
              My profile
            </DropdownItem>
            <DropdownItem
              icon={<Settings style={{ width: 16, height: 16 }} />}
              onClick={() => {
                close();
                navigate('/settings');
              }}
            >
              Settings
            </DropdownItem>
            <DropdownDivider />
            <DropdownItem
              danger
              icon={<LogOut style={{ width: 16, height: 16 }} />}
              onClick={() => {
                close();
                void handleLogout();
              }}
            >
              Sign out
            </DropdownItem>
          </>
        )}
      </Dropdown>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </header>
  );
}

function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Help & demo information"
      description="This deployment runs in demo mode with seeded sample data."
      size="lg"
      footer={
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-5 text-sm text-ink-700">
        <section>
          <h3 className="text-sm font-semibold text-ink-900">Getting around</h3>
          <ul className="mt-2 space-y-1.5 text-ink-600">
            <li>
              Use the left sidebar to switch modules. It can be collapsed for more room, and slides
              in as a drawer on small screens.
            </li>
            <li>
              Press <kbd className="rounded border border-ink-300 bg-ink-50 px-1">Ctrl</kbd> +{' '}
              <kbd className="rounded border border-ink-300 bg-ink-50 px-1">K</kbd> to focus global
              search across projects, IPR records, startups, approvals, funding and documents.
            </li>
            <li>Every table row exposes contextual actions on the right-hand side.</li>
          </ul>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink-900">Your access</h3>
          <p className="mt-1 text-ink-600">
            You are signed in as <span className="font-medium text-ink-900">{user?.fullName}</span>{' '}
            ({user?.roleLabel}). The modules visible in the sidebar reflect your role. Permissions are
            enforced on the server as well, so hidden actions are also rejected by the API.
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink-900">Important notices</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-ink-600">
            <li>
              IPR statuses are administrative workflow states only — they are not a legal
              determination of patentability or filing eligibility.
            </li>
            <li>
              Funding figures separate <em>requested</em>, <em>approved</em> and <em>received</em>{' '}
              amounts. The catalogue is illustrative sample data; this platform never submits an
              application to an external funder.
            </li>
            <li>
              Similarity screening uses TF-IDF and cosine similarity as a human-review aid only. It
              is not a plagiarism or novelty verdict.
            </li>
            <li>All names, institutions and records in this system are fictional sample data.</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
