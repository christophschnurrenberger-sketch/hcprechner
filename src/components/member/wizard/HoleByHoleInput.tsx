"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import type { HoleInfo, HoleScore } from "@/lib/whs/types";
import { cn } from "@/lib/format";

function label(s: HoleScore): string {
  if (s === "PICKUP") return "X";
  return s === null ? "–" : String(s);
}

/**
 * Scorekarte zum Eintippen direkt nach der Runde: ein Loch pro Ansicht mit großen Tasten,
 * darunter die Übersicht aller Löcher. Nur Eingabe – Begrenzungen (Netto-Doppelbogey) berechnet das Backend.
 */
export function HoleByHoleInput({ holes, scores, onChange }: { holes: HoleInfo[]; scores: HoleScore[]; onChange: (scores: HoleScore[]) => void }) {
  const firstEmpty = scores.findIndex((s) => s === null);
  const [current, setCurrent] = useState(firstEmpty >= 0 ? firstEmpty : 0);
  const hole = holes[current];
  const value = scores[current] ?? null;

  const set = (i: number, v: HoleScore) => {
    const next = [...scores];
    next[i] = v;
    onChange(next);
  };
  const step = (delta: number) => {
    const base = typeof value === "number" ? value : hole.par;
    set(current, Math.min(20, Math.max(1, base + delta)));
  };
  const played = scores.filter((s) => typeof s === "number") as number[];
  const total = played.reduce((a, b) => a + b, 0);
  const parPlayed = holes.reduce((a, h, i) => (typeof scores[i] === "number" ? a + h.par : a), 0);
  const quick = [
    { label: "Birdie", v: hole.par - 1 },
    { label: "Par", v: hole.par },
    { label: "Bogey", v: hole.par + 1 },
    { label: "Doppel", v: hole.par + 2 },
  ].filter((q) => q.v >= 1);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0} className="rounded-xl p-2.5 text-ink-2 hover:bg-surface-3 disabled:opacity-30" aria-label="Vorheriges Loch">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="text-center">
            <p className="text-lg font-semibold text-ink">Loch {hole.number}</p>
            <p className="text-sm text-ink-3">
              Par {hole.par}
              {hole.strokeIndex ? ` · Hcp ${hole.strokeIndex}` : ""}
            </p>
          </div>
          <button type="button" onClick={() => setCurrent((c) => Math.min(holes.length - 1, c + 1))} disabled={current === holes.length - 1} className="rounded-xl p-2.5 text-ink-2 hover:bg-surface-3 disabled:opacity-30" aria-label="Nächstes Loch">
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
        <div className="mt-4 flex items-center justify-center gap-5">
          <button type="button" onClick={() => step(-1)} className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border-strong text-ink hover:bg-surface-2" aria-label="Einen Schlag weniger">
            <Minus className="h-6 w-6" />
          </button>
          <output aria-live="polite" aria-label={`Schläge an Loch ${hole.number}`} className="tabular w-20 text-center text-6xl font-semibold text-ink">
            {label(value)}
          </output>
          <button type="button" onClick={() => step(1)} className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border-strong text-ink hover:bg-surface-2" aria-label="Einen Schlag mehr">
            <Plus className="h-6 w-6" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-2">
          {quick.map((q) => (
            <button key={q.label} type="button" onClick={() => set(current, q.v)} className={cn("rounded-xl border py-2 text-xs font-medium", value === q.v ? "border-brand-2 bg-brand-soft text-brand" : "border-border text-ink-2 hover:bg-surface-2")}>
              {q.label}
              <span className="tabular block text-sm font-semibold">{q.v}</span>
            </button>
          ))}
          <button type="button" onClick={() => set(current, "PICKUP")} className={cn("rounded-xl border py-2 text-xs font-medium", value === "PICKUP" ? "border-brand-2 bg-brand-soft text-brand" : "border-border text-ink-2 hover:bg-surface-2")} title="Loch nicht beendet (aufgehoben)">
            Strich
            <span className="block text-sm font-semibold">X</span>
          </button>
        </div>
        <div className="mt-4 flex justify-between gap-2">
          <button type="button" onClick={() => set(current, null)} className="text-xs font-medium text-ink-3 hover:text-ink">
            Loch leeren
          </button>
          {current < holes.length - 1 ? (
            <button type="button" onClick={() => setCurrent((c) => c + 1)} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover dark:text-[#0d1510]">
              Weiter zu Loch {holes[current + 1].number}
            </button>
          ) : (
            <span className="text-xs text-ink-3">Letztes Loch</span>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="font-medium text-ink">Übersicht</span>
          <span className="tabular text-ink-2">
            {played.length} von {holes.length} Löchern · {total} Schläge{played.length ? ` (${total - parPlayed >= 0 ? "+" : ""}${total - parPlayed})` : ""}
          </span>
        </div>
        <div className="grid grid-cols-9 gap-1.5">
          {holes.map((h, i) => (
            <button
              key={h.number}
              type="button"
              onClick={() => setCurrent(i)}
              aria-label={`Loch ${h.number}: ${label(scores[i] ?? null)}`}
              aria-current={i === current ? "true" : undefined}
              className={cn(
                "flex flex-col items-center rounded-lg border py-1.5 text-xs",
                i === current ? "border-brand-2 ring-1 ring-brand-2" : "border-border",
                scores[i] === null || scores[i] === undefined ? "bg-surface text-ink-3" : "bg-surface-2 text-ink",
              )}
            >
              <span className="text-[10px] text-ink-3">{h.number}</span>
              <span className="tabular font-semibold">{label(scores[i] ?? null)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
