import type { ReactNode } from 'react';
import { clsx } from 'clsx';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, meta, className }: PageHeaderProps) {
  return (
    <div className={clsx('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 lg:min-w-[320px]">
          <h1 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-500">{description}</p>
          ) : null}
          {meta ? <div className="mt-2">{meta}</div> : null}
        </div>
        {actions ? <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">{actions}</div> : null}
      </div>
    </div>
  );
}
