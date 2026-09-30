"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Circle, CircleDot, Lock, Minus, Plus } from "lucide-react";
import type { HoleStat } from "@/lib/stats/types";
import { hasAnyStat, isHoleTracked, validateHoleStats } from "@/lib/stats/holeStats";
import type { HoleScore } from "@/lib/whs/types";
import { cn } from "@/lib/format";

/** Statistik mit der Schlagzahl der Handicap-Eingabe (Loch für Loch) zusammenführen. */
export function mergeStrokes(stats: HoleStat[], strokes: HoleScore[] | undefined): HoleStat[] {
  if (!strokes) return stats;
  return stats.map((h, i) => ({ ...h, score: typeof strokes[i] === "number" ? (strokes[i] as number) : null }));
}

type Status = "done" | "partial" | "empty";
const statusOf = (h: HoleStat): Status => (isHoleTracked(h) ? "done" : hasAnyStat(h) ? "partial" : "empty");

function Choice<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
  hint,
  disabled,
}: {
  label: ReactNode;
  value: T | null;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T | null) => void;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={typeof label === "string" ? label : undefined} className={cn("space-y-1.5", disabled && "opacity-50")}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">{label}</p>
        {hint && <p className="text-xs text-ink-3">{hint}</p>}
      </div>
      <div className="flex gap-1.5">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(active ? null : o.value)}
              className={cn(
                "tabular h-11 min-w-11 flex-1 rounded-xl border text-sm font-semibold transition-colors disabled:cursor-not-allowed",
                active ? "border-brand-2 bg-brand text-white dark:text-[#0d1510]" : "border-border bg-surface text-ink hover:bg-surface-2",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const YES_NO = [
  { value: true, label: "Ja" },
  { value: false, label: "Nein" },
];

export interface DetailedHoleInputProps {
  /** Ein Eintrag je gespieltem Loch (Nummer, Par, Handicap) */
  stats: HoleStat[];
  onChange: (stats: HoleStat[]) => void;
  /** Loch für Loch: Schläge stammen aus der Handicap-Eingabe und werden hier mit erfasst */
  strokes?: HoleScore[];
  onStrokes?: (strokes: HoleScore[]) => void;
  /** Schlagzahl nur anzeigen (gespeicherte Runde mit Loch-für-Loch-Ergebnis) */
  scoreLocked?: boolean;
  /** Par je Loch wählbar (kein Lochdatensatz vorhanden, z. B. manueller Platz) */
  parEditable?: boolean;
}

/**
 * Detaillierte Scorekarte für das Smartphone: ein Loch pro Ansicht, große Tasten, Fortschritt und
 * Lochnavigation (✓ vollständig, ● begonnen, ○ offen). Es wird nichts aus der Schlagzahl abgeleitet;
 * Prüfungen (z. B. mehr Putts als Schläge) erscheinen direkt am Loch.
 */
export function DetailedHoleInput({ stats, onChange, strokes, onStrokes, scoreLocked, parEditable }: DetailedHoleInputProps) {
  const merged = useMemo(() => mergeStrokes(stats, strokes), [stats, strokes]);
  const firstOpen = merged.findIndex((h) => !isHoleTracked(h));
  const [current, setCurrent] = useState(firstOpen >= 0 ? firstOpen : 0);
  const [noteOpen, setNoteOpen] = useState(false);
  const i = Math.min(current, merged.length - 1);
  const hole = merged[i];
  const validation = useMemo(() => validateHoleStats(merged, merged.map((h) => h.number)), [merged]);
  const errors = validation.errors.filter((e) => e.hole === hole.number);
  const warnings = validation.warnings.filter((e) => e.hole === hole.number);
  const tracked = merged.filter(isHoleTracked).length;
  const whs = Boolean(strokes && onStrokes);
  const rawStroke = strokes?.[i] ?? null;
  const par = hole.par;

  const patch = (p: Partial<HoleStat>) => {
    const next = [...stats];
    const h = { ...next[i], ...p };
    // abhängige Angaben bereinigen (keine Ableitung aus der Schlagzahl)
    if (h.par === 3) h.fir = null;
    if (h.gir === true) h.upAndDown = null;
    if (h.bunkerVisit !== true) {
      h.bunkerShots = null;
      h.sandSave = null;
    }
    next[i] = h;
    onChange(next);
  };
  const setScore = (v: HoleScore) => {
    if (whs && strokes && onStrokes) {
      const next = [...strokes];
      next[i] = v;
      onStrokes(next);
    } else if (v !== "PICKUP") patch({ score: v });
  };
  const step = (delta: number) => {
    const cur = whs ? (typeof rawStroke === "number" ? rawStroke : null) : hole.score;
    const base = cur ?? par ?? 4;
    setScore(Math.min(20, Math.max(1, (cur === null ? base : base + delta))));
  };
  const go = (n: number) => {
    setCurrent(Math.max(0, Math.min(merged.length - 1, n)));
    setNoteOpen(false);
  };
  const scoreLabel = whs ? (rawStroke === "PICKUP" ? "X" : rawStroke === null ? "–" : String(rawStroke)) : hole.score === null ? "–" : String(hole.score);
  const quick = par ? [{ label: "Birdie", v: par - 1 }, { label: "Par", v: par }, { label: "Bogey", v: par + 1 }, { label: "Doppel", v: par + 2 }].filter((q) => q.v >= 1) : [];
  const currentScore = whs ? rawStroke : hole.score;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-xs text-ink-3">
          <span>
            {tracked} von {merged.length} Löchern vollständig
          </span>
          <span>Schläge, Putts, GIR und Strafschläge = vollständig</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={merged.length} aria-valuenow={tracked} aria-label="Fortschritt der Scorekarte">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(tracked / merged.length) * 100}%` }} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => go(i - 1)} disabled={i === 0} className="rounded-xl p-2.5 text-ink-2 hover:bg-surface-3 disabled:opacity-30" aria-label="Vorheriges Loch">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="text-center">
            <p className="text-lg font-semibold text-ink">Loch {hole.number}</p>
            {parEditable ? (
              <div className="mt-1 flex items-center justify-center gap-1" role="group" aria-label="Par">
                {[3, 4, 5].map((p) => (
                  <button key={p} type="button" aria-pressed={par === p} onClick={() => patch({ par: par === p ? null : p })} className={cn("rounded-lg px-2 py-0.5 text-xs font-medium", par === p ? "bg-brand-soft text-brand" : "text-ink-3 hover:bg-surface-3")}>
                    Par {p}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-3">
                Par {par ?? "–"}
                {hole.strokeIndex ? ` · Hcp ${hole.strokeIndex}` : ""}
              </p>
            )}
          </div>
          <button type="button" onClick={() => go(i + 1)} disabled={i === merged.length - 1} className="rounded-xl p-2.5 text-ink-2 hover:bg-surface-3 disabled:opacity-30" aria-label="Nächstes Loch">
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>

        <div className="mt-4">
          <p className="text-center text-sm font-medium text-ink">Schläge{scoreLocked ? " (aus deinem Ergebnis)" : whs ? " (zählen fürs Handicap)" : ""}</p>
          <div className="mt-2 flex items-center justify-center gap-5">
            {!scoreLocked && (
              <button type="button" onClick={() => step(-1)} className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border-strong text-ink hover:bg-surface-2" aria-label="Einen Schlag weniger">
                <Minus className="h-6 w-6" />
              </button>
            )}
            <output aria-live="polite" aria-label={`Schläge an Loch ${hole.number}`} className="tabular w-20 text-center text-6xl font-semibold text-ink">
              {scoreLabel}
            </output>
            {!scoreLocked && (
              <button type="button" onClick={() => step(1)} className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border-strong text-ink hover:bg-surface-2" aria-label="Einen Schlag mehr">
                <Plus className="h-6 w-6" />
              </button>
            )}
          </div>
          {!scoreLocked && quick.length > 0 && (
            <div className={cn("mt-3 grid gap-2", whs ? "grid-cols-5" : "grid-cols-4")}>
              {quick.map((q) => (
                <button key={q.label} type="button" onClick={() => setScore(q.v)} className={cn("rounded-xl border py-1.5 text-xs font-medium", currentScore === q.v ? "border-brand-2 bg-brand-soft text-brand" : "border-border text-ink-2 hover:bg-surface-2")}>
                  {q.label}
                  <span className="tabular block text-sm font-semibold">{q.v}</span>
                </button>
              ))}
              {whs && (
                <button type="button" onClick={() => setScore("PICKUP")} title="Loch nicht beendet (aufgehoben)" className={cn("rounded-xl border py-1.5 text-xs font-medium", rawStroke === "PICKUP" ? "border-brand-2 bg-brand-soft text-brand" : "border-border text-ink-2 hover:bg-surface-2")}>
                  Strich
                  <span className="block text-sm font-semibold">X</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 space-y-4 border-t border-border pt-4">
          <Choice label="Putts" value={hole.putts} onChange={(putts) => patch({ putts })} options={[0, 1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }))} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Choice label="Fairway getroffen" value={hole.fir} onChange={(fir) => patch({ fir })} options={YES_NO} disabled={par === 3} hint={par === 3 ? "nicht auf Par 3" : undefined} />
            <Choice label="Grün in Regulation" value={hole.gir} onChange={(gir) => patch({ gir })} options={YES_NO} hint={par ? `nach ${par - 2} ${par - 2 === 1 ? "Schlag" : "Schlägen"}` : undefined} />
          </div>
          {hole.gir !== true && <Choice label="Up & Down" value={hole.upAndDown} onChange={(upAndDown) => patch({ upAndDown })} options={YES_NO} hint="danach Par oder besser" />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Choice label="Im Bunker" value={hole.bunkerVisit} onChange={(bunkerVisit) => patch({ bunkerVisit })} options={YES_NO} />
            <Choice label="Strafschläge" value={hole.penaltyStrokes} onChange={(penaltyStrokes) => patch({ penaltyStrokes })} options={[0, 1, 2, 3].map((v) => ({ value: v, label: String(v) }))} />
          </div>
          {hole.bunkerVisit === true && (
            <div className="grid gap-4 rounded-xl bg-surface-2 p-3 sm:grid-cols-2">
              <Choice label="Schläge aus dem Bunker" value={hole.bunkerShots} onChange={(bunkerShots) => patch({ bunkerShots })} options={[1, 2, 3].map((v) => ({ value: v, label: String(v) }))} hint="optional" />
              <Choice label="Sand Save" value={hole.sandSave} onChange={(sandSave) => patch({ sandSave })} options={YES_NO} hint="Par oder besser" />
            </div>
          )}
          {noteOpen || hole.note ? (
            <div className="space-y-1.5">
              <label htmlFor={`note-${hole.number}`} className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <Lock className="h-3.5 w-3.5 text-ink-3" aria-hidden /> Notiz zu Loch {hole.number} <span className="text-xs font-normal text-ink-3">(privat)</span>
              </label>
              <input
                id={`note-${hole.number}`}
                value={hole.note ?? ""}
                maxLength={200}
                onChange={(e) => patch({ note: e.target.value || null })}
                placeholder="z. B. Abschlag rechts, Wind von vorn"
                className="h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-brand-2 focus:outline-none focus:ring-2 focus:ring-brand-2/20"
              />
            </div>
          ) : (
            <button type="button" onClick={() => setNoteOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
              <Lock className="h-3.5 w-3.5" aria-hidden /> Private Notiz hinzufügen
            </button>
          )}
        </div>

        {(errors.length > 0 || warnings.length > 0) && (
          <ul className="mt-4 space-y-1 text-sm" aria-live="polite">
            {errors.map((e) => (
              <li key={e.message} className="font-medium text-critical">
                {e.message}
              </li>
            ))}
            {warnings.map((e) => (
              <li key={e.message} className="text-warning">
                {e.message}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              const next = [...stats];
              next[i] = { ...next[i], score: whs || scoreLocked ? next[i].score : null, putts: null, fir: null, gir: null, bunkerVisit: null, bunkerShots: null, sandSave: null, upAndDown: null, penaltyStrokes: null, note: null };
              onChange(next);
              if (whs && strokes && onStrokes) {
                const s = [...strokes];
                s[i] = null;
                onStrokes(s);
              }
            }}
            className="text-xs font-medium text-ink-3 hover:text-ink"
          >
            Loch leeren
          </button>
          {i < merged.length - 1 ? (
            <button type="button" onClick={() => go(i + 1)} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover dark:text-[#0d1510]">
              Weiter zu Loch {merged[i + 1].number}
            </button>
          ) : (
            <span className="text-xs text-ink-3">Letztes Loch</span>
          )}
        </div>
      </div>

      <HoleNavigation holes={merged} current={i} onSelect={go} strokes={strokes} />
    </div>
  );
}

function HoleNavigation({ holes, current, onSelect, strokes }: { holes: HoleStat[]; current: number; onSelect: (i: number) => void; strokes?: HoleScore[] }) {
  const played = holes.filter((h) => h.score !== null);
  const total = played.reduce((a, h) => a + (h.score ?? 0), 0);
  const parPlayed = played.reduce((a, h) => a + (h.par ?? 0), 0);
  const allPar = played.every((h) => h.par !== null);
  const putts = holes.reduce((a, h) => a + (h.putts ?? 0), 0);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="font-medium text-ink">Übersicht</span>
        <span className="tabular text-ink-2">
          {total} Schläge{played.length && allPar ? ` (${total - parPlayed >= 0 ? "+" : ""}${total - parPlayed})` : ""} · {putts} Putts
        </span>
      </div>
      <div className="grid grid-cols-9 gap-1.5">
        {holes.map((h, i) => {
          const st = statusOf(h);
          const Icon = st === "done" ? Check : st === "partial" ? CircleDot : Circle;
          const raw = strokes?.[i];
          const label = raw === "PICKUP" ? "X" : h.score ?? "–";
          return (
            <button
              key={h.number}
              type="button"
              onClick={() => onSelect(i)}
              aria-label={`Loch ${h.number}: ${st === "done" ? "vollständig" : st === "partial" ? "begonnen" : "offen"}`}
              aria-current={i === current ? "true" : undefined}
              className={cn(
                "flex flex-col items-center rounded-lg border py-1.5 text-xs",
                i === current ? "border-brand-2 ring-1 ring-brand-2" : "border-border",
                st === "empty" ? "bg-surface text-ink-3" : "bg-surface-2 text-ink",
              )}
            >
              <span className="text-[10px] text-ink-3">{h.number}</span>
              <span className="tabular font-semibold">{label}</span>
              <Icon className={cn("mt-0.5 h-3 w-3", st === "done" ? "text-good" : st === "partial" ? "text-warning" : "text-ink-3")} aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}
