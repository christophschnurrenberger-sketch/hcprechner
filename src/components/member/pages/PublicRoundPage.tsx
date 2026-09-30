"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api/client";
import { formatDate, formatDecimal, formatHcp } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Alert, Card, CardBody, CardHeader, Segmented } from "@/components/ui";
import { ErrorState, PageSkeleton } from "@/components/ui/feedback";
import { MemberAvatar } from "@/components/community/MemberAvatar";
import { MemberName } from "@/components/community/CommunityViews";
import { Scorecard } from "@/components/stats/Scorecard";
import { RoundStatsSummary } from "@/components/stats/StatsUi";

type Tab = "summary" | "scorecard" | "stats";

/** Freigegebene Runde eines Mitglieds (Basis oder Details) – nur Daten, die die API freigibt. */
export function PublicRoundPage() {
  const params = useSearchParams();
  const member = params.get("member") ?? "";
  const round = params.get("round") ?? "";
  const [tab, setTab] = useState<Tab>("summary");
  const { data, error, reload } = useApi(() => api.community.round(member, round), `${member}|${round}`);

  const back = (
    <Link href="/member/community?tab=aktivitaet" className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Community
    </Link>
  );
  if (error && !data) {
    return (
      <div className="space-y-4">
        {back}
        <ErrorState error={error} onRetry={reload} title="Runde nicht verfügbar" />
      </div>
    );
  }
  if (!data) return <PageSkeleton variant="detail" />;
  const full = data.level === "FULL" && data.holeStats !== null;

  return (
    <div className="space-y-5">
      {back}
      <div className="flex items-center gap-3">
        <MemberAvatar member={data.member} size="lg" />
        <div className="min-w-0">
          <p className="text-sm text-ink-3">
            <MemberName member={data.member} /> · {formatDate(data.date)}
          </p>
          <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{data.courseName}</h1>
          <p className="text-sm text-ink-3">
            {[data.layoutName, `${data.holes} Loch${data.nine === "BACK" ? " (10–18)" : data.nine === "FRONT" ? " (1–9)" : ""}`, data.teeColor ? `Abschlag ${data.teeColor}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {data.isMine && <Alert tone="info">Das ist deine Runde – so sehen sie andere Mitglieder.</Alert>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Schläge", value: data.grossScore ?? "–" },
          { label: "GBE", value: data.adjustedGrossScore ?? "–" },
          { label: "Score Differential", value: formatDecimal(data.scoreDifferential) },
          { label: "HCPI danach", value: formatHcp(data.handicapIndexAfter) },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs text-ink-3">{k.label}</p>
            <p className="tabular text-2xl font-semibold text-ink">{k.value}</p>
          </div>
        ))}
      </div>

      {full ? (
        <>
          <Segmented
            name="Ansicht"
            value={tab}
            onChange={setTab}
            options={[
              { value: "summary", label: "Zusammenfassung" },
              { value: "scorecard", label: "Scorekarte" },
              { value: "stats", label: "Statistik" },
            ]}
          />
          {tab === "summary" && (
            <Card>
              <CardHeader title="Auf einen Blick" />
              <CardBody className="space-y-2 text-sm text-ink-2">
                {data.insights.length > 0 ? data.insights.map((t) => <p key={t}>{t}</p>) : <p>Keine Statistik zu dieser Runde.</p>}
                {data.par !== null && <p className="text-ink-3">Par {data.par}.</p>}
              </CardBody>
            </Card>
          )}
          {tab === "scorecard" && data.holeStats && <Scorecard holes={data.holeStats} showNotes={Boolean(data.notes) || data.holeStats.some((h) => h.note)} />}
          {tab === "stats" && data.stats && <RoundStatsSummary stats={data.stats} insights={[]} />}
        </>
      ) : (
        <p className="text-sm text-ink-3">{data.level === "BASIC" ? "Für diese Runde sind nur die Basisdaten freigegeben." : ""}</p>
      )}

      {data.notes && (
        <Card>
          <CardHeader title="Notiz" subtitle="vom Mitglied freigegeben" />
          <CardBody className="text-sm text-ink-2">{data.notes}</CardBody>
        </Card>
      )}
    </div>
  );
}
