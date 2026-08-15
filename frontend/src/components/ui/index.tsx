import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { IconAlert, IconChevronLeft, IconChevronRight, IconSearch, IconX } from './Icons';
import { initials } from '@/lib/format';

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

// --- Badge ------------------------------------------------------------------

export function Badge({
  children,
  className,
  dot,
}: {
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span className={cx('badge', className || 'bg-slate-100 text-slate-700')}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

// --- Card -------------------------------------------------------------------

export function Card({
  children,
  className,
  title,
  subtitle,
  action,
  padded = true,
}: {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  padded?: boolean;
}) {
  return (
    <section className={cx('card', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-base font-bold text-slate-800">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

// --- Stat tile --------------------------------------------------------------

export function StatCard({
  label,
  value,
  icon,
  tone = 'primary',
  hint,
  onClick,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: 'primary' | 'amber' | 'red' | 'sky' | 'purple' | 'emerald' | 'slate';
  hint?: string;
  onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    primary: 'bg-primary-50 text-primary-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    sky: 'bg-sky-50 text-sky-700',
    purple: 'bg-purple-50 text-purple-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    slate: 'bg-slate-100 text-slate-700',
  };

  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={cx(
        'card card-hover flex items-center gap-4 p-4 text-right w-full',
        onClick && 'cursor-pointer',
      )}
    >
      {icon && (
        <span className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-xl', tones[tone])}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-slate-500">{label}</span>
        <span className="mt-0.5 block text-2xl font-extrabold text-slate-800 numeric">{value}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>}
      </span>
    </Wrapper>
  );
}

// --- Form controls ----------------------------------------------------------

interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
}

export function Field({
  label,
  error,
  hint,
  required,
  className,
  children,
}: FieldProps & { children: ReactNode }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

export function Input({
  label,
  error,
  hint,
  required,
  className,
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      <input {...props} className={cx('input', error && 'border-red-300 focus:border-red-400')} />
    </Field>
  );
}

export function Textarea({
  label,
  error,
  hint,
  required,
  className,
  ...props
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      <textarea
        rows={3}
        {...props}
        className={cx('input resize-y', error && 'border-red-300 focus:border-red-400')}
      />
    </Field>
  );
}

export function Select({
  label,
  error,
  hint,
  required,
  className,
  children,
  ...props
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      <select {...props} className={cx('input appearance-none pl-9 bg-left bg-no-repeat', error && 'border-red-300')}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundPosition: 'left 0.75rem center',
        }}
      >
        {children}
      </select>
    </Field>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'بحث...',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cx('relative', className)}>
      <IconSearch
        size={18}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input pr-10"
      />
    </div>
  );
}

// --- Button -----------------------------------------------------------------

export function Button({
  variant = 'primary',
  size,
  loading,
  icon,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
  size?: 'sm';
  loading?: boolean;
  icon?: ReactNode;
}) {
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
    success: 'btn-success',
    ghost: 'btn-ghost',
  };
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx(variants[variant], size === 'sm' && 'btn-sm', className)}
    >
      {loading ? <Spinner size={16} /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cx('animate-spin', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="جارٍ التحميل"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// --- Modal ------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4 animate-fade-in">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'relative z-10 w-full rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl animate-slide-up',
          sizes[size],
        )}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-bold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="إغلاق"
          >
            <IconX size={18} />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

// --- Confirm dialog ---------------------------------------------------------

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  variant?: 'danger' | 'primary' | 'success';
}

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);

  const confirm = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => setState({ ...options, resolve }));

  const close = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              إلغاء
            </Button>
            <Button variant={state?.variant ?? 'danger'} onClick={() => close(true)}>
              {state?.confirmLabel ?? 'تأكيد'}
            </Button>
          </>
        }
      >
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600">
            <IconAlert size={20} />
          </span>
          <p className="pt-2 text-sm leading-6 text-slate-600">{state?.message}</p>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);

// --- Empty / loading / error states -----------------------------------------

export function EmptyState({
  title,
  message,
  icon,
  action,
}: {
  title: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && (
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
          {icon}
        </span>
      )}
      <h3 className="text-sm font-bold text-slate-700">{title}</h3>
      {message && <p className="max-w-sm text-xs leading-6 text-slate-500">{message}</p>}
      {action}
    </div>
  );
}

export function LoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-1/3" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-500">
        <IconAlert size={22} />
      </span>
      <p className="text-sm font-semibold text-slate-700">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}

// --- Avatar -----------------------------------------------------------------

export function Avatar({
  name,
  src,
  size = 40,
  className,
  online,
}: {
  name?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
  online?: boolean;
}) {
  return (
    <span className={cx('relative inline-block shrink-0', className)} style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt={name ?? ''} className="h-full w-full rounded-full object-cover" />
      ) : (
        <span
          className="grid h-full w-full place-items-center rounded-full bg-primary-100 font-bold text-primary-700"
          style={{ fontSize: size * 0.36 }}
        >
          {initials(name)}
        </span>
      )}
      {online !== undefined && (
        <span
          className={cx(
            'absolute bottom-0 left-0 rounded-full ring-2 ring-white',
            online ? 'bg-emerald-500' : 'bg-slate-300',
          )}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </span>
  );
}

// --- Pagination -------------------------------------------------------------

export function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return (
      <div className="px-4 py-3 text-xs text-slate-500">
        إجمالي النتائج: <span className="numeric font-semibold">{total}</span>
      </div>
    );
  }

  // Windowed page numbers around the current page.
  const pages: (number | '…')[] = [];
  const push = (n: number | '…') => pages.push(n);
  const window = 1;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - window && i <= page + window)) push(i);
    else if (pages[pages.length - 1] !== '…') push('…');
  }

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
      <p className="text-xs text-slate-500">
        صفحة <span className="numeric font-semibold">{page}</span> من{' '}
        <span className="numeric font-semibold">{totalPages}</span> — إجمالي{' '}
        <span className="numeric font-semibold">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-40"
          aria-label="السابق"
        >
          <IconChevronRight size={16} />
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1.5 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={cx(
                'numeric min-w-[2rem] rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                p === page
                  ? 'bg-primary-700 text-white'
                  : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-40"
          aria-label="التالي"
        >
          <IconChevronLeft size={16} />
        </button>
      </div>
    </nav>
  );
}

// --- Page header ------------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  action,
  breadcrumb,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1 text-xs text-slate-400">{breadcrumb}</div>}
        <h1 className="text-xl font-extrabold text-slate-800 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </header>
  );
}

// --- Tabs -------------------------------------------------------------------

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string; badge?: number }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cx(
            'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition',
            active === tab.key
              ? 'bg-white text-primary-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className="numeric rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-bold text-primary-700">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// --- Progress bar -----------------------------------------------------------

export function ProgressBar({
  value,
  max = 100,
  tone = 'primary',
  showLabel,
}: {
  value: number;
  max?: number;
  tone?: 'primary' | 'emerald' | 'amber' | 'red';
  showLabel?: boolean;
}) {
  const pct = Math.min(100, Math.round((value / (max || 1)) * 100));
  const tones = {
    primary: 'bg-primary-600',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={cx('h-full rounded-full transition-all', tones[tone])} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="numeric text-xs font-bold text-slate-600">{pct}%</span>}
    </div>
  );
}
