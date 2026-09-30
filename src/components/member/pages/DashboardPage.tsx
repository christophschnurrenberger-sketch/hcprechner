"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, BarChart3, ClipboardList, Flag, Gauge, MapPinned, Trophy, UsersRound } from "lucide-react";
import { api } from "@/lib/api/client";
import { useApi } from "@/lib/useApi";
import { formatDate, formatDecimal, formatHcp } from "@/lib/format";
import { Alert, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import { ErrorState, PageSkeleton, useToast } from "@/components/ui/feedback";
import { HcpHero } from "@/components/member/HcpHero";
import { HcpHistoryChart } from "@/components/member/HcpHistoryChart";
import { DraftList, roundHref, roundStatsHref } from "@/components/member/RoundList";
import { useSession } from "@/components/session/SessionProvider";
import { ActiveRoundBanner } from "@/components/member/mobile/RoundSyncAgent";
import { useLocalActiveRound } from "@/components/member/mobile/hooks";
import { Trend } from "@/components/community/CommunityViews";
import { formatPercent } from "@/components/stats/StatsUi";
import type { DashboardData } from "@/lib/api/types";

function RankingCard({ ranking }: { ranking: NonNullable<DashboardData["ranking"]> }) {
  return (
    <Card>
      <CardHeader title="Ranking" action={<Link href="/member/community" className="text-sm font-medium text-brand hover:underline">Community</Link>} />
      <CardBody className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Trophy className="h-6 w-6" aria-hidden />
        </span>
        {ranking.participating && ranking.position !== null ? (
          <div>
            <p className="tabular text-2xl font-semibold text-ink">
              Platz {ranking.position} <span className="text-sm font-normal text-ink-3">von {ranking.total}</span>
            </p>
            <p className="flex items-center gap-2 text-sm text-ink-3">
              <Trend value={ranking.trend} /> {ranking.trendSince ? `seit ${formatDate(ranking.trendSince)}` : "im Community-Ranking"}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-ink">Du nimmst nicht am Ranking teil.</p>
            <p className="text-sm text-ink-3">{ranking.position !== null ? `Du wärst auf Platz ${ranking.position} – das siehst nur du.` : "Teilnahme nur mit deiner Zustimmung."}</p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function LastStatsCard({ last }: { last: NonNullable<DashboardData["lastStats"]> }) {
  const s = last.stats;
  return (
    <Card>
      <CardHeader title="Statistik der letzten Runde" subtitle={`${last.courseName} · ${formatDate(last.date)}`} action={<Link href="/member/stats" className="text-sm font-medium text-brand hover:underline">Alle Statistiken</Link>} />
      <CardBody>
        <Link href={`${roundHref(last.roundId)}&tab=stats`} className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: "Putts", value: s.totalPutts ?? "–" },
            { label: "GIR", value: formatPercent(s.girPercentage) },
            { label: "Fairways", value: formatPercent(s.firPercentage) },
          ].map((k) => (
            <div key={k.label} className="rounded-xl bg-surface-2 py-2.5">
              <p className="text-xs text-ink-3">{k.label}</p>
              <p className="tabular text-lg font-semibold text-ink">{k.value}</p>
            </div>
          ))}
        </Link>
      </CardBody>
    </Card>
  );
}

export function DashboardPage() {
  const params = useSearchParams();
  const toast = useToast();
  const { settings, user } = useSession();
  const activeRound = useLocalActiveRound(user?.id);
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

      {activeRound && <ActiveRoundBanner round={activeRound} />}

      <HcpHero hcp={hcp} />

      <DraftList
        drafts={activeRound ? drafts.filter((d) => d.id !== activeRound.draftId) : drafts}
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
          {data.lastStats ? (
            <LastStatsCard last={data.lastStats} />
          ) : (
            last && (
              <Card>
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">Noch keine Lochstatistik</p>
                    <p className="text-sm text-ink-3">Ergänze Putts, Grüns und Fairways deiner letzten Runde.</p>
                  </div>
                  <Link href={roundStatsHref(last.id)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-soft px-4 text-sm font-semibold text-brand hover:bg-brand-soft-2">
                    <BarChart3 className="h-4 w-4" aria-hidden /> Statistiken ergänzen
                  </Link>
                </CardBody>
              </Card>
            )
          )}
          {data.ranking && settings.community.rankingEnabled && <RankingCard ranking={data.ranking} />}
        </div>
      )}

      <nav aria-label="Schnellzugriff" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/member/hcp", icon: Gauge, title: "Wie wird gerechnet?", text: hcp.calculationLabel },
          { href: "/member/rounds", icon: ClipboardList, title: "Meine Runden", text: "Alle Ergebnisse und was zählt" },
          { href: "/member/stats", icon: BarChart3, title: "Statistik", text: "Putts, Grüns, Fairways" },
          settings.community.communityEnabled
            ? { href: "/member/community", icon: UsersRound, title: "Community", text: "Ranking und Mitglieder" }
            : { href: "/member/courses", icon: MapPinned, title: "Golfplätze", text: "Favoriten und Heimatplatz" },
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
