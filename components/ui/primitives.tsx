'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useBodyScrollLock, useEscapeKey } from '@/hooks/useTheme';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap rounded-[var(--radius)] transition-colors disabled:opacity-45 disabled:pointer-events-none';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] shadow-[var(--shadow-sm)]',
  secondary:
    'bg-[var(--bg-raised)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--fill)]',
  ghost: 'text-[var(--text-secondary)] hover:bg-[var(--fill)] hover:text-[var(--text)]',
  danger: 'text-[var(--danger)] border border-[var(--border)] hover:bg-[var(--danger-subtle)]',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[13px]',
  md: 'h-9 px-3.5 text-sm',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}) => (
  <button
    type={type}
    className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
    {...props}
  />
);

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
}

export const IconButton: React.FC<IconButtonProps> = ({
  label,
  active,
  size = 'md',
  className,
  children,
  type = 'button',
  ...props
}) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    className={cx(
      'inline-flex items-center justify-center rounded-[var(--radius)] transition-colors shrink-0',
      size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
      active
        ? 'bg-[var(--fill-active)] text-[var(--text)]'
        : 'text-[var(--text-muted)] hover:bg-[var(--fill)] hover:text-[var(--text)]',
      'disabled:opacity-40 disabled:pointer-events-none',
      className
    )}
    {...props}
  >
    {children}
  </button>
);

/* ------------------------------------------------------------------ */
/* Toggle                                                              */
/* ------------------------------------------------------------------ */

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cx(
      'relative h-5 w-9 shrink-0 rounded-full transition-colors',
      checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]',
      disabled && 'opacity-40 pointer-events-none'
    )}
  >
    <span
      className={cx(
        'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform',
        checked ? 'translate-x-[18px]' : 'translate-x-0.5'
      )}
    />
  </button>
);

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Wider layout for content like settings with a side nav. */
  size?: 'sm' | 'md' | 'lg';
}

const MODAL_SIZES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
};

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEscapeKey(open, onClose);
  useBodyScrollLock(open);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-[var(--bg-overlay)] animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'relative w-full flex flex-col outline-none',
          'max-h-[92dvh] sm:max-h-[85dvh]',
          'rounded-t-[var(--radius-lg)] sm:rounded-[var(--radius-lg)]',
          'bg-[var(--bg-raised)] border border-[var(--border)] shadow-[var(--shadow-lg)]',
          'animate-slide-up',
          MODAL_SIZES[size]
        )}
      >
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[var(--border)] shrink-0">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text)]">{title}</h2>
            {description && (
              <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{description}</p>
            )}
          </div>
          <IconButton label="Close" onClick={onClose} size="sm">
            <X className="h-4 w-4" />
          </IconButton>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[var(--border)] shrink-0">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Small display helpers                                               */
/* ------------------------------------------------------------------ */

export const Badge: React.FC<{
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
}> = ({ children, tone = 'neutral' }) => {
  const tones = {
    neutral: 'bg-[var(--fill)] text-[var(--text-secondary)]',
    accent: 'bg-[var(--accent-subtle)] text-[var(--accent-text)]',
    success: 'bg-[var(--success-subtle)] text-[var(--success)]',
    warning: 'bg-[var(--warning-subtle)] text-[var(--warning)]',
    danger: 'bg-[var(--danger-subtle)] text-[var(--danger)]',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[11px] font-medium tabular',
        tones[tone]
      )}
    >
      {children}
    </span>
  );
};

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
    {icon && <div className="mb-3 text-[var(--text-muted)]">{icon}</div>}
    <p className="text-sm font-medium text-[var(--text)]">{title}</p>
    {description && (
      <p className="mt-1 max-w-[38ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
        {description}
      </p>
    )}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/** Section heading used inside settings and side panels. */
export const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
    {children}
  </h3>
);

/** A labelled row with a control on the right. */
export const SettingRow: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <div className="flex items-center justify-between gap-6 py-3">
    <div className="min-w-0">
      <p className="text-sm text-[var(--text)]">{title}</p>
      {description && (
        <p className="mt-0.5 text-[13px] leading-snug text-[var(--text-muted)]">{description}</p>
      )}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);
