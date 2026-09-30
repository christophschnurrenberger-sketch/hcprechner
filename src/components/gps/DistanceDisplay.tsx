"use client";

import type { GreenTarget } from "@/lib/gps/distanceEngine";
import type { DistanceViewState, TargetDistanceView } from "@/lib/gps/distanceView";
import type { DistanceDisplay as Display } from "@/lib/gps/format";
import { gpsText } from "@/lib/gps/messages";
import { cn } from "@/lib/format";

/** Zahl + Einheit, für Sonnenlicht: sehr groß, fett, maximaler Kontrast; Vorlesetext statt nur der Zahl. */
function DistanceNumber({ display, size, dim }: { display: Display; size: "hero" | "row"; dim?: boolean }) {
  return (
    <span className={cn("tabular inline-flex items-baseline justify-center font-black leading-none tracking-tight text-ink", dim && "opacity-40")}>
      <span aria-hidden className="inline-flex items-baseline" style={{ fontSize: size === "hero" ? "clamp(5.5rem, 29vw, 9.5rem)" : "clamp(2.6rem, 12vw, 3.6rem)" }}>
        {display.prefix && <span className="mr-[0.12em] text-[0.5em] font-extrabold">{display.prefix}</span>}
        {display.value ?? "—"}
        <span className="ml-[0.12em] text-[0.38em] font-extrabold">{display.unit}</span>
      </span>
      <span className="sr-only">{display.spoken}</span>
    </span>
  );
}

/**
 * Entfernung zum Grün. Ohne Front/Back: eine große Zahl mit „MITTE GRÜN“.
 * Mit Front/Center/Back: drei Zeilen, das gewählte Ziel (Standard Mitte) hervorgehoben – Tippen wählt das Ziel.
 */
export function DistanceDisplay({ view, onSelectTarget }: { view: DistanceViewState; onSelectTarget: (target: GreenTarget) => void }) {
  const dim = view.stale || view.updating;
  if (view.targets.length <= 1) {
    return (
      <div className="flex flex-col items-center" data-distance-target={view.target}>
        <DistanceNumber display={view.display} size="hero" dim={dim} />
        <span aria-hidden className="mt-3 h-1 w-24 rounded-full bg-border-strong" />
        <p className="mt-3 text-lg font-bold uppercase tracking-[0.2em] text-ink-2">{gpsText(`target.${view.target}`)}</p>
      </div>
    );
  }
  return (
    <div role="group" aria-label={gpsText("distanceView")} className="flex w-full max-w-xs flex-col gap-2">
      {view.targets.map((t) => (
        <TargetRow key={t.target} row={t} dim={dim} onSelect={() => onSelectTarget(t.target)} />
      ))}
    </div>
  );
}

function TargetRow({ row, dim, onSelect }: { row: TargetDistanceView; dim: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={row.primary}
      data-distance-target={row.target}
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl border-2 px-4 text-left transition-colors",
        row.primary ? "border-brand bg-brand-soft py-4" : "border-border bg-surface py-2.5",
      )}
    >
      <span className={cn("font-bold uppercase tracking-[0.14em]", row.primary ? "text-base text-ink" : "text-sm text-ink-2")}>{gpsText(`target.short.${row.target}`)}</span>
      {row.primary ? <DistanceNumber display={row.display} size="row" dim={dim} /> : <span className={cn("tabular text-3xl font-extrabold text-ink", dim && "opacity-40")}>
        <span aria-hidden>
          {row.display.prefix ? `${row.display.prefix} ` : ""}
          {row.display.value ?? "—"}
          <span className="ml-1 text-base font-bold">{row.display.unit}</span>
        </span>
        <span className="sr-only">{row.display.spoken}</span>
      </span>}
    </button>
  );
}
