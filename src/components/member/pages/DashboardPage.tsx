"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ClipboardList, Flag, Gauge, MapPinned } from "lucide-react";
import { api } from "@/lib/api/client";
import { useApi } from "@/lib/useApi";
import { formatDate, formatDecimal, formatHcp } from "@/lib/format";
import { Alert, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import { ErrorState, PageSkeleton, useToast } from "@/components/ui/feedback";
import { HcpHero } from "@/components/member/HcpHero";
import { HcpHistoryChart } from "@/components/member/HcpHistoryChart";
import { DraftList, roundHref } from "@/components/member/RoundList";

export function DashboardPage() {
  const params = useSearchParams();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi(() => api.member.dashboard(), "dashboard");

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <PageSkeleton />;
  if (!data) return null;
  const { hcp, drafts } = data;
  const last = hcp.lastRound;

  return (
    <div className="space-y-5">
      {params.get("denied") === "admin" && <Alert tone="warning">Für den Admin-Bereich fehlt dir die Berechtigung.</Alert>}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Hallo {data.user.firstName}!</h1>
        <p className="mt-0.5 text-sm text-ink-3">{data.roundsCount === 0 ? "Schön, dass du da bist. Erfasse deine erste Runde." : `${data.roundsCount} ${data.roundsCount === 1 ? "Runde" : "Runden"} erfasst`}</p>
      </div>

      <HcpHero hcp={hcp} />

      <DraftList
        drafts={drafts}
        onDelete={async (id) => {
          try {
            await api.member.deleteDraft(id);
            setData({ ...data, drafts: data.drafts.filter((d) => d.id !== id) });
            toast("Entwurf verworfen.");
          } catch {
            toast("Entwurf konnte nicht gelöscht werden.", "error");
          }
        }}
      />

      {data.roundsCount === 0 ? (
        <EmptyState
          icon={<Flag className="h-8 w-8" />}
          title="Noch keine Runden"
          action={
            <Link href="/member/rounds/new" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 font-semibold text-white hover:bg-brand-hover dark:text-[#0d1510]">
              Erste Runde erfassen
            </Link>
          }
        >
          Dein Handicap Index basiert zunächst auf deinem Start-Handicap. Ab drei Ergebnissen berechnen wir ihn nach WHS.
        </EmptyState>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {last && (
            <Card>
              <CardHeader title="Letzte Runde" action={<Link href={roundHref(last.id)} className="text-sm font-medium text-brand hover:underline">Details</Link>} />
              <CardBody>
                <Link href={roundHref(last.id)} className="block">
                  <p className="font-semibold text-ink">{last.courseName}</p>
                  <p className="text-sm text-ink-3">
                    {formatDate(last.date)} · {last.holes} Loch
                  </p>
                  <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl bg-surface-2 py-2.5">
                      <dt className="text-xs text-ink-3">GBE</dt>
                      <dd className="tabular text-lg font-semibold">{last.adjustedGrossScore ?? "–"}</dd>
                    </div>
                    <div className="rounded-xl bg-surface-2 py-2.5">
                      <dt className="text-xs text-ink-3">Score Diff.</dt>
                      <dd className="tabular text-lg font-semibold">{formatDecimal(last.scoreDifferential)}</dd>
                    </div>
                    <div className="rounded-xl bg-surface-2 py-2.5">
                      <dt className="text-xs text-ink-3">HCPI danach</dt>
                      <dd className="tabular text-lg font-semibold">{formatHcp(last.handicapIndexAfter)}</dd>
                    </div>
                  </dl>
                </Link>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Entwicklung" action={<Link href="/member/hcp" className="text-sm font-medium text-brand hover:underline">Mehr</Link>} />
            <CardBody>
              <HcpHistoryChart history={hcp.history} height={170} />
            </CardBody>
          </Card>
        </div>
      )}

      <nav aria-label="Schnellzugriff" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { href: "/member/hcp", icon: Gauge, title: "Wie wird gerechnet?", text: hcp.calculationLabel },
          { href: "/member/rounds", icon: ClipboardList, title: "Meine Runden", text: "Alle Ergebnisse und was zählt" },
          { href: "/member/courses", icon: MapPinned, title: "Golfplätze", text: "Favoriten und Heimatplatz" },
        ].map(({ href, icon: Icon, title, text }) => (
          <Link key={href} href={href} className="group flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 hover:border-border-strong">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{title}</span>
              <span className="block truncate text-xs text-ink-3">{text}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        ))}
      </nav>
    </div>
  );
}
