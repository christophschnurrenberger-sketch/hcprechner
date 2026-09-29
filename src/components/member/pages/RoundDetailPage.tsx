"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import type { RoundDetail } from "@/lib/api/types";
import { CATEGORY_LABELS, EXCLUSION_TEXTS, HOLE_REASON_TEXTS, METHOD_LABELS, SOURCE_TYPE_LABELS, relevanceText } from "@/lib/whs/messages";
import { cn, formatDate, formatDecimal, formatHcp, formatPcc } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardHeader } from "@/components/ui";
import { ConfirmDialog, ErrorState, PageSkeleton, useToast } from "@/components/ui/feedback";
import { ChangeBadge } from "@/components/member/HcpHero";

/** Rechenweg einer Runde – nur Anzeige der vom Backend gelieferten Zwischenwerte. */
export function CalculationDetails({ detail }: { detail: RoundDetail | { round: RoundDetail["round"]; result: RoundDetail["result"]; recordLabelAtTime?: string } }) {
  const { round, result } = detail;
  const sd = result.scoreDifferential;
  const holes = result.gbe?.holes ?? [];
  return (
    <div className="space-y-5 text-sm">
      {sd && (
        <div className="space-y-2">
          <p className="font-medium text-ink">Score Differential ({METHOD_LABELS[sd.method]})</p>
          {sd.method === "NINE_EXPECTED" || sd.method === "PARTIAL_NINE_EXPECTED" ? (
            <div className="space-y-1 rounded-xl bg-surface-2 p-3 font-mono text-[13px] text-ink-2">
              <p>
                gespielt: (113 ÷ {sd.slopeRating}) × ({sd.adjustedGrossScore} − {formatDecimal(sd.courseRating)} − {formatPcc(sd.pccApplied)}) = {formatDecimal(sd.playedDifferential)}
              </p>
              <p>
                erwartet: (HCPI {formatHcp(sd.handicapIndexForExpected)} × 1,04 + 2,4) ÷ 2 = {formatDecimal(sd.expectedDifferential)}
              </p>
              <p className="font-semibold text-ink">
                gesamt: {formatDecimal(sd.playedDifferential)} + {formatDecimal(sd.expectedDifferential)} = {formatDecimal(sd.value)}
              </p>
            </div>
          ) : sd.method === "DIRECT" ? (
            <p className="rounded-xl bg-surface-2 p-3 text-ink-2">Übernommenes Score Differential: {formatDecimal(sd.value)}</p>
          ) : (
            <p className="rounded-xl bg-surface-2 p-3 font-mono text-[13px] text-ink-2">
              (113 ÷ {sd.slopeRating}) × ({sd.adjustedGrossScore} − {formatDecimal(sd.courseRating)} − {formatPcc(sd.pccApplied)}) = {formatDecimal(sd.unrounded, 2)} →{" "}
              <strong className="text-ink">{formatDecimal(sd.value)}</strong>
            </p>
          )}
        </div>
      )}
      {result.courseHandicap && (
        <p className="text-ink-2">
          Course Handicap: <strong className="tabular text-ink">{result.courseHandicap.rounded}</strong> (HCPI {formatHcp(result.courseHandicap.handicapIndex)}, Slope {result.courseHandicap.slopeRating}, CR {formatDecimal(result.courseHandicap.courseRating)}, Par {result.courseHandicap.par})
        </p>
      )}
      {holes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-xs">
            <caption className="mb-2 text-left text-sm font-medium text-ink">Scorekarte und Netto-Doppelbogey</caption>
            <thead className="text-left text-ink-3">
              <tr>
                <th className="py-1.5 pr-2 font-medium">Loch</th>
                <th className="py-1.5 pr-2 font-medium">Par</th>
                <th className="py-1.5 pr-2 font-medium">Hcp</th>
                <th className="py-1.5 pr-2 font-medium">Vorgabe</th>
                <th className="py-1.5 pr-2 font-medium">Schläge</th>
                <th className="py-1.5 pr-2 font-medium">NDB</th>
                <th className="py-1.5 pr-2 font-medium">gewertet</th>
                <th className="py-1.5 font-medium">Hinweis</th>
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-border">
              {holes.map((h) => (
                <tr key={h.number} className={h.reason !== "UNCHANGED" ? "bg-warning-soft/40" : undefined}>
                  <td className="py-1.5 pr-2 font-medium text-ink">{h.number}</td>
                  <td className="py-1.5 pr-2">{h.par}</td>
                  <td className="py-1.5 pr-2">{h.strokeIndex ?? "–"}</td>
                  <td className="py-1.5 pr-2">{h.strokesReceived}</td>
                  <td className="py-1.5 pr-2">{h.raw === "PICKUP" ? "X" : (h.raw ?? "–")}</td>
                  <td className="py-1.5 pr-2">{h.netDoubleBogey}</td>
                  <td className="py-1.5 pr-2 font-semibold text-ink">{h.adjusted ?? "–"}</td>
                  <td className="py-1.5 text-ink-3">{h.reason !== "UNCHANGED" ? HOLE_REASON_TEXTS[h.reason] : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.esr && result.esr.reduction !== 0 && (
        <Alert tone="info">
          Außergewöhnliches Ergebnis: {formatDecimal(result.esr.difference)} Schläge unter dem Handicap Index → Anpassung {result.esr.reduction}.
        </Alert>
      )}
      <div>
        <p className="font-medium text-ink">Handicaprelevanz</p>
        <ul className="mt-1.5 space-y-1">
          {result.relevance.checks.map((c) => (
            <li key={c.code} className="flex items-start gap-2 text-ink-2">
              <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", c.ok ? "bg-good" : "bg-critical")} aria-hidden />
              {relevanceText(c)}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-medium text-ink">Verwendetes Rating</p>
        <p className="mt-1 text-ink-2">
          Par {round.rating.par ?? "–"} · Course Rating {formatDecimal(round.rating.courseRating)} · Slope {round.rating.slopeRating ?? "–"}
          {round.rating.manual ? " · manuell von der Scorekarte" : round.rating.verified ? " · geprüft" : ""}
          {round.rating.sourceType && !round.rating.manual ? ` · Quelle: ${SOURCE_TYPE_LABELS[round.rating.sourceType] ?? round.rating.sourceType}` : ""}
        </p>
      </div>
      {"recordLabelAtTime" in detail && detail.recordLabelAtTime && <p className="text-ink-3">Scoring Record zum Zeitpunkt der Runde: {detail.recordLabelAtTime}.</p>}
    </div>
  );
}

export function RoundDetailPage() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data, error, reload } = useApi(() => api.member.round(id), id);

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton variant="detail" />;
  const { item, round, result } = data;
  const delta = item.handicapIndexAfter !== null ? Math.round((item.handicapIndexAfter - item.handicapIndexBefore) * 10) / 10 : null;

  return (
    <div className="space-y-5">
      <Link href="/member/rounds" className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Meine Runden
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{item.courseName}</h1>
          <p className="mt-1 text-sm text-ink-3">
            {formatDate(item.date)} · {item.holes} Loch{item.teeColor ? ` · Abschlag ${item.teeColor}` : ""} · {CATEGORY_LABELS[item.category]}
          </p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href={`/member/rounds/new?edit=${encodeURIComponent(item.id)}`} variant="secondary">
            <Pencil className="h-4 w-4" aria-hidden /> Bearbeiten
          </ButtonLink>
          <Button variant="ghost" onClick={() => setConfirm(true)} aria-label="Runde löschen">
            <Trash2 className="h-4 w-4 text-critical" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs text-ink-3">GBE</p>
          <p className="tabular text-2xl font-semibold">{item.adjustedGrossScore ?? "–"}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs text-ink-3">Score Differential</p>
          <p className={cn("tabular text-2xl font-semibold", item.counted && "text-brand")}>{formatDecimal(item.adjustedScoreDifferential ?? item.scoreDifferential)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs text-ink-3">HCPI vorher</p>
          <p className="tabular text-2xl font-semibold">{formatHcp(item.handicapIndexBefore)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs text-ink-3">HCPI danach</p>
          <p className="tabular flex items-center gap-2 text-2xl font-semibold">
            {formatHcp(item.handicapIndexAfter)} <ChangeBadge delta={delta} className="text-xs" />
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {item.counted ? <Badge tone="good">zählt aktuell</Badge> : item.relevant ? <Badge>handicaprelevant, zählt aktuell nicht</Badge> : <Badge>nicht handicaprelevant</Badge>}
        {!item.counted && result.currentExclusionReason && <span className="text-ink-3">{EXCLUSION_TEXTS[result.currentExclusionReason]}</span>}
        {item.esr !== 0 && <Badge tone="info">außergewöhnliches Ergebnis {item.esr}</Badge>}
      </div>

      <Card>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block font-semibold text-ink">Berechnung anzeigen</span>
              <span className="block text-sm text-ink-3">Formel, Rating und Anpassungen je Loch</span>
            </span>
            <ChevronDown className="h-5 w-5 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="border-t border-border px-5 py-4">
            <CalculationDetails detail={data} />
          </div>
        </details>
      </Card>

      {round.notes && (
        <Card>
          <CardHeader title="Notiz" />
          <CardBody className="text-sm text-ink-2">{round.notes}</CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={confirm}
        title="Runde löschen?"
        confirmLabel="Löschen"
        busy={busy}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api.member.deleteRound(item.id);
            toast("Runde gelöscht. Dein Handicap wurde neu berechnet.");
            router.replace("/member/rounds");
          } catch (e) {
            toast(userMessage(e), "error");
            setBusy(false);
          }
        }}
      >
        <p className="text-ink-2">
          Die Runde vom {formatDate(item.date)} ({item.courseName}) zählt danach nicht mehr. Dein Handicap Index wird neu berechnet.
        </p>
      </ConfirmDialog>
    </div>
  );
}
