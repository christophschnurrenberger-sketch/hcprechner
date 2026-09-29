"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api/client";
import type { AuditEntry } from "@/lib/api/types";
import { useApi } from "@/lib/useApi";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { ErrorState, PageSkeleton } from "@/components/ui/feedback";
import { useSession } from "@/components/session/SessionProvider";
import { AuditActionLabel, KpiCard, formatDateTime } from "../AdminUi";

function EntryList({ entries, empty }: { entries: AuditEntry[]; empty: string }) {
  if (entries.length === 0) return <p className="text-sm text-ink-3">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {entries.map((e) => (
        <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="block font-medium text-ink">
              <AuditActionLabel action={e.action} />
            </span>
            <span className="block truncate text-xs text-ink-3">
              {e.actorName ?? "System"}
              {e.userId && e.userId !== e.actorId ? (
                <>
                  {" → "}
                  <Link href={`/admin/users/view?id=${encodeURIComponent(e.userId)}`} className="text-brand hover:underline">
                    Benutzer
                  </Link>
                </>
              ) : null}
            </span>
          </span>
          <span className="shrink-0 text-xs text-ink-3">{formatDateTime(e.timestamp)}</span>
        </li>
      ))}
    </ul>
  );
}

export function AdminDashboardPage() {
  const { can } = useSession();
  const { data, error, reload } = useApi(() => api.admin.stats(), "stats");
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton variant="table" />;
  return (
    <div className="space-y-6">
      <PageHeader title="Admin-Dashboard" description="Überblick über Benutzer, Runden und Golfplatzdaten." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <KpiCard label="Benutzer" value={data.users} sub={`${data.activeUsers} aktiv (30 Tage)`} />
        <KpiCard label="Unbestätigte E-Mails" value={data.unverifiedUsers} tone={data.unverifiedUsers > 0 ? "warning" : undefined} />
        <KpiCard label="Admins & Support" value={data.admins} />
        <KpiCard label="Runden" value={data.rounds} />
        <KpiCard label="Golfanlagen" value={data.courses} sub={`${data.ratings} Ratings`} />
        <KpiCard label="Datenqualität" value={`${data.dataQualityPercent} %`} sub={`${data.verifiedRatings} Ratings geprüft`} tone={data.dataQualityPercent >= 80 ? "good" : data.dataQualityPercent >= 40 ? "warning" : "critical"} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Letzte Admin-Aktionen" action={can("logs.read") ? <Link href="/admin/logs?group=admin" className="text-sm text-brand hover:underline">Audit-Log</Link> : undefined} />
          <CardBody>
            <EntryList entries={data.recentActions} empty="Noch keine Admin-Aktionen." />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Letzte Aktivitäten der Mitglieder" action={can("logs.read") ? <Link href="/admin/logs?group=member" className="text-sm text-brand hover:underline">alle</Link> : undefined} />
          <CardBody>
            <EntryList entries={data.recentActivity} empty="Noch keine Aktivitäten." />
          </CardBody>
        </Card>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          can("users.read") && { href: "/admin/users", title: "Benutzer verwalten", text: "Suchen, Rollen, Status, Passwort" },
          can("courses.read") && { href: "/admin/ratings", title: "Ratings prüfen", text: `${data.ratings - data.verifiedRatings} noch ungeprüft` },
          can("system.read") && { href: "/admin/system", title: "Systemstatus", text: data.lastCourseUpdate ? `Golfplatzdaten zuletzt ${formatDateTime(data.lastCourseUpdate)}` : "Prüfungen und Protokolle" },
        ]
          .filter((x): x is { href: string; title: string; text: string } => Boolean(x))
          .map((x) => (
            <Link key={x.href} href={x.href} className="group flex items-center justify-between rounded-xl border border-border bg-surface p-4 hover:border-border-strong">
              <span>
                <span className="block text-sm font-semibold text-ink">{x.title}</span>
                <span className="block text-xs text-ink-3">{x.text}</span>
              </span>
              <ArrowRight className="h-4 w-4 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          ))}
      </div>
    </div>
  );
}
