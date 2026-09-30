"use client";

import { StickyNote } from "lucide-react";
import { cn } from "@/lib/format";

/** Lochdaten für die Anzeige (eigene Runde oder freigegebene Runde eines Mitglieds). */
export interface ScorecardHole {
  number: number;
  par: number | null;
  strokeIndex?: number | null;
  score: number | null;
  putts: number | null;
  fir: boolean | null;
  gir: boolean | null;
  bunkerVisit: boolean | null;
  bunkerShots: number | null;
  sandSave: boolean | null;
  upAndDown: boolean | null;
  penaltyStrokes: number | null;
  note?: string | null;
}

function scoreClass(score: number | null, par: number | null): string {
  if (score === null || par === null) return "";
  const d = score - par;
  if (d <= -2) return "rounded-full ring-2 ring-[var(--series-low)] outline outline-1 outline-offset-2 outline-[var(--series-low)]";
  if (d === -1) return "rounded-full ring-2 ring-[var(--series-low)]";
  if (d === 0) return "";
  if (d === 1) return "rounded-sm ring-1 ring-border-strong";
  return "rounded-sm ring-2 ring-[var(--series-calculated)]";
}

function relText(score: number | null, par: number | null): string {
  if (score === null || par === null) return "";
  const d = score - par;
  return d === 0 ? "Par" : d < 0 ? `${d}` : `+${d}`;
}

function Mark({ value, label }: { value: boolean | null; label: string }) {
  if (value === null) return <span className="text-ink-3" aria-label={`${label}: keine Angabe`}>–</span>;
  return value ? (
    <span className="font-semibold text-good" aria-label={`${label}: ja`}>
      ✓
    </span>
  ) : (
    <span className="text-ink-3" aria-label={`${label}: nein`}>
      ✗
    </span>
  );
}

const sum = (xs: (number | null)[]) => (xs.some((x) => x !== null) ? xs.reduce<number>((a, x) => a + (x ?? 0), 0) : null);
const count = (xs: (boolean | null)[]) => {
  const known = xs.filter((x) => x !== null);
  return known.length ? `${known.filter(Boolean).length}/${known.length}` : "–";
};

function NineTable({ holes, label }: { holes: ScorecardHole[]; label: string }) {
  const rows: { key: string; label: string; cell: (h: ScorecardHole) => React.ReactNode; total: React.ReactNode }[] = [
    { key: "par", label: "Par", cell: (h) => h.par ?? "–", total: sum(holes.map((h) => h.par)) ?? "–" },
    { key: "si", label: "Hcp", cell: (h) => h.strokeIndex ?? "–", total: "" },
    {
      key: "score",
      label: "Schläge",
      cell: (h) => <span className={cn("inline-flex h-7 w-7 items-center justify-center font-semibold text-ink", scoreClass(h.score, h.par))}>{h.score ?? "–"}</span>,
      total: <span className="font-semibold text-ink">{sum(holes.map((h) => h.score)) ?? "–"}</span>,
    },
    { key: "putts", label: "Putts", cell: (h) => h.putts ?? "–", total: sum(holes.map((h) => h.putts)) ?? "–" },
    { key: "fir", label: "Fairway", cell: (h) => (h.par === 3 ? <span className="text-ink-3">·</span> : <Mark value={h.fir} label="Fairway" />), total: count(holes.filter((h) => h.par !== 3).map((h) => h.fir)) },
    { key: "gir", label: "GIR", cell: (h) => <Mark value={h.gir} label="GIR" />, total: count(holes.map((h) => h.gir)) },
    { key: "bunker", label: "Bunker", cell: (h) => (h.bunkerVisit ? (h.sandSave ? "S" : "B") : <span className="text-ink-3">–</span>), total: holes.filter((h) => h.bunkerVisit).length || "–" },
    { key: "pen", label: "Strafe", cell: (h) => (h.penaltyStrokes ? h.penaltyStrokes : h.penaltyStrokes === 0 ? "0" : "–"), total: sum(holes.map((h) => h.penaltyStrokes)) ?? "–" },
  ];
  return (
    <table className="w-full min-w-[40rem] text-center text-sm">
      <thead>
        <tr className="bg-surface-2 text-xs text-ink-3">
          <th scope="col" className="w-20 py-2 pl-3 text-left font-medium">
            Loch
          </th>
          {holes.map((h) => (
            <th key={h.number} scope="col" className="py-2 font-semibold text-ink">
              {h.number}
            </th>
          ))}
          <th scope="col" className="py-2 pr-3 font-semibold text-ink">
            {label}
          </th>
        </tr>
      </thead>
      <tbody className="tabular divide-y divide-border">
        {rows.map((r) => (
          <tr key={r.key}>
            <th scope="row" className="py-1.5 pl-3 text-left text-xs font-medium text-ink-3">
              {r.label}
            </th>
            {holes.map((h) => (
              <td key={h.number} className="py-1.5">
                {r.cell(h)}
              </td>
            ))}
            <td className="py-1.5 pr-3 font-medium">{r.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Scorekarte mit Lochstatistik: Desktop als Tabelle (je neun Löcher), Smartphone als Liste.
 * Legende: Kreis = unter Par, Quadrat = über Par, S = Sand Save, B = Bunker.
 */
export function Scorecard({ holes, showNotes = false }: { holes: ScorecardHole[]; showNotes?: boolean }) {
  const front = holes.filter((h) => h.number <= 9);
  const back = holes.filter((h) => h.number >= 10);
  const notes = showNotes ? holes.filter((h) => h.note) : [];
  return (
    <div className="space-y-4">
      <div className="hidden space-y-4 md:block">
        {front.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <NineTable holes={front} label={back.length ? "Out" : "Ges."} />
          </div>
        )}
        {back.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <NineTable holes={back} label={front.length ? "In" : "Ges."} />
          </div>
        )}
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface md:hidden">
        {holes.map((h) => (
          <li key={h.number} className="flex items-center gap-3 px-3 py-2.5">
            <span className="w-12 shrink-0">
              <span className="block text-sm font-semibold text-ink">Loch {h.number}</span>
              <span className="block text-xs text-ink-3">Par {h.par ?? "–"}</span>
            </span>
            <span className={cn("tabular inline-flex h-8 w-8 shrink-0 items-center justify-center text-base font-semibold text-ink", scoreClass(h.score, h.par))}>{h.score ?? "–"}</span>
            <span className="w-9 shrink-0 text-xs text-ink-3">{relText(h.score, h.par)}</span>
            <span className="flex min-w-0 flex-1 flex-wrap justify-end gap-x-3 gap-y-0.5 text-xs text-ink-2">
              {h.putts !== null && <span>{h.putts} Putts</span>}
              {h.par !== 3 && h.fir !== null && <span>FW {h.fir ? "✓" : "✗"}</span>}
              {h.gir !== null && <span>GIR {h.gir ? "✓" : "✗"}</span>}
              {h.bunkerVisit && <span>Bunker{h.sandSave ? " · Save" : ""}</span>}
              {(h.penaltyStrokes ?? 0) > 0 && <span className="text-critical">+{h.penaltyStrokes} Strafe</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-3">Kreis = unter Par · Quadrat = über Par · B = Bunker · S = Sand Save · ✓/✗ = ja/nein · – = keine Angabe</p>
      {notes.length > 0 && (
        <div className="space-y-1.5 rounded-xl bg-surface-2 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-ink">
            <StickyNote className="h-3.5 w-3.5" aria-hidden /> Notizen je Loch
          </p>
          {notes.map((h) => (
            <p key={h.number} className="text-ink-2">
              <span className="font-medium text-ink">Loch {h.number}:</span> {h.note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
