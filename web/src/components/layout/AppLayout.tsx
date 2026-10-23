import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { clsx } from 'clsx';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Remember the collapsed preference between visits.
  useEffect(() => {
    const stored = window.localStorage.getItem('rih_sidebar_collapsed');
    if (stored === '1') setCollapsed(true);
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem('rih_sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-ink-50">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div
        className={clsx(
          'flex min-h-screen flex-col transition-[padding] duration-200',
          collapsed ? 'lg:pl-[4.5rem]' : 'lg:pl-64',
        )}
      >
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>
        <footer className="border-t border-ink-200 bg-white px-4 py-4 text-center text-xs text-ink-400 sm:px-6">
          Research &amp; Innovation Hub — demo environment with fictional sample data. Demo
          authentication only; not production-secure.
        </footer>
      </div>
    </div>
  );
}
