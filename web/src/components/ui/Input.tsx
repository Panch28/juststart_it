import { forwardRef, useId } from 'react';
import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from 'react';
import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';

interface FieldProps {
  label?: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}

export function Field({ label, error, hint, required, children, className, htmlFor }: FieldProps) {
  return (
    <div className={clsx('w-full', className)}>
      {label ? (
        <label className="label-base" htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, required, className, wrapperClassName, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} error={error} hint={hint} required={required} className={wrapperClassName} htmlFor={inputId}>
      <input
        id={inputId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        className={clsx(
          'input-base',
          error && 'border-rose-400 focus:border-rose-500 focus:ring-rose-100',
          className,
        )}
        {...rest}
      />
    </Field>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  wrapperClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, required, className, wrapperClassName, id, rows = 4, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} error={error} hint={hint} required={required} className={wrapperClassName} htmlFor={inputId}>
      <textarea
        id={inputId}
        rows={rows}
        ref={ref}
        aria-invalid={error ? true : undefined}
        className={clsx(
          'input-base resize-y',
          error && 'border-rose-400 focus:border-rose-500 focus:ring-rose-100',
          className,
        )}
        {...rest}
      />
    </Field>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  options?: Array<{ value: string | number; label: string }>;
  placeholder?: string;
  wrapperClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, required, options, placeholder, className, wrapperClassName, id, children, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} error={error} hint={hint} required={required} className={wrapperClassName} htmlFor={inputId}>
      <div className="relative">
        <select
          id={inputId}
          ref={ref}
          aria-invalid={error ? true : undefined}
          className={clsx(
            'input-base appearance-none pr-9',
            error && 'border-rose-400 focus:border-rose-500 focus:ring-rose-100',
            className,
          )}
          {...rest}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          aria-hidden
        />
      </div>
    </Field>
  );
});
