import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { clsx } from 'clsx';

interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'left' | 'right';
  className?: string;
  panelClassName?: string;
}

export function Dropdown({
  trigger,
  children,
  align = 'right',
  className,
  panelClassName,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className={clsx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="block"
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="menu"
          className={clsx(
            'absolute z-40 mt-2 min-w-[13rem] animate-fade-in overflow-hidden rounded-lg border border-ink-200 bg-white shadow-pop',
            align === 'right' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  children,
  onClick,
  icon,
  danger,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:text-ink-300',
        danger ? 'text-rose-600 hover:bg-rose-50' : 'text-ink-700 hover:bg-ink-50',
      )}
    >
      {icon ? <span className="shrink-0 text-ink-400">{icon}</span> : null}
      {children}
    </button>
  );
}

export function DropdownDivider() {
  return <div className="my-1 h-px bg-ink-200" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
      {children}
    </div>
  );
}
