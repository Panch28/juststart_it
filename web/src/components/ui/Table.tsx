import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { Select } from './Input';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  itemLabel?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'records',
}: PaginationProps) {
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const pages: number[] = [];
  const push = (n: number) => !pages.includes(n) && n >= 1 && n <= totalPages && pages.push(n);
  push(1);
  for (let n = page - 1; n <= page + 1; n += 1) push(n);
  push(totalPages);
  pages.sort((a, b) => a - b);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-ink-200 px-4 py-3 sm:flex-row">
      <p className="text-xs text-ink-500">
        Showing <span className="font-semibold text-ink-700">{start}</span>–
        <span className="font-semibold text-ink-700">{end}</span> of{' '}
        <span className="font-semibold text-ink-700">{total}</span> {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        {onPageSizeChange ? (
          <div className="hidden sm:block">
            <Select
              aria-label="Rows per page"
              value={String(pageSize)}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 py-0 text-xs"
              options={[10, 25, 50].map((n) => ({ value: n, label: `${n} / page` }))}
            />
          </div>
        ) : null}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {pages.map((p, i) => {
            const gap = i > 0 && p - pages[i - 1] > 1;
            return (
              <span key={p} className="flex items-center">
                {gap ? <span className="px-1 text-xs text-ink-400">…</span> : null}
                <button
                  type="button"
                  onClick={() => onPageChange(p)}
                  aria-current={p === page ? 'page' : undefined}
                  className={clsx(
                    'h-9 min-w-9 rounded-lg px-2 text-sm font-medium transition',
                    p === page
                      ? 'bg-brand-600 text-white'
                      : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                  )}
                >
                  {p}
                </button>
              </span>
            );
          })}
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((__, c) => (
            <div
              key={c}
              className="h-4 flex-1 animate-pulse rounded bg-ink-100"
              style={{ animationDelay: `${(r * cols + c) * 25}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm font-medium text-rose-600">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function TableWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-ink-200">{children}</table>
    </div>
  );
}
