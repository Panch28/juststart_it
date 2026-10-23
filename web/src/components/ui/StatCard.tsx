import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { TrendingDown, TrendingUp } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  trend?: { value: number; label?: string } | null;
  tone?: 'brand' | 'emerald' | 'amber' | 'violet' | 'rose' | 'ink';
  onClick?: () => void;
}

const TONES = {
  brand: 'bg-brand-50 text-brand-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  violet: 'bg-violet-50 text-violet-600',
  rose: 'bg-rose-50 text-rose-600',
  ink: 'bg-ink-100 text-ink-600',
};

export function StatCard({ title, value, icon, hint, trend, tone = 'brand', onClick }: StatCardProps) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={clsx(
        'card flex w-full flex-col gap-3 p-4 text-left transition',
        onClick && 'hover:border-brand-300 hover:shadow-pop',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-ink-500">{title}</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-ink-900">{value}</p>
        </div>
        {icon ? (
          <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONES[tone])}>
            {icon}
          </span>
        ) : null}
      </div>
      {(hint || trend) && (
        <div className="flex items-center gap-2 text-xs">
          {trend && trend.value !== 0 ? (
            <span
              className={clsx(
                'inline-flex items-center gap-0.5 font-semibold',
                trend.value > 0 ? 'text-emerald-600' : 'text-rose-600',
              )}
            >
              {trend.value > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {Math.abs(trend.value)}%
            </span>
          ) : null}
          {hint ? <span className="truncate text-ink-500">{hint}</span> : null}
        </div>
      )}
    </Wrapper>
  );
}
