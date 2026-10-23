import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { Badge } from './ui/Badge';
import type { BadgeTone } from './ui/Badge';
import { label, tone } from '../lib/constants';

/** Renders a workflow status using the shared label + colour vocabulary. */
export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  if (!status) return <span className="text-xs text-ink-400">—</span>;
  return (
    <Badge tone={tone(status) as BadgeTone} className={className}>
      {label(status)}
    </Badge>
  );
}

/** A labelled value used across all detail pages. */
export function DetailItem({
  label: labelText,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('min-w-0', className)}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{labelText}</dt>
      <dd className="mt-1 break-words text-sm text-ink-800">{children ?? '—'}</dd>
    </div>
  );
}

/** Two-column definition list used on detail pages. */
export function DetailGrid({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 | 3 | 4 }) {
  const cols = {
    1: 'sm:grid-cols-1',
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
  }[columns];
  return <dl className={clsx('grid gap-x-6 gap-y-4', cols)}>{children}</dl>;
}

/** Informational banner used for notices and policy statements. */
export function NoticeBanner({
  tone: bannerTone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger';
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    info: {
      box: 'border-brand-200 bg-brand-50 text-brand-900',
      icon: 'text-brand-600',
      Icon: Info,
    },
    warning: {
      box: 'border-amber-200 bg-amber-50 text-amber-900',
      icon: 'text-amber-600',
      Icon: AlertTriangle,
    },
    danger: {
      box: 'border-rose-200 bg-rose-50 text-rose-900',
      icon: 'text-rose-600',
      Icon: ShieldAlert,
    },
  }[bannerTone];
  const Icon = styles.Icon;

  return (
    <div className={clsx('flex items-start gap-2.5 rounded-lg border px-3.5 py-3', styles.box, className)}>
      <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', styles.icon)} />
      <div className="min-w-0 text-xs leading-relaxed">
        {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
        <div className="[&_p]:mt-1">{children}</div>
      </div>
    </div>
  );
}

/** Responsive filter strip above a table. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        'flex flex-col gap-3 border-b border-ink-200 bg-ink-50/50 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Compact label/value chip used in tables where space is tight. */
export function MetaChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Progress + label pair used in list views. */
export function InlineProgress({ value }: { value: number }) {
  return (
    <div className="flex w-32 items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
        <div
          className="h-full rounded-full bg-brand-500"
          style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs font-medium text-ink-600">{value || 0}%</span>
    </div>
  );
}
