import { NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { clsx } from 'clsx';
import {
  BarChart3,
  Bell,
  ChevronLeft,
  FileText,
  FolderOpen,
  FlaskConical,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  X,
  Menu,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { initials } from '../../lib/format';
import { Dropdown, DropdownDivider, DropdownItem, DropdownLabel } from '../ui/Dropdown';

interface NavItem {
  key: string;
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '/', icon: LayoutDashboard, end: true },
  { key: 'projects', label: 'Research Projects', to: '/projects', icon: FlaskConical },
  { key: 'ipr', label: 'IPR Management', to: '/ipr', icon: ShieldCheck },
  { key: 'approvals', label: 'Approvals', to: '/approvals', icon: FolderOpen },
  { key: 'startups', label: 'Startup Incubation', to: '/startups', icon: Lightbulb },
  { key: 'mentors', label: 'Mentors', to: '/mentors', icon: Users },
  { key: 'funding', label: 'Funding Opportunities', to: '/funding', icon: Wallet },
  { key: 'documents', label: 'Documents', to: '/documents', icon: FileText },
  { key: 'analytics', label: 'Analytics & Reports', to: '/analytics', icon: BarChart3 },
  { key: 'notifications', label: 'Notifications', to: '/notifications', icon: Bell },
  { key: 'users', label: 'User Management', to: '/users', icon: Users },
  { key: 'settings', label: 'Settings', to: '/settings', icon: Settings },
];

export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { user, logout, canAccess } = useAuth();
  const location = useLocation();
  const visible = NAV_ITEMS.filter((i) => canAccess(i.key));

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const content = (
    <div className="flex h-full flex-col bg-white">
      {/* Brand */}
      <div className={clsx('flex h-16 shrink-0 items-center gap-2.5 border-b border-ink-200 px-4', collapsed && 'justify-center px-2')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <FlaskConical className="h-5 w-5" />
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-ink-900">Research &amp; Innovation</p>
            <p className="truncate text-[11px] leading-tight text-ink-500">Hub</p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onCloseMobile}
          className="ml-auto rounded-md p-1.5 text-ink-400 hover:bg-ink-100 lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {!collapsed ? (
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Workspace
          </p>
        ) : null}
        <ul className="space-y-0.5">
          {visible.map((item) => {
            const Icon = item.icon;
            const active = item.end
              ? location.pathname === item.to
              : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
            return (
              <li key={item.key}>
                <NavLink
                  to={item.to}
                  onClick={onCloseMobile}
                  title={collapsed ? item.label : undefined}
                  className={clsx(
                    'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                    active
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                    collapsed && 'justify-center px-2',
                  )}
                >
                  <Icon
                    className={clsx(
                      'h-4.5 w-4.5 shrink-0',
                      active ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-600',
                    )}
                    style={{ width: 18, height: 18 }}
                  />
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle (desktop) */}
      <div className="hidden shrink-0 border-t border-ink-200 p-3 lg:block">
        <button
          type="button"
          onClick={onToggleCollapse}
          className={clsx(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-500 transition hover:bg-ink-50 hover:text-ink-800',
            collapsed && 'justify-center px-2',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen style={{ width: 18, height: 18 }} />
          ) : (
            <>
              <PanelLeftClose style={{ width: 18, height: 18 }} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>

      {/* User profile */}
      <div className="shrink-0 border-t border-ink-200 p-3">
        <Dropdown
          align="right"
          className={collapsed ? 'w-full' : 'w-full'}
          panelClassName={clsx('bottom-0', collapsed ? 'left-0 right-auto' : '')}
          trigger={
            <div
              className={clsx(
                'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-ink-50',
                collapsed && 'justify-center px-0',
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                {initials(user?.fullName)}
              </span>
              {!collapsed ? (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ink-900">{user?.fullName}</p>
                  <p className="truncate text-[11px] text-ink-500">{user?.roleLabel}</p>
                </div>
              ) : null}
            </div>
          }
        >
          {(close) => (
            <>
              <DropdownLabel>{user?.fullName}</DropdownLabel>
              <div className="px-3.5 pb-2 text-xs text-ink-500">
                <p>{user?.email}</p>
                <p className="mt-0.5">{user?.designation ?? user?.roleLabel}</p>
                {user?.departmentName ? <p className="mt-0.5">{user.departmentName}</p> : null}
              </div>
              <DropdownDivider />
              <DropdownItem
                icon={<Settings style={{ width: 16, height: 16 }} />}
                onClick={() => {
                  close();
                  window.location.href = '/settings';
                }}
              >
                Profile &amp; Settings
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
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 hidden border-r border-ink-200 transition-[width] duration-200 lg:block',
          collapsed ? 'w-[4.5rem]' : 'w-64',
        )}
      >
        {content}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/40" onClick={onCloseMobile} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 animate-slide-in border-r border-ink-200 shadow-pop">
            {content}
          </aside>
        </div>
      ) : null}
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg p-2 text-ink-600 transition hover:bg-ink-100 lg:hidden"
      aria-label="Open navigation"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

export { ChevronLeft };
