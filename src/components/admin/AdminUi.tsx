"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ROLE_LABELS, STATUS_LABELS, type Role, type UserStatus } from "@/lib/auth/permissions";
import { auditLabel } from "@/lib/audit/actions";
import { cn } from "@/lib/format";
import { Badge } from "@/components/ui";

export function RoleBadge({ role }: { role: Role }) {
  const tone = role === "SUPER_ADMIN" ? "critical" : role === "ADMIN" ? "accent" : role === "SUPPORT" ? "info" : "neutral";
  return <Badge tone={tone}>{ROLE_LABELS[role]}</Badge>;
}

export function StatusBadge({ status }: { status: UserStatus }) {
  const tone = status === "ACTIVE" ? "good" : status === "LOCKED" ? "critical" : "warning";
  return <Badge tone={tone}>{STATUS_LABELS[status]}</Badge>;
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <p className="text-xs text-ink-3">{total} Einträge</p>;
  return (
    <nav aria-label="Seiten" className="flex items-center justify-between gap-3 text-sm">
      <span className="text-xs text-ink-3">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} von {total}
      </span>
      <span className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="rounded-lg p-1.5 hover:bg-surface-3 disabled:opacity-30" aria-label="Vorherige Seite">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="tabular px-2 text-xs text-ink-2">
          Seite {page} / {pages}
        </span>
        <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} className="rounded-lg p-1.5 hover:bg-surface-3 disabled:opacity-30" aria-label="Nächste Seite">
          <ChevronRight className="h-4 w-4" />
        </button>
      </span>
    </nav>
  );
}

/** Dichte Tabelle für den Admin-Bereich (horizontal scrollbar auf kleinen Bildschirmen). */
export function AdminTable({ head, children, empty, minWidth = "48rem", loading }: { head: ReactNode; children: ReactNode; empty?: ReactNode; minWidth?: string; loading?: boolean }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border bg-surface", loading && "opacity-60 transition-opacity")}>
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="bg-surface-2 text-left text-xs text-ink-3">{head}</thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return <th className={cn("whitespace-nowrap px-3 py-2 font-medium", right && "text-right")}>{children}</th>;
}

export function Td({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <td className={cn("px-3 py-2", right && "tabular text-right", className)}>{children}</td>;
}

export function EmptyRow({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-sm text-ink-3">{text}</p>;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AuditActionLabel({ action }: { action: string }) {
  return <span>{auditLabel(action)}</span>;
}

/** Alter/neuer Wert eines Audit-Eintrags kompakt anzeigen. */
export function AuditValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-ink-3">–</span>;
  if (typeof value !== "object") return <span>{String(value)}</span>;
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    <span className="block space-y-0.5">
      {entries.slice(0, 8).map(([k, v]) => (
        <span key={k} className="block truncate text-xs">
          <span className="text-ink-3">{k}:</span> {typeof v === "object" ? JSON.stringify(v) : String(v)}
        </span>
      ))}
      {entries.length > 8 && <span className="text-xs text-ink-3">… {entries.length - 8} weitere</span>}
    </span>
  );
}

export function KpiCard({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "good" | "warning" | "critical" }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <p className={cn("tabular mt-1 text-2xl font-semibold", tone === "good" ? "text-good" : tone === "warning" ? "text-warning" : tone === "critical" ? "text-critical" : "text-ink")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
    </div>
  );
}
