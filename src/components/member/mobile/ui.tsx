"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, Info, X } from "lucide-react";
import type { HoleStatus } from "@/lib/rounds/holeFlow";
import { cn } from "@/lib/format";

// ---------------------------------------------------------------------------
// Bottom Sheet (mobil statt Tooltip/Dialog)
// ---------------------------------------------------------------------------

export function BottomSheet({ open, onClose, title, children, footer, tall }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; tall?: boolean }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("keydown", esc);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <button type="button" aria-label="Schließen" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[88dvh] flex-col rounded-t-3xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none animate-[hcp-sheet-in_200ms_ease-out]",
          tall && "h-[88dvh]",
        )}
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 id={titleId} className="text-lg font-semibold text-ink">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Schließen" className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-3 hover:bg-surface-3">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 text-base">{children}</div>
        {footer && <div className="flex flex-col gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** ⓘ – öffnet eine kurze Erklärung als Bottom Sheet. */
export function InfoSheetButton({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Erklärung: ${title}`} className="-m-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-3 hover:text-ink">
        <Info className="h-4 w-4" />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={title} footer={<BigButton onClick={() => setOpen(false)}>OK</BigButton>}>
        <div className="text-ink-2">{children}</div>
      </BottomSheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export function BigButton({ children, onClick, disabled, variant = "primary", className, type = "button", ariaLabel }: { children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary" | "secondary" | "ghost" | "danger"; className?: string; type?: "button" | "submit"; ariaLabel?: string }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-brand text-white hover:bg-brand-hover dark:text-[#0d1510]",
        variant === "secondary" && "border border-border-strong bg-surface text-ink hover:bg-surface-2",
        variant === "ghost" && "text-ink-2 hover:bg-surface-3",
        variant === "danger" && "bg-critical text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Große Auswahl (Segmented Buttons) statt kleiner Checkboxen/Radios. Erneutes Tippen hebt die Auswahl auf. */
export function ChoiceRow<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
  info,
  hint,
  allowClear = true,
}: {
  label: ReactNode;
  value: T | null;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T | null) => void;
  info?: { title: string; text: ReactNode };
  hint?: ReactNode;
  allowClear?: boolean;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p id={id} className="text-base font-semibold text-ink">
          {label}
        </p>
        {info ? <InfoSheetButton title={info.title}>{info.text}</InfoSheetButton> : hint ? <span className="text-sm text-ink-3">{hint}</span> : null}
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active && allowClear ? null : o.value)}
              className={cn(
                "flex h-14 items-center justify-center gap-1.5 rounded-2xl border-2 text-base font-semibold transition-colors",
                active ? "border-brand bg-brand text-white dark:text-[#0d1510]" : "border-border bg-surface text-ink active:bg-surface-3",
              )}
            >
              {active && <Check className="h-4 w-4" aria-hidden />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Großer Stepper (− Wert +), z. B. für Strafschläge. */
export function Stepper({ label, value, onChange, min = 0, max = 10 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-base font-semibold text-ink">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`${label}: weniger`} className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-border text-2xl font-semibold text-ink disabled:opacity-35">
          −
        </button>
        <output aria-live="polite" aria-label={label} className="tabular w-10 text-center text-2xl font-semibold text-ink">
          {value}
        </output>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`${label}: mehr`} className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-border text-2xl font-semibold text-ink disabled:opacity-35">
          +
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lochnavigation (höchstens ~44 px hoch, horizontal scrollbar)
// ---------------------------------------------------------------------------

export function HoleStrip({
  holes,
  current,
  onSelect,
  onSummary,
  summaryActive,
}: {
  holes: { number: number; status: HoleStatus; label: string }[];
  current: number | null;
  onSelect: (index: number) => void;
  onSummary?: () => void;
  summaryActive?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = current !== null ? ref.current?.querySelector<HTMLElement>(`[data-hole="${current}"]`) : null;
    el?.scrollIntoView?.({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [current]);
  return (
    <div ref={ref} className="no-scrollbar flex h-11 items-center gap-1 overflow-x-auto px-2" role="navigation" aria-label="Löcher">
      {holes.map((h, i) => {
        const active = i === current;
        const state = h.status === "done" ? "erfasst" : h.status === "partial" ? "begonnen" : "offen";
        return (
          <button
            key={h.number}
            type="button"
            data-hole={i}
            onClick={() => onSelect(i)}
            aria-label={`Loch ${h.number}: ${h.label === "–" ? state : `${h.label} Schläge, ${state}`}`}
            aria-current={active ? "step" : undefined}
            className={cn(
              "relative flex h-9 min-w-9 shrink-0 flex-col items-center justify-center rounded-lg px-1 text-[13px] leading-none transition-colors",
              active ? "bg-brand text-white dark:text-[#0d1510]" : h.status === "empty" ? "text-ink-3" : "bg-surface-3 text-ink",
            )}
          >
            <span className="font-semibold">{h.number}</span>
            <span className={cn("mt-0.5 text-[11px]", active ? "opacity-90" : h.status === "done" ? "text-good" : h.status === "partial" ? "text-warning" : "")} aria-hidden>
              {h.status === "done" ? "✓" : h.status === "partial" ? "●" : "○"}
            </span>
          </button>
        );
      })}
      {onSummary && (
        <button type="button" onClick={onSummary} aria-label="Übersicht der Runde" aria-current={summaryActive ? "step" : undefined} className={cn("ml-1 flex h-9 shrink-0 items-center rounded-lg px-2.5 text-[13px] font-semibold", summaryActive ? "bg-brand text-white dark:text-[#0d1510]" : "bg-surface-3 text-ink")}>
          Σ
        </button>
      )}
    </div>
  );
}

/** Fixierter Bereich unten (Daumenzone), Safe Area beachtet. */
export function StickyFooter({ children }: { children: ReactNode }) {
  return <div className="shrink-0 border-t border-border bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">{children}</div>;
}
