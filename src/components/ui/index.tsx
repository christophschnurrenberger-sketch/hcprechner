"use client";

import Link from "next/link";
import { Info, X, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/format";

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function Card({ className, children, id }: { className?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className={cn("rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(16,24,20,0.04)]", className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-4 py-4 sm:px-5", className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const variantClass: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover border border-transparent dark:text-[#0d1510]",
  secondary: "bg-surface text-ink border border-border-strong hover:bg-surface-2",
  ghost: "bg-transparent text-ink-2 border border-transparent hover:bg-surface-3",
  subtle: "bg-brand-soft text-brand border border-transparent hover:bg-brand-soft-2",
  danger: "bg-critical text-white border border-transparent hover:opacity-90",
};

const sizeClass: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Button({ variant = "primary", size = "md", className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    />
  );
});

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  prefetch,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  prefetch?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={cn("inline-flex items-center justify-center rounded-lg font-medium transition-colors", variantClass[variant], sizeClass[size], className)}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

type Tone = "neutral" | "brand" | "good" | "warning" | "critical" | "info" | "accent";

const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-3 text-ink-2",
  brand: "bg-brand-soft text-brand",
  good: "bg-good-soft text-good",
  warning: "bg-warning-soft text-warning",
  critical: "bg-critical-soft text-critical",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium", toneClass[tone], className)}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warning" | "error" | "success";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const styles = {
    info: "border-info/30 bg-info-soft text-ink",
    warning: "border-warning/30 bg-warning-soft text-ink",
    error: "border-critical/30 bg-critical-soft text-ink",
    success: "border-good/30 bg-good-soft text-ink",
  }[tone];
  const Icon = { info: Info, warning: AlertTriangle, error: XCircle, success: CheckCircle2 }[tone];
  const iconColor = { info: "text-info", warning: "text-warning", error: "text-critical", success: "text-good" }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border px-3 py-2.5 text-sm", styles, className)}>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconColor)} aria-hidden />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-ink-2">{children}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info-Tooltip (Klick/Tap, tastaturbedienbar)
// ---------------------------------------------------------------------------

export function InfoTip({ children, label = "Erklärung" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-3 hover:bg-surface-3 hover:text-ink"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-6 z-40 w-72 max-w-[80vw] -translate-x-1/2 rounded-lg border border-border bg-surface p-3 text-left text-[13px] font-normal leading-relaxed text-ink-2 shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Formularfelder
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
  info,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
  info?: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-sm font-medium text-ink">
        {label}
        {info && <InfoTip>{info}</InfoTip>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-3">{hint}</p>}
      {error && <p className="text-xs font-medium text-critical">{error}</p>}
    </div>
  );
}

const inputBase =
  "w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-brand-2 focus:outline-none focus:ring-2 focus:ring-brand-2/20 disabled:bg-surface-3";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(inputBase, "h-10", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(inputBase, "h-10 pr-8", className)} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(inputBase, "min-h-24 py-2", className)} {...props} />;
});

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label htmlFor={inputId} className={cn("flex cursor-pointer items-start gap-3 text-sm", disabled && "cursor-not-allowed opacity-60")}>
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-[var(--brand)]"
      />
      <span>
        <span className="font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-3">{description}</span>}
      </span>
    </label>
  );
}

/** Segmentierte Auswahl (Radiogruppe). */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  name,
  className,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; description?: ReactNode; disabled?: boolean }[];
  name: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={name} className={cn("inline-flex flex-wrap gap-1 rounded-lg bg-surface-3 p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md font-medium transition-colors disabled:opacity-40",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
              active ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Große Auswahlkarten (Wizard). */
export function ChoiceCards<T extends string | number>({
  value,
  onChange,
  options,
  columns = 3,
}: {
  value: T | null;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; description?: ReactNode; disabled?: boolean; icon?: ReactNode }[];
  columns?: 2 | 3 | 4;
}) {
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columns];
  return (
    <div role="radiogroup" className={cn("grid grid-cols-1 gap-2", cols)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45",
              active ? "border-brand-2 bg-brand-soft ring-1 ring-brand-2" : "border-border bg-surface hover:border-border-strong",
            )}
          >
            {o.icon && <span className="mt-0.5 text-brand">{o.icon}</span>}
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{o.label}</span>
              {o.description && <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">{o.description}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sonstiges
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  info,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  info?: ReactNode;
  tone?: "good" | "warning" | "critical";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-1 text-xs font-medium text-ink-3">
        {label}
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      <div
        className={cn(
          "tabular mt-1 text-xl font-semibold",
          tone === "good" ? "text-good" : tone === "warning" ? "text-warning" : tone === "critical" ? "text-critical" : "text-ink",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
      {icon && <div className="text-brand">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="max-w-md text-sm text-ink-3">{children}</div>}
      {action}
    </div>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Schließen" className="rounded p-1 text-ink-3 hover:bg-surface-3">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4 text-sm">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
    </dialog>
  );
}

export function KeyValue({ items, className }: { items: { label: ReactNode; value: ReactNode; info?: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm", className)}>
      {items.map((item, i) => (
        <div key={i} className="contents">
          <dt className="flex items-center gap-1 text-ink-3">
            {item.label}
            {item.info && <InfoTip>{item.info}</InfoTip>}
          </dt>
          <dd className="tabular text-right font-medium text-ink sm:text-left">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
