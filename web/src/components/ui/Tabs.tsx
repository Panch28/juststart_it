import type { ReactNode } from 'react';
import { clsx } from 'clsx';

interface TabsProps {
  tabs: Array<{ key: string; label: string; count?: number; icon?: ReactNode }>;
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={clsx('overflow-x-auto border-b border-ink-200', className)}>
      <nav className="flex min-w-max gap-1 px-1" role="tablist">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(t.key)}
              className={clsx(
                'flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition',
                isActive
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-800',
              )}
            >
              {t.icon}
              {t.label}
              {t.count !== undefined ? (
                <span
                  className={clsx(
                    'rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                    isActive ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-600',
                  )}
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function TabPanel({ active, activeKey, children }: { active: string; activeKey: string; children: ReactNode }) {
  if (active !== activeKey) return null;
  return <div className="animate-fade-in">{children}</div>;
}
