"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HoleInfo, HoleScore } from "@/lib/whs/types";
import { cn } from "@/lib/format";
import { Button } from "@/components/ui";

export interface ScorecardProps {
  holes: HoleInfo[];
  onHolesChange: (holes: HoleInfo[]) => void;
  scores: HoleScore[];
  onScoresChange: (scores: HoleScore[]) => void;
  mode: "strokes" | "stableford";
  points?: (number | null)[];
  onPointsChange?: (points: (number | null)[]) => void;
  strokesReceived: number[] | null;
  allowNotPlayed?: boolean;
  editableHoleData: boolean;
}

function parseIntOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

function adjusted(raw: HoleScore, ndb: number | null): { value: number | null; reason: string } {
  if (raw === null) return { value: null, reason: "" };
  if (ndb === null) return { value: raw === "PICKUP" ? null : raw, reason: "" };
  if (raw === "PICKUP") return { value: ndb, reason: "nicht beendet → NDB" };
  if (raw > ndb) return { value: ndb, reason: "Netto-Doppelbogey-Limit" };
  return { value: raw, reason: "" };
}

function scoreLabel(s: HoleScore): string {
  if (s === "PICKUP") return "X";
  if (s === null) return "";
  return String(s);
}

export function ScorecardInput(props: ScorecardProps) {
  const { holes, scores, strokesReceived, mode, points = [] } = props;
  const [current, setCurrent] = useState(0);

  const setScore = (i: number, value: HoleScore) => {
    const next = [...scores];
    next[i] = value;
    props.onScoresChange(next);
  };
  const setPoints = (i: number, value: number | null) => {
    const next = [...points];
    next[i] = value;
    props.onPointsChange?.(next);
  };
  const setHole = (i: number, patch: Partial<HoleInfo>) => {
    const next = holes.map((h, j) => (j === i ? { ...h, ...patch } : h));
    props.onHolesChange(next);
  };

  const ndbOf = (i: number) =>
    strokesReceived && holes[i].par > 0 ? holes[i].par + 2 + strokesReceived[i] : null;

  const totals = scores.reduce<{ raw: number; adj: number; complete: boolean }>(
    (acc, s, i) => {
      if (mode === "stableford") return acc;
      const a = adjusted(s, ndbOf(i));
      if (typeof s === "number") acc.raw += s;
      else acc.complete = false;
      if (a.value !== null) acc.adj += a.value;
      return acc;
    },
    { raw: 0, adj: 0, complete: true },
  );
  const pointsTotal = points.reduce<number>((a, p) => a + (p ?? 0), 0);
  const parTotal = holes.reduce((a, h) => a + (h.par || 0), 0);

  const hole = holes[current];
  const quick = hole && hole.par > 0 ? [hole.par - 1, hole.par, hole.par + 1, hole.par + 2, hole.par + 3, hole.par + 4].filter((n) => n > 0) : [3, 4, 5, 6, 7, 8];

  return (
    <div className="space-y-3">
      {/* Smartphone: Loch für Loch */}
      <div className="md:hidden">
        <div className="mb-3 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Löcher">
          {holes.map((h, i) => {
            const filled = mode === "stableford" ? points[i] !== null && points[i] !== undefined : scores[i] !== null;
            return (
              <button
                key={h.number}
                type="button"
                role="tab"
                aria-selected={i === current}
                onClick={() => setCurrent(i)}
                className={cn(
                  "tabular h-8 min-w-8 rounded-md border text-xs font-semibold",
                  i === current ? "border-brand bg-brand text-white dark:text-[#0d1510]" : filled ? "border-brand-2/40 bg-brand-soft text-brand" : "border-border bg-surface text-ink-3",
                )}
              >
                {h.number}
              </button>
            );
          })}
        </div>
        {hole && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-lg font-semibold">Loch {hole.number}</p>
              <p className="text-sm text-ink-3">
                Par {hole.par || "?"} · HCP {hole.strokeIndex ?? "?"}
                {strokesReceived && hole.par > 0 && <> · {strokesReceived[current]} Vorgabe</>}
              </p>
            </div>
            {props.editableHoleData && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-xs text-ink-3">
                  Par
                  <input
                    type="number"
                    inputMode="numeric"
                    className="no-spin mt-1 h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-base text-ink"
                    value={hole.par || ""}
                    onChange={(e) => setHole(current, { par: parseIntOrNull(e.target.value) ?? 0 })}
                  />
                </label>
                <label className="text-xs text-ink-3">
                  HCP (Stroke Index)
                  <input
                    type="number"
                    inputMode="numeric"
                    className="no-spin mt-1 h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-base text-ink"
                    value={hole.strokeIndex ?? ""}
                    onChange={(e) => setHole(current, { strokeIndex: parseIntOrNull(e.target.value) })}
                  />
                </label>
              </div>
            )}
            {mode === "strokes" ? (
              <>
                <label className="mt-3 block text-xs text-ink-3" htmlFor={`m-score-${current}`}>
                  Schläge
                </label>
                <input
                  id={`m-score-${current}`}
                  type="number"
                  inputMode="numeric"
                  className="no-spin tabular mt-1 h-14 w-full rounded-xl border border-border-strong bg-surface px-4 text-center text-2xl font-semibold text-ink"
                  value={typeof scores[current] === "number" ? String(scores[current]) : ""}
                  placeholder={scores[current] === "PICKUP" ? "X" : "–"}
                  onChange={(e) => setScore(current, parseIntOrNull(e.target.value))}
                />
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {quick.map((n) => (
                    <Button key={n} variant={scores[current] === n ? "primary" : "secondary"} onClick={() => setScore(current, n)}>
                      {n}
                    </Button>
                  ))}
                  <Button variant={scores[current] === "PICKUP" ? "primary" : "secondary"} onClick={() => setScore(current, "PICKUP")} title="Loch nicht beendet">
                    X
                  </Button>
                  {props.allowNotPlayed && (
                    <Button variant="ghost" onClick={() => setScore(current, null)} title="Loch nicht gespielt">
                      –
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <label className="mt-3 block text-xs text-ink-3" htmlFor={`m-pts-${current}`}>
                  Stablefordpunkte
                </label>
                <div className="mt-1 grid grid-cols-6 gap-2">
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <Button key={n} variant={points[current] === n ? "primary" : "secondary"} onClick={() => setPoints(current, n)}>
                      {n}
                    </Button>
                  ))}
                </div>
                <label className="mt-3 block text-xs text-ink-3">
                  Schläge (nur nötig, wenn 0 Punkte nicht eindeutig sind)
                  <input
                    type="number"
                    inputMode="numeric"
                    className="no-spin mt-1 h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-base text-ink"
                    value={typeof scores[current] === "number" ? String(scores[current]) : ""}
                    onChange={(e) => setScore(current, parseIntOrNull(e.target.value))}
                  />
                </label>
              </>
            )}
            {mode === "strokes" && ndbOf(current) !== null && (
              <p className="mt-3 text-sm text-ink-2">
                Netto-Doppelbogey: <strong>{ndbOf(current)}</strong>
                {scores[current] !== null && (
                  <>
                    {" "}
                    · WHS-Wertung: <strong>{adjusted(scores[current], ndbOf(current)).value ?? "–"}</strong>
                    {adjusted(scores[current], ndbOf(current)).reason && <span className="text-ink-3"> ({adjusted(scores[current], ndbOf(current)).reason})</span>}
                  </>
                )}
              </p>
            )}
            <div className="mt-4 flex justify-between">
              <Button variant="secondary" disabled={current === 0} onClick={() => setCurrent((c) => Math.max(0, c - 1))}>
                <ChevronLeft className="h-4 w-4" /> Zurück
              </Button>
              <Button disabled={current === holes.length - 1} onClick={() => setCurrent((c) => Math.min(holes.length - 1, c + 1))}>
                Weiter <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop/Tablet: Tabelle */}
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="tabular w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs text-ink-3">
            <tr>
              <th className="px-3 py-2 font-medium">Loch</th>
              <th className="px-3 py-2 font-medium">Par</th>
              <th className="px-3 py-2 font-medium">HCP</th>
              <th className="px-3 py-2 font-medium" title="Vorgabenschläge aus dem gerundeten Course Handicap">Vorgabe</th>
              {mode === "stableford" && <th className="px-3 py-2 font-medium">Punkte</th>}
              <th className="px-3 py-2 font-medium">{mode === "stableford" ? "Schläge (opt.)" : "Schläge"}</th>
              {mode === "strokes" && (
                <>
                  <th className="px-3 py-2 font-medium">NDB</th>
                  <th className="px-3 py-2 font-medium">WHS-Wertung</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {holes.map((h, i) => {
              const ndb = ndbOf(i);
              const a = adjusted(scores[i], ndb);
              return (
                <tr key={h.number} className="border-t border-border">
                  <td className="px-3 py-1.5 font-medium">{h.number}</td>
                  <td className="px-3 py-1.5">
                    {props.editableHoleData ? (
                      <input
                        type="number"
                        aria-label={`Par Loch ${h.number}`}
                        className="no-spin h-8 w-14 rounded-md border border-border-strong bg-surface px-2 text-ink"
                        value={h.par || ""}
                        onChange={(e) => setHole(i, { par: parseIntOrNull(e.target.value) ?? 0 })}
                      />
                    ) : (
                      h.par
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {props.editableHoleData ? (
                      <input
                        type="number"
                        aria-label={`Stroke Index Loch ${h.number}`}
                        className="no-spin h-8 w-14 rounded-md border border-border-strong bg-surface px-2 text-ink"
                        value={h.strokeIndex ?? ""}
                        onChange={(e) => setHole(i, { strokeIndex: parseIntOrNull(e.target.value) })}
                      />
                    ) : (
                      h.strokeIndex ?? "–"
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-ink-3">{strokesReceived && h.par > 0 ? strokesReceived[i] : "–"}</td>
                  {mode === "stableford" && (
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        aria-label={`Punkte Loch ${h.number}`}
                        className="no-spin h-8 w-14 rounded-md border border-border-strong bg-surface px-2 text-ink"
                        value={points[i] ?? ""}
                        onChange={(e) => setPoints(i, parseIntOrNull(e.target.value))}
                      />
                    </td>
                  )}
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`Schläge Loch ${h.number}`}
                        className="h-8 w-14 rounded-md border border-border-strong bg-surface px-2 text-ink"
                        value={scoreLabel(scores[i])}
                        placeholder="–"
                        onChange={(e) => {
                          const v = e.target.value.trim().toUpperCase();
                          setScore(i, v === "X" ? "PICKUP" : parseIntOrNull(v));
                        }}
                      />
                      {mode === "strokes" && (
                        <button
                          type="button"
                          className="rounded px-1.5 py-1 text-xs text-ink-3 hover:bg-surface-3"
                          onClick={() => setScore(i, "PICKUP")}
                          title="Loch nicht beendet (X)"
                        >
                          X
                        </button>
                      )}
                    </div>
                  </td>
                  {mode === "strokes" && (
                    <>
                      <td className="px-3 py-1.5 text-ink-3">{ndb ?? "–"}</td>
                      <td className="px-3 py-1.5">
                        {a.value ?? "–"}
                        {a.reason && <span className="ml-2 text-xs text-warning">{a.reason}</span>}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-border-strong bg-surface-2 font-semibold">
            <tr>
              <td className="px-3 py-2">Gesamt</td>
              <td className="px-3 py-2">{parTotal || "–"}</td>
              <td />
              <td className="px-3 py-2 text-ink-3">{strokesReceived ? strokesReceived.reduce((a, b) => a + b, 0) : "–"}</td>
              {mode === "stableford" && <td className="px-3 py-2">{pointsTotal}</td>}
              <td className="px-3 py-2">{mode === "strokes" ? (totals.complete ? totals.raw : "–") : ""}</td>
              {mode === "strokes" && (
                <>
                  <td />
                  <td className="px-3 py-2">GBE {totals.adj || "–"}</td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-ink-3">
        „X“ = Loch nicht beendet (wird mit Netto-Doppelbogey gewertet){props.allowNotPlayed ? ", leer = nicht gespielt" : ""}. Die Rohschläge
        bleiben unverändert gespeichert; die WHS-Wertung wird daneben angezeigt.
      </p>
    </div>
  );
}
