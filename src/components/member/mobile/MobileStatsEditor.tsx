"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, X } from "lucide-react";
import { completeHole, holeStatus, normalizeHole, questionsAnswered, totals, type HoleView } from "@/lib/rounds/holeFlow";
import { hasAnyStat, validateHoleStats } from "@/lib/stats/holeStats";
import type { HoleStat } from "@/lib/stats/types";
import { cn } from "@/lib/format";
import { Alert } from "@/components/ui";
import { haptic } from "./hooks";
import { HoleGrid, StatBoxes } from "./MobileRoundWizard";
import { PuttsScreen, ScoreScreen, StatsScreen } from "./screens";
import { BigButton, BottomSheet, ChoiceRow, HoleStrip, StickyFooter } from "./ui";

type Step = "SCORE" | "PUTTS" | "STATS" | "FINAL";

/**
 * „Statistiken ergänzen“ auf dem Smartphone: dieselben Schritte wie während der Runde, Loch für Loch.
 * Bei Runden mit Loch-für-Loch-Ergebnis sind die Schläge gesperrt (sie gehören zum Handicap).
 */
export function MobileStatsEditor({
  title,
  initial,
  scoresLocked,
  parEditable,
  onSave,
  onCancel,
  saving,
  error,
}: {
  title: string;
  initial: HoleStat[];
  scoresLocked: boolean;
  parEditable: boolean;
  onSave: (stats: HoleStat[] | null) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [stats, setStats] = useState<HoleStat[]>(initial);
  const [pos, setPos] = useState<{ hole: number; step: Step }>(() => {
    const i = initial.findIndex((h) => !(h.putts !== null && questionsAnswered(h)));
    return { hole: i < 0 ? 0 : i, step: i < 0 ? "FINAL" : scoresLocked ? "PUTTS" : "SCORE" };
  });
  const [dir, setDir] = useState<1 | -1>(1);
  const [moreOpen, setMoreOpen] = useState(false);
  const [leave, setLeave] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const posRef = useRef(pos);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const steps: Step[] = scoresLocked ? ["PUTTS", "STATS"] : ["SCORE", "PUTTS", "STATS"];
  const views: HoleView[] = useMemo(() => stats.map((h) => ({ number: h.number, par: h.par, strokeIndex: h.strokeIndex ?? null, raw: h.score, stats: h })), [stats]);
  const cur = views[Math.min(pos.hole, views.length - 1)];
  const dirty = JSON.stringify(stats) !== JSON.stringify(initial);

  const set = (i: number, p: Partial<HoleStat>) => setStats((list) => list.map((h, k) => (k === i ? normalizeHole({ ...h, ...p }) : h)));
  function go(hole: number, step: Step, d: 1 | -1 = 1) {
    if (timer.current) clearTimeout(timer.current);
    setDir(d);
    setMoreOpen(false);
    setPos({ hole, step });
  }
  function finish(i: number) {
    setStats((list) => list.map((h, k) => (k === i && (h.score !== null || h.putts !== null) ? completeHole(h) : h)));
  }
  function forward() {
    const k = steps.indexOf(pos.step as Step);
    if (pos.step === "FINAL") return;
    if (k < steps.length - 1) return go(pos.hole, steps[k + 1]);
    finish(pos.hole);
    haptic(12);
    if (pos.hole >= views.length - 1) go(pos.hole, "FINAL");
    else go(pos.hole + 1, steps[0]);
  }
  function back() {
    if (pos.step === "FINAL") return go(views.length - 1, steps[steps.length - 1], -1);
    const k = steps.indexOf(pos.step);
    if (k > 0) return go(pos.hole, steps[k - 1], -1);
    if (pos.hole > 0) return go(pos.hole - 1, steps[steps.length - 1], -1);
    if (dirty) setLeave(true);
    else onCancel();
  }

  const validation = validateHoleStats(stats, stats.map((h) => h.number));
  const t = totals(views);
  let content = null;
  let footer = null;
  if (pos.step === "SCORE") {
    content = (
      <div className="space-y-5">
        {parEditable && (
          <ChoiceRow label="Par" value={cur.par} allowClear={false} onChange={(par) => par !== null && set(pos.hole, { par })} options={[3, 4, 5].map((v) => ({ value: v, label: String(v) }))} />
        )}
        <ScoreScreen view={cur} value={cur.raw} allowPickup={false} onChange={(v) => set(pos.hole, { score: typeof v === "number" ? v : null })} />
      </div>
    );
    footer = <BigButton onClick={forward}>{cur.raw === null ? "Ohne Schläge weiter" : "Weiter"} <ArrowRight className="h-5 w-5" aria-hidden /></BigButton>;
  } else if (pos.step === "PUTTS") {
    content = (
      <PuttsScreen
        view={cur}
        putts={cur.stats.putts}
        onSelect={(p, auto) => {
          set(pos.hole, { putts: p });
          if (auto && p !== null) {
            const at = posRef.current;
            timer.current = setTimeout(() => posRef.current.hole === at.hole && posRef.current.step === "PUTTS" && go(at.hole, "STATS"), 200);
          }
        }}
      />
    );
    footer = <BigButton onClick={forward}>{cur.stats.putts === null ? "Ohne Putts weiter" : "Weiter"} <ArrowRight className="h-5 w-5" aria-hidden /></BigButton>;
  } else if (pos.step === "STATS") {
    content = (
      <StatsScreen
        view={cur}
        moreOpen={moreOpen}
        onToggleMore={() => {
          if (timer.current) clearTimeout(timer.current);
          setMoreOpen((v) => !v);
        }}
        onChange={(p, question) => {
          set(pos.hole, p);
          if (timer.current) clearTimeout(timer.current);
          if (!question || moreOpen) return;
          if (questionsAnswered(normalizeHole({ ...cur.stats, ...p }))) {
            const at = posRef.current;
            timer.current = setTimeout(() => {
              if (posRef.current.hole !== at.hole || posRef.current.step !== "STATS") return;
              forward();
            }, 550);
          }
        }}
      />
    );
    footer = <BigButton onClick={forward}>{pos.hole >= views.length - 1 ? "Zur Übersicht" : "Nächstes Loch"} <ArrowRight className="h-5 w-5" aria-hidden /></BigButton>;
  } else {
    content = (
      <div className="space-y-5 pt-2">
        <h1 className="text-center text-2xl font-bold text-ink">Statistik prüfen</h1>
        <StatBoxes t={t} detailed holes={views.length} />
        <div className="space-y-1.5">
          <p className="text-sm text-ink-3">Tippe auf ein Loch, um es zu ändern.</p>
          <HoleGrid views={views.slice(0, 9)} onHole={(i) => go(i, steps[0], -1)} />
          {views.length > 9 && <HoleGrid views={views.slice(9)} onHole={(i) => go(i, steps[0], -1)} offset={9} />}
        </div>
        {validation.errors.length > 0 && <Alert tone="error">{validation.errors[0].message}</Alert>}
        {validation.warnings.length > 0 && <Alert tone="warning">{validation.warnings[0].message}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        <p className="text-center text-sm text-ink-3">Dein Handicap bleibt unverändert.</p>
      </div>
    );
    footer = (
      <BigButton onClick={() => onSave(stats.some((h) => hasAnyStat(h)) ? stats : null)} disabled={saving || validation.errors.length > 0}>
        {saving ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null} {saving ? "Speichern…" : "Statistik speichern"}
      </BigButton>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-2 text-ink">
      <header className="shrink-0 border-b border-border bg-surface pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-1 px-1">
          <button type="button" onClick={back} aria-label="Zurück" className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-surface-3">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1 text-center leading-tight">
            <p className="truncate text-[15px] font-semibold">{pos.step === "FINAL" ? "Übersicht" : `Statistik · Loch ${cur.number}`}</p>
            <p className="truncate text-[13px] text-ink-3">{title}</p>
          </div>
          <button type="button" onClick={() => (dirty ? setLeave(true) : onCancel())} aria-label="Schließen" className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-surface-3">
            <X className="h-6 w-6" />
          </button>
        </div>
        <HoleStrip
          holes={views.map((v) => ({ number: v.number, status: holeStatus(v, "DETAILED"), label: v.raw === null ? "–" : String(v.raw) }))}
          current={pos.step === "FINAL" ? null : pos.hole}
          onSelect={(i) => {
            finish(pos.hole);
            go(i, steps[0], i < pos.hole ? -1 : 1);
          }}
          onSummary={() => {
            finish(pos.hole);
            go(pos.hole, "FINAL");
          }}
          summaryActive={pos.step === "FINAL"}
        />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div key={`${pos.step}-${pos.hole}`} className={cn("mx-auto w-full max-w-md px-4 py-4", dir === 1 ? "animate-[hcp-step-next_180ms_ease-out]" : "animate-[hcp-step-back_180ms_ease-out]")}>
          {content}
        </div>
      </main>
      <StickyFooter>{footer}</StickyFooter>
      <BottomSheet
        open={leave}
        onClose={() => setLeave(false)}
        title="Ohne Speichern verlassen?"
        footer={
          <>
            <BigButton onClick={() => { setLeave(false); go(pos.hole, "FINAL"); }}>Zur Übersicht und speichern</BigButton>
            <BigButton variant="ghost" onClick={onCancel}>
              Verwerfen und verlassen
            </BigButton>
          </>
        }
      >
        <p className="text-ink-2">Deine Änderungen an der Statistik sind noch nicht gespeichert.</p>
      </BottomSheet>
    </div>
  );
}
