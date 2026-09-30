"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Circle, Lock, Minus, Plus, Square } from "lucide-react";
import { asksFairway, asksSandSave, relativeScore, scoreOptions, visibleQuestions, type HoleView, type RelativeScore } from "@/lib/rounds/holeFlow";
import type { HoleStat } from "@/lib/stats/types";
import type { HoleScore } from "@/lib/whs/types";
import { cn } from "@/lib/format";
import { ChoiceRow, Stepper } from "./ui";

const YES_NO = [
  { value: true, label: "Ja" },
  { value: false, label: "Nein" },
];

export function HoleTitle({ view, sub }: { view: HoleView; sub?: ReactNode }) {
  return (
    <div className="text-center">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Loch {view.number}</h1>
      <p className="mt-0.5 text-lg text-ink-2">
        Par {view.par ?? "–"}
        {view.strokeIndex ? <span className="text-ink-3"> · HCP {view.strokeIndex}</span> : null}
      </p>
      {sub && <p className="mt-1 text-base text-ink-3">{sub}</p>}
    </div>
  );
}

const TONE: Record<RelativeScore["tone"], string> = {
  under: "bg-info-soft text-info",
  par: "bg-good-soft text-good",
  bogey: "bg-surface-3 text-ink-2",
  double: "bg-warning-soft text-warning",
  triple: "bg-critical-soft text-critical",
};

/** Ergebnis relativ zu Par: Symbol + Text + Farbe (nie nur Farbe). */
export function RelChip({ rel, className }: { rel: RelativeScore | null; className?: string }) {
  if (!rel) return <span className={cn("inline-flex h-8 items-center text-base text-ink-3", className)}>&nbsp;</span>;
  const Icon = rel.tone === "under" ? Circle : rel.tone === "par" ? null : Square;
  return (
    <span className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-base font-semibold", TONE[rel.tone], className)}>
      {Icon && <Icon className={cn("h-3.5 w-3.5", rel.tone === "double" || rel.tone === "triple" ? "fill-current" : "")} aria-hidden />}
      {rel.label} <span className="tabular">{rel.short}</span>
    </span>
  );
}

export function scoreText(raw: HoleScore): string {
  return raw === "PICKUP" ? "Strich" : raw === null ? "–" : `${raw} ${raw === 1 ? "Schlag" : "Schläge"}`;
}

// ---------------------------------------------------------------------------
// Schritt 1: Schläge
// ---------------------------------------------------------------------------

export function ScoreScreen({ view, value, onChange, locked, allowPickup = true }: { view: HoleView; value: HoleScore; onChange: (v: HoleScore) => void; locked?: boolean; allowPickup?: boolean }) {
  const par = view.par;
  const num = typeof value === "number" ? value : null;
  const rel = relativeScore(num, par);
  const step = (d: number) => onChange(Math.min(20, Math.max(1, num === null ? (par ?? 4) : num + d)));
  if (locked) {
    return (
      <div className="flex flex-col items-center gap-5">
        <HoleTitle view={view} />
        <div className="flex flex-col items-center gap-2">
          <p className="flex items-center gap-1.5 text-base text-ink-3">
            <Lock className="h-4 w-4" aria-hidden /> Schläge aus deinem Ergebnis
          </p>
          <p className="tabular text-6xl font-bold text-ink">{value === "PICKUP" ? "X" : (num ?? "–")}</p>
          <RelChip rel={rel} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4">
      <HoleTitle view={view} />
      <p className="text-lg font-medium text-ink">Wie viele Schläge?</p>
      <div className="flex items-center gap-5">
        <button type="button" onClick={() => step(-1)} aria-label="Ein Schlag weniger" className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-border bg-surface text-ink active:bg-surface-3">
          <Minus className="h-7 w-7" />
        </button>
        <output aria-live="polite" aria-label={`Schläge an Loch ${view.number}`} className={cn("tabular w-24 text-center font-bold leading-none", value === null ? "text-5xl text-ink-3" : "text-7xl text-ink")}>
          {value === "PICKUP" ? "X" : (num ?? "–")}
        </output>
        <button type="button" onClick={() => step(1)} aria-label="Ein Schlag mehr" className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-border bg-surface text-ink active:bg-surface-3">
          <Plus className="h-7 w-7" />
        </button>
      </div>
      <RelChip rel={value === "PICKUP" ? { label: "Loch nicht beendet", short: "", tone: "bogey" } : rel} />
      <div className="grid w-full grid-cols-3 gap-2">
        {scoreOptions(par).map((o) => {
          const active = num === o.value && !o.more;
          const r = relativeScore(o.value, par);
          const isPar = par !== null && o.value === par;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              aria-label={o.more ? `${o.value} oder mehr Schläge` : `${o.value} Schläge${r ? `, ${r.label}` : ""}`}
              onClick={() => onChange(o.value)}
              className={cn(
                "flex h-16 flex-col items-center justify-center rounded-2xl border-2 transition-colors",
                active ? "border-brand bg-brand text-white dark:text-[#0d1510]" : isPar && num === null ? "border-brand-2/60 bg-brand-soft text-ink" : "border-border bg-surface text-ink active:bg-surface-3",
              )}
            >
              <span className="tabular text-2xl font-bold leading-none">
                {o.value}
                {o.more ? "+" : ""}
              </span>
              <span className={cn("mt-1 text-xs", active ? "opacity-90" : "text-ink-3")}>{o.more ? "mehr" : r?.short === "E" ? "Par" : r?.short}</span>
            </button>
          );
        })}
      </div>
      {allowPickup && (
        <button type="button" onClick={() => onChange(value === "PICKUP" ? null : "PICKUP")} className="h-11 px-3 text-sm font-medium text-ink-3 underline-offset-2 hover:underline">
          {value === "PICKUP" ? "Strich zurücknehmen" : "Loch nicht beendet (Strich)"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schritt 2: Putts
// ---------------------------------------------------------------------------

export function PuttsScreen({ view, putts, onSelect }: { view: HoleView; putts: number | null; onSelect: (p: number | null, auto: boolean) => void }) {
  const rel = relativeScore(typeof view.raw === "number" ? view.raw : null, view.par);
  return (
    <div className="flex flex-col items-center gap-5">
      <HoleTitle view={view} sub={`${scoreText(view.raw)}${rel ? ` · ${rel.label}` : ""}`} />
      <p className="text-lg font-medium text-ink">Wie viele Putts?</p>
      <div className="grid w-full grid-cols-5 gap-2">
        {[0, 1, 2, 3, 4].map((p) => {
          const active = p === 4 ? (putts ?? 0) >= 4 : putts === p;
          return (
            <button
              key={p}
              type="button"
              aria-pressed={active}
              aria-label={p === 4 ? "4 oder mehr Putts" : `${p} ${p === 1 ? "Putt" : "Putts"}`}
              onClick={() => onSelect(p === 4 ? Math.max(4, putts ?? 4) : active ? null : p, p !== 4 && !active)}
              className={cn(
                "tabular flex h-20 items-center justify-center rounded-2xl border-2 text-3xl font-bold transition-colors",
                active ? "border-brand bg-brand text-white dark:text-[#0d1510]" : "border-border bg-surface text-ink active:bg-surface-3",
              )}
            >
              {p === 4 ? "4+" : p}
            </button>
          );
        })}
      </div>
      {(putts ?? 0) >= 4 && (
        <div className="w-full rounded-2xl bg-surface p-3">
          <Stepper label="Putts" value={putts ?? 4} min={4} max={10} onChange={(v) => onSelect(v, false)} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schritt 3: Statistik (nur relevante Fragen, nacheinander)
// ---------------------------------------------------------------------------

export function StatsScreen({
  view,
  onChange,
  moreOpen,
  onToggleMore,
}: {
  view: HoleView;
  onChange: (patch: Partial<HoleStat>, question: boolean) => void;
  moreOpen: boolean;
  onToggleMore: () => void;
}) {
  const s = view.stats;
  const [noteOpen, setNoteOpen] = useState(Boolean(s.note));
  const questions = visibleQuestions(s);
  const extras = (s.bunkerVisit ? 1 : 0) + ((s.penaltyStrokes ?? 0) > 0 ? 1 : 0) + (s.note ? 1 : 0);
  const summary = [scoreText(view.raw), s.putts !== null ? `${s.putts} ${s.putts === 1 ? "Putt" : "Putts"}` : null].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-5">
      <HoleTitle view={view} sub={summary} />
      {questions.includes("fir") && asksFairway(view.par) && (
        <ChoiceRow
          label="Fairway getroffen?"
          value={s.fir}
          onChange={(fir) => onChange({ fir }, true)}
          options={[
            { value: true, label: "Getroffen" },
            { value: false, label: "Verfehlt" },
          ]}
        />
      )}
      {questions.includes("gir") && (
        <ChoiceRow
          label="Grün in Regulation?"
          value={s.gir}
          onChange={(gir) => onChange({ gir }, true)}
          options={YES_NO}
          info={{ title: "Grün in Regulation (GIR)", text: `Das Grün wurde innerhalb der vorgesehenen Schlagzahl erreicht: Par − 2 Schläge${view.par ? ` – hier also nach höchstens ${view.par - 2} ${view.par - 2 === 1 ? "Schlag" : "Schlägen"}` : ""}.` }}
        />
      )}
      {questions.includes("upAndDown") && (
        <ChoiceRow
          label="Up & Down geschafft?"
          value={s.upAndDown}
          onChange={(upAndDown) => onChange({ upAndDown }, true)}
          options={YES_NO}
          info={{ title: "Up & Down", text: "Nach verfehltem Grün mit höchstens zwei weiteren Schlägen eingelocht – also Par oder besser." }}
        />
      )}

      <div className="rounded-2xl border border-border bg-surface">
        <button type="button" onClick={onToggleMore} aria-expanded={moreOpen} className="flex h-12 w-full items-center justify-between px-4 text-base font-medium text-ink">
          <span>
            Weitere Statistiken{extras > 0 && !moreOpen ? <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">{extras}</span> : null}
          </span>
          <ChevronDown className={cn("h-5 w-5 text-ink-3 transition-transform", moreOpen && "rotate-180")} aria-hidden />
        </button>
        {moreOpen && (
          <div className="space-y-5 border-t border-border p-4">
            <ChoiceRow label="Im Bunker?" value={s.bunkerVisit} onChange={(bunkerVisit) => onChange({ bunkerVisit }, false)} options={YES_NO} />
            {asksSandSave(s) && (
              <ChoiceRow
                label="Sand Save?"
                value={s.sandSave}
                onChange={(sandSave) => onChange({ sandSave }, false)}
                options={YES_NO}
                info={{ title: "Sand Save", text: "Nach dem Schlag aus dem Bunker trotzdem Par oder besser gespielt." }}
              />
            )}
            <Stepper label="Strafschläge" value={s.penaltyStrokes ?? 0} max={6} onChange={(penaltyStrokes) => onChange({ penaltyStrokes }, false)} />
            {noteOpen || s.note ? (
              <label className="block space-y-1.5">
                <span className="flex items-center gap-1.5 text-base font-semibold text-ink">
                  <Lock className="h-4 w-4 text-ink-3" aria-hidden /> Notiz <span className="text-sm font-normal text-ink-3">(privat)</span>
                </span>
                <textarea
                  value={s.note ?? ""}
                  maxLength={200}
                  rows={2}
                  onChange={(e) => onChange({ note: e.target.value || null }, false)}
                  placeholder="z. B. Abschlag rechts, Wind von vorn"
                  className="w-full rounded-xl border border-border-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-3 focus:border-brand-2 focus:outline-none focus:ring-2 focus:ring-brand-2/20"
                />
              </label>
            ) : (
              <button type="button" onClick={() => setNoteOpen(true)} className="flex h-11 items-center gap-1.5 text-base font-medium text-brand">
                <Lock className="h-4 w-4" aria-hidden /> Notiz hinzufügen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
