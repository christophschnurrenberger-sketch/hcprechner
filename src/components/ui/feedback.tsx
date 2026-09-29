"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, RefreshCw, X, XCircle } from "lucide-react";
import { cn } from "@/lib/format";
import { userMessage } from "@/lib/api/errors";
import { Button, Dialog, Input } from "./index";

// ---------------------------------------------------------------------------
// Ladezustände
// ---------------------------------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-surface-3", className)} />;
}

export function Spinner({ className, label = "Wird geladen" }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-ink-3">
      <Loader2 className={cn("h-4 w-4 animate-spin", className)} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Platzhalter für Seiten: große Zahl, Karten, Liste. */
export function PageSkeleton({ variant = "dashboard" }: { variant?: "dashboard" | "list" | "detail" | "table" }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Daten werden geladen …</span>
      {variant === "dashboard" && (
        <>
          <Skeleton className="h-44 w-full rounded-2xl" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="hidden h-20 sm:block" />
          </div>
          <Skeleton className="h-40 w-full" />
        </>
      )}
      {variant === "list" && Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      {variant === "detail" && (
        <>
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-56 w-full" />
        </>
      )}
      {variant === "table" && (
        <>
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </>
      )}
    </div>
  );
}

/** Fehler mit verständlicher Meldung und „Erneut versuchen“. */
export function ErrorState({ error, onRetry, title = "Das hat nicht geklappt" }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-10 text-center">
      <AlertTriangle className="h-8 w-8 text-warning" aria-hidden />
      <p className="font-semibold text-ink">{title}</p>
      <p className="max-w-md text-sm text-ink-3">{userMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Erneut versuchen
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Große Kennzahl (Handicap Index)
// ---------------------------------------------------------------------------

export function BigNumber({ value, label, sub, size = "xl", tone = "brand" }: { value: ReactNode; label?: ReactNode; sub?: ReactNode; size?: "lg" | "xl"; tone?: "brand" | "ink" }) {
  return (
    <div>
      {label && <p className="text-sm font-medium text-ink-3">{label}</p>}
      <p className={cn("tabular font-semibold leading-none tracking-tight", size === "xl" ? "text-6xl sm:text-7xl" : "text-4xl sm:text-5xl", tone === "brand" ? "text-brand" : "text-ink")}>{value}</p>
      {sub && <div className="mt-2 text-sm text-ink-2">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}

const ToastContext = createContext<((text: string, tone?: ToastTone) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const remove = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (text: string, tone: ToastTone = "success") => {
      const id = ++counter.current;
      setItems((list) => [...list.slice(-3), { id, tone, text }]);
      setTimeout(() => remove(id), tone === "error" ? 7000 : 4000);
    },
    [remove],
  );
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {items.map((t) => {
          const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? XCircle : AlertTriangle;
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ink shadow-lg"
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.tone === "success" ? "text-good" : t.tone === "error" ? "text-critical" : "text-info")} aria-hidden />
              <span className="flex-1">{t.text}</span>
              <button type="button" onClick={() => remove(t.id)} aria-label="Hinweis schließen" className="rounded p-0.5 text-ink-3 hover:bg-surface-3">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx ?? (() => undefined);
}

// ---------------------------------------------------------------------------
// Bestätigung
// ---------------------------------------------------------------------------

interface ConfirmProps {
  open: boolean;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  /** Eingabe zur Bestätigung (z. B. „LÖSCHEN“) */
  requireText?: string;
  busy?: boolean;
  onConfirm: (typed: string) => void;
  onClose: () => void;
}

/** Bestätigungsdialog; die Eingabe beginnt bei jedem Öffnen leer. */
export function ConfirmDialog(props: ConfirmProps) {
  return <ConfirmInner key={props.open ? "open" : "closed"} {...props} />;
}

function ConfirmInner({ open, title, children, confirmLabel = "Bestätigen", tone = "danger", requireText, busy, onConfirm, onClose }: ConfirmProps) {
  const [typed, setTyped] = useState("");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} disabled={busy || (requireText !== undefined && typed !== requireText)} onClick={() => onConfirm(typed)}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {children}
        {requireText !== undefined && (
          <label className="block space-y-1.5">
            <span className="text-sm text-ink-2">
              Zur Bestätigung bitte <strong>{requireText}</strong> eingeben:
            </span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Passwortfeld mit Anzeigen/Verbergen
// ---------------------------------------------------------------------------

export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className={cn("pr-10", props.className)} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-3 hover:text-ink"
        aria-label={show ? "Passwort verbergen" : "Passwort anzeigen"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
