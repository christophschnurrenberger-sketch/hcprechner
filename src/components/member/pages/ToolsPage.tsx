"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import { parseDecimal } from "@/lib/courses/csv";
import type { TargetAnalysis, WhatIfResult } from "@/lib/whs/simulation";
import { formatDecimal, formatHcp } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, PageHeader, Segmented, Stat } from "@/components/ui";
import { ErrorState, PageSkeleton } from "@/components/ui/feedback";
import { ChangeBadge } from "@/components/member/HcpHero";

type Tab = "stats" | "whatif" | "target";

function StatisticsTab() {
  const { data, error, reload } = useApi(() => api.member.statistics(), "stats");
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton variant="list" />;
  if (data.totalRounds === 0) return <p className="text-sm text-ink-3">Noch keine Runden – Statistiken erscheinen nach deiner ersten Runde.</p>;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Runden" value={data.totalRounds} sub={`${data.eighteenHoleRounds} × 18 · ${data.nineHoleRounds} × 9`} />
        <Stat label="handicaprelevant" value={data.relevantRounds} />
        <Stat label="bestes Score Differential" value={formatDecimal(data.differentials.best)} />
        <Stat label="Ø letzte 20" value={formatDecimal(data.last20.average)} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Ø GBE 18 Loch" value={formatDecimal(data.gross18.average)} />
        <Stat label="bestes GBE 18 Loch" value={data.gross18.best ?? "–"} />
        <Stat label="Ø GBE 9 Loch" value={formatDecimal(data.gross9.average)} />
        <Stat label="Ø der zählenden" value={formatDecimal(data.countedAverage)} />
      </div>
      {data.courses.length > 0 && (
        <Card>
          <CardHeader title="Nach Golfplatz" />
          <CardBody className="p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-3">
                <tr>
                  <th className="px-4 py-2 font-medium">Golfplatz</th>
                  <th className="px-4 py-2 text-right font-medium">Runden</th>
                  <th className="px-4 py-2 text-right font-medium">Ø SD</th>
                  <th className="px-4 py-2 text-right font-medium">bestes SD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.courses.map((c) => (
                  <tr key={c.key}>
                    <td className="px-4 py-2">{c.courseName}</td>
                    <td className="tabular px-4 py-2 text-right">{c.rounds}</td>
                    <td className="tabular px-4 py-2 text-right">{formatDecimal(c.differentials.average)}</td>
                    <td className="tabular px-4 py-2 text-right">{formatDecimal(c.differentials.best)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function WhatIfTab() {
  const [sd, setSd] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader title="Was wäre, wenn …" subtitle="Wie würde sich ein bestimmtes Score Differential in der nächsten Runde auswirken?" />
      <CardBody className="space-y-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = parseDecimal(sd);
            if (v === null || Number.isNaN(v) || v < -15 || v > 80) {
              setError("Bitte ein Score Differential eingeben (z. B. 16,4).");
              return;
            }
            setBusy(true);
            setError(null);
            try {
              setResult(await api.member.simulate(v));
            } catch (err) {
              setError(userMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Score Differential" htmlFor="wi-sd">
            <Input id="wi-sd" inputMode="decimal" value={sd} onChange={(e) => setSd(e.target.value)} placeholder="z. B. 16,4" className="w-36" />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Berechnen
          </Button>
        </form>
        {error && <Alert tone="error">{error}</Alert>}
        {result && (
          <div className="rounded-2xl bg-surface-2 p-4">
            <p className="text-sm text-ink-2">Dein Handicap Index wäre danach</p>
            <p className="tabular mt-1 flex items-center gap-3 text-4xl font-semibold text-brand">
              {formatHcp(result.after.currentHandicapIndex)} <ChangeBadge delta={result.change} />
            </p>
            <p className="mt-2 text-sm text-ink-2">
              {result.counted ? `Das Ergebnis würde zählen (Rang ${result.rankInWindow} von ${result.windowSize}).` : "Das Ergebnis würde nicht zu deinen besten zählen."}
              {result.dropped && ` Dafür fiele das Ergebnis vom ${result.dropped.date.split("-").reverse().join(".")} heraus${result.dropped.wasCounted ? ", das bisher gezählt hat" : ""}.`}
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function TargetTab() {
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TargetAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader title="Mein Ziel-Handicap" subtitle="Welches Ergebnis brauchst du für dein Ziel?" />
      <CardBody className="space-y-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = parseDecimal(target);
            if (v === null || Number.isNaN(v) || v < -10 || v > 54) {
              setError("Bitte ein Ziel zwischen +10 und 54 eingeben.");
              return;
            }
            setBusy(true);
            setError(null);
            try {
              setResult(await api.member.target(v));
            } catch (err) {
              setError(userMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Ziel" htmlFor="t-target">
            <Input id="t-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="z. B. 15,0" className="w-36" />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Analysieren
          </Button>
        </form>
        {error && <Alert tone="error">{error}</Alert>}
        {result && (
          <div className="space-y-2 rounded-2xl bg-surface-2 p-4 text-sm text-ink-2">
            {result.alreadyReached ? (
              <p className="font-medium text-good">Glückwunsch – dein Handicap Index {formatHcp(result.currentHandicapIndex)} erreicht das Ziel bereits.</p>
            ) : result.singleRound.achievable ? (
              <p>
                Mit einer Runde erreichbar: Du brauchst ein Score Differential von höchstens <strong className="tabular text-ink">{formatDecimal(result.singleRound.maxDifferential)}</strong> (danach HCPI {formatHcp(result.singleRound.resultingHandicapIndex)}).
              </p>
            ) : (
              <p>Mit einer einzigen Runde ist das Ziel nicht erreichbar. Es braucht mehrere gute Ergebnisse.</p>
            )}
            {result.scenarios.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {result.scenarios.slice(0, 4).map((s, i) => (
                  <li key={i}>
                    Mit Score Differentials von {formatDecimal(s.scoreDifferential)}:{" "}
                    {s.roundsNeeded === null ? "nicht erreichbar" : `${s.roundsNeeded} ${s.roundsNeeded === 1 ? "Runde" : "Runden"} (danach HCPI ${formatHcp(s.resultingHandicapIndex)})`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function ToolsPage() {
  const [tab, setTab] = useState<Tab>("stats");
  return (
    <div className="space-y-5">
      <PageHeader
        title="Werkzeuge"
        description="Auswertungen rund um dein Handicap – alle Berechnungen kommen vom Server."
        actions={
          <Link href="/member/stats" className="text-sm font-medium text-brand hover:underline">
            Golfstatistik (Putts, GIR, FIR)
          </Link>
        }
      />
      <Segmented
        name="Werkzeug"
        value={tab}
        onChange={setTab}
        options={[
          { value: "stats", label: "HCP-Auswertung" },
          { value: "whatif", label: "Was wäre wenn" },
          { value: "target", label: "Ziel" },
        ]}
      />
      {tab === "stats" && <StatisticsTab />}
      {tab === "whatif" && <WhatIfTab />}
      {tab === "target" && <TargetTab />}
    </div>
  );
}
