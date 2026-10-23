import { clsx } from 'clsx';

export function ProgressBar({
  value,
  className,
  tone = 'brand',
  showLabel,
}: {
  value: number;
  className?: string;
  tone?: 'brand' | 'emerald' | 'amber' | 'rose';
  showLabel?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value || 0)));
  const tones = {
    brand: 'bg-brand-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
  };
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-ink-150 bg-ink-100"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={clsx('h-full rounded-full transition-all', tones[tone])} style={{ width: `${pct}%` }} />
      </div>
      {showLabel ? <span className="w-9 shrink-0 text-right text-xs font-medium text-ink-600">{pct}%</span> : null}
    </div>
  );
}
