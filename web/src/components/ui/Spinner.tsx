import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={clsx('flex items-center justify-center gap-2 py-10 text-ink-500', className)} role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      {label ? <span className="text-sm">{label}</span> : null}
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function InlineSpinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-4 w-4 animate-spin', className)} aria-hidden />;
}
