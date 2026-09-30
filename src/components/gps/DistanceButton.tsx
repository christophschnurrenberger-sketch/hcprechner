"use client";

import { Target } from "lucide-react";
import type { DistanceViewState } from "@/lib/gps/distanceView";
import { gpsText } from "@/lib/gps/messages";
import { cn } from "@/lib/format";

/**
 * Schnellzugriff „◎ 151 m“ im Fußbereich der Scorecard (nur während einer aktiven Runde auf einem Platz mit
 * Grün-Koordinaten). Ein Tipp öffnet den Distance-Screen; ohne aktive Messung steht dort „Distanz“.
 */
export function DistanceButton({ view, onOpen }: { view: DistanceViewState; onOpen: () => void }) {
  const d = view.display;
  const running = view.gps.kind === "ACTIVE" || view.gps.kind === "ACQUIRING" || view.gps.kind === "NO_SIGNAL";
  const showValue = running && d.value !== null && !view.updating;
  const label = showValue ? `${d.prefix ? `${d.prefix} ` : ""}${d.value} ${d.unit}` : running ? "— " + d.unit : gpsText("fab.idle");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${gpsText("fab.open")}${showValue ? `: ${d.spoken}` : ""}`}
      data-distance-button
      className={cn(
        "tabular flex h-14 min-w-[6.75rem] shrink-0 items-center justify-center gap-1.5 rounded-2xl border-2 border-brand bg-surface px-3 text-lg font-extrabold text-brand active:bg-brand-soft",
        view.stale && "opacity-60",
      )}
    >
      <Target className="h-5 w-5 shrink-0" aria-hidden />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
