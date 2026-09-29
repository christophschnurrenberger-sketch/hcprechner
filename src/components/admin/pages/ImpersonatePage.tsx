"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye } from "lucide-react";
import { api } from "@/lib/api/client";
import { formatDate, formatDecimal, formatHcp } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { ErrorState, PageSkeleton } from "@/components/ui/feedback";
import { HcpHero } from "@/components/member/HcpHero";
import { HcpHistoryChart } from "@/components/member/HcpHistoryChart";
import { AdminTable, EmptyRow, Td, Th } from "../AdminUi";
import { userHref } from "./UsersPages";

/**
 * Lesende Benutzeransicht für den Support: zeigt, was das Mitglied sieht – ohne dessen Sitzung zu übernehmen
 * und ohne Änderungsmöglichkeit. Jeder Aufruf wird im Audit-Log protokolliert (IMPERSONATION_VIEW).
 */
export function ImpersonatePage() {
  const id = useSearchParams().get("id") ?? "";
  const { data, error, reload } = useApi(() => api.admin.impersonate(id), `imp-${id}`);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton />;
  const { user, dashboard, rounds } = data;
  return (
    <div className="space-y-5">
      <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-warning bg-warning-soft px-4 py-3 text-sm">
        <span className="flex items-center gap-2 font-medium text-ink">
          <Eye className="h-4 w-4 text-warning" aria-hidden /> Benutzeransicht von {user.firstName} {user.lastName} – nur lesend, dieser Zugriff wird protokolliert.
        </span>
        <Link href={userHref(user.id)} className="font-semibold text-brand hover:underline">
          Ansicht beenden
        </Link>
      </div>
      <HcpHero hcp={dashboard.hcp} showCta={false} />
      <Card>
        <CardHeader title="Entwicklung" />
        <CardBody>
          <HcpHistoryChart history={dashboard.hcp.history} />
        </CardBody>
      </Card>
      {dashboard.drafts.length > 0 && <p className="text-sm text-ink-3">{dashboard.drafts.length} nicht abgeschlossene Runde(n) (Entwürfe).</p>}
      <AdminTable
        head={
          <tr>
            <Th>Datum</Th>
            <Th>Golfplatz</Th>
            <Th right>Löcher</Th>
            <Th right>GBE</Th>
            <Th right>Score Differential</Th>
            <Th right>HCPI danach</Th>
            <Th>Status</Th>
          </tr>
        }
        empty={rounds.length === 0 ? <EmptyRow text="Noch keine Runden." /> : undefined}
      >
        {rounds.map((r) => (
          <tr key={r.id}>
            <Td className="whitespace-nowrap">{formatDate(r.date)}</Td>
            <Td>{r.courseName}</Td>
            <Td right>{r.holes}</Td>
            <Td right>{r.adjustedGrossScore ?? "–"}</Td>
            <Td right>{formatDecimal(r.scoreDifferential)}</Td>
            <Td right>{formatHcp(r.handicapIndexAfter)}</Td>
            <Td>{r.counted ? <Badge tone="good">zählt</Badge> : <span className="text-xs text-ink-3">{r.note ?? "zählt nicht"}</span>}</Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
