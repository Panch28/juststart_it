import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { FileQuestion } from 'lucide-react';

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-col items-center gap-3 px-6 py-14 text-center', className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        {icon ?? <FileQuestion className="h-6 w-6" />}
      </div>
      <div className="max-w-md space-y-1">
        <p className="text-sm font-semibold text-ink-900">{title}</p>
        {description ? <p className="text-sm leading-relaxed text-ink-500">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
