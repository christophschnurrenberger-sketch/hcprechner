"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, LocateFixed, LocateOff, MapPinOff, SatelliteDish, Watch } from "lucide-react";
import type { GreenTarget } from "@/lib/gps/distanceEngine";
import type { DistanceViewState } from "@/lib/gps/distanceView";
import { gpsText } from "@/lib/gps/messages";
import { cn } from "@/lib/format";
import { BigButton, BottomSheet } from "@/components/member/mobile/ui";
import { DistanceDisplay } from "./DistanceDisplay";
import { GpsStatus } from "./GpsStatus";

export interface DistanceHole {
  number: number;
  par: number | null;
}

export interface DistanceScreenProps {
  view: DistanceViewState;
  /** Löcher der Runde in Spielreihenfolge */
  holes: DistanceHole[];
  /** Loch der Scorecard (für den Hinweis, wenn in der Entfernung ein anderes Loch gewählt ist) */
  scorecardHole: number | null;
  courseName: string;
  onHole: (holeNumber: number) => void;
  onTarget: (target: GreenTarget) => void;
  onActivate: () => void;
  onClose: () => void;
  /** Apple Watch über die iPhone-App verbunden (nur in der nativen Hülle) */
  watchConnected?: boolean;
}

/**
 * Distance-Screen der laufenden Runde. Reihenfolge der Informationen: Distanz, Loch, Ziel, GPS-Status.
 * Keine Score-, HCP- oder Statistikdaten; die Scorecard ist immer mit einem Tipp erreichbar.
 */
export function DistanceScreen({ view, holes, scorecardHole, courseName, onHole, onTarget, onActivate, onClose, watchConnected }: DistanceScreenProps) {
  const [picker, setPicker] = useState(false);
  const index = holes.findIndex((h) => h.number === view.hole);
  const hole = index >= 0 ? holes[index] : null;
  const prev = index > 0 ? holes[index - 1] : null;
  const next = index >= 0 && index < holes.length - 1 ? holes[index + 1] : null;
  const announcement = useDistanceAnnouncement(view);
  const scorecardLabel = view.gps.kind === "NO_SIGNAL" && view.display.value === null ? gpsText("openScorecard") : gpsText("scorecard");

  let body: ReactNode;
  if (view.gps.kind === "PERMISSION_REQUIRED") {
    body = (
      <Panel icon={<LocateFixed className="h-10 w-10 text-brand" aria-hidden />} title={gpsText("permission.title")}>
        <p>{gpsText("permission.text")}</p>
        <p className="mt-2 text-sm text-ink-3">{gpsText("permission.privacy")}</p>
        <BigButton className="mt-5" onClick={onActivate}>
          {gpsText("permission.enable")}
        </BigButton>
      </Panel>
    );
  } else if (view.gps.kind === "DENIED") {
    body = (
      <Panel icon={<LocateOff className="h-10 w-10 text-critical" aria-hidden />} title={gpsText("denied.title")}>
        <p>{gpsText("denied.text")}</p>
        <BigButton className="mt-5" variant="secondary" onClick={onActivate}>
          {gpsText("retry")}
        </BigButton>
      </Panel>
    );
  } else if (view.gps.kind === "RESTRICTED" || view.gps.kind === "UNAVAILABLE") {
    body = (
      <Panel icon={<LocateOff className="h-10 w-10 text-ink-3" aria-hidden />} title={gpsText(view.gps.kind === "RESTRICTED" ? "restricted.title" : "unavailable.title")}>
        <p>{gpsText(view.gps.kind === "RESTRICTED" ? "restricted.text" : "unsupported.text")}</p>
        <p className="mt-2 text-sm text-ink-3">{gpsText("unavailable.text")}</p>
      </Panel>
    );
  } else if (view.noGreen) {
    body = (
      <Panel icon={<MapPinOff className="h-10 w-10 text-ink-3" aria-hidden />} title={gpsText("noGreen")}>
        <p className="text-ink-3">{gpsText("noGreen.hint")}</p>
      </Panel>
    );
  } else if (view.gps.kind === "NO_SIGNAL" && view.display.value === null) {
    body = (
      <Panel icon={<SatelliteDish className="h-10 w-10 text-critical" aria-hidden />} title={gpsText("unavailable.title")}>
        <p>{gpsText("unavailable.text")}</p>
        <BigButton className="mt-5" variant="secondary" onClick={onActivate}>
          {gpsText("retry")}
        </BigButton>
      </Panel>
    );
  } else if (view.hole === null) {
    body = <Panel title={gpsText("noHole")}>{null}</Panel>;
  } else {
    body = (
      <div className="flex w-full flex-col items-center gap-6">
        <DistanceDisplay view={view} onSelectTarget={onTarget} />
        {view.far && <p className="max-w-xs text-center text-base font-medium text-warning">{gpsText("far")}</p>}
        <GpsStatus gps={view.gps} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-surface text-ink" data-distance-screen role="region" aria-label={gpsText("distanceView")}>
      <header className="shrink-0 border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-1 px-1">
          <button type="button" onClick={onClose} aria-label={gpsText("openScorecard")} className="flex h-12 shrink-0 items-center gap-1 rounded-full px-3 text-base font-semibold text-ink hover:bg-surface-3">
            <ArrowLeft className="h-6 w-6" aria-hidden /> {gpsText("backToRound")}
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-[13px] text-ink-3">{courseName}</p>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center" aria-hidden={!watchConnected}>
            {watchConnected && <Watch className="h-5 w-5 text-good" aria-label="Apple Watch verbunden" />}
          </span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-5 py-4">
        <button type="button" onClick={() => setPicker(true)} aria-label={`${gpsText("hole.select")}: ${gpsText("hole", { n: view.hole ?? "–" })}`} className="flex flex-col items-center rounded-2xl px-6 py-1 active:bg-surface-3">
          <span className="inline-flex items-center gap-1 text-2xl font-extrabold uppercase tracking-[0.12em]" data-distance-hole={view.hole ?? ""}>
            {gpsText("hole", { n: view.hole ?? "–" })}
            <ChevronDown className="h-5 w-5 text-ink-3" aria-hidden />
          </span>
          {hole?.par ? <span className="text-lg font-semibold uppercase tracking-[0.12em] text-ink-2">{gpsText("par", { par: hole.par })}</span> : null}
        </button>
        {scorecardHole !== null && view.hole !== scorecardHole && (
          <button type="button" onClick={() => onHole(scorecardHole)} className="-mt-3 h-10 rounded-full px-3 text-sm font-medium text-brand underline">
            {gpsText("hole.backToScorecard", { n: scorecardHole })}
          </button>
        )}
        {body}
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </main>

      <footer className="shrink-0 space-y-2 border-t border-border px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <BigButton onClick={onClose}>{scorecardLabel}</BigButton>
        <div className="grid grid-cols-2 gap-2">
          <BigButton variant="secondary" onClick={() => prev && onHole(prev.number)} disabled={!prev} ariaLabel={prev ? `${gpsText("hole.prev")}: ${gpsText("hole", { n: prev.number })}` : gpsText("hole.prev")}>
            <ArrowLeft className="h-5 w-5" aria-hidden /> {prev && gpsText("hole", { n: prev.number })}
          </BigButton>
          <BigButton variant="secondary" onClick={() => next && onHole(next.number)} disabled={!next} ariaLabel={next ? `${gpsText("hole.next")}: ${gpsText("hole", { n: next.number })}` : gpsText("hole.next")}>
            {next && gpsText("hole", { n: next.number })} <ArrowRight className="h-5 w-5" aria-hidden />
          </BigButton>
        </div>
      </footer>

      <BottomSheet open={picker} onClose={() => setPicker(false)} title={gpsText("hole.select")}>
        <div className="grid grid-cols-6 gap-2 pb-2">
          {holes.map((h) => (
            <button
              key={h.number}
              type="button"
              aria-pressed={h.number === view.hole}
              onClick={() => {
                onHole(h.number);
                setPicker(false);
              }}
              className={cn("flex h-14 items-center justify-center rounded-2xl border-2 text-lg font-bold", h.number === view.hole ? "border-brand bg-brand text-white dark:text-[#0d1510]" : "border-border bg-surface text-ink")}
            >
              {h.number}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}

function Panel({ icon, title, children }: { icon?: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center text-center text-base text-ink-2">
      {icon}
      <h2 className="mt-3 text-xl font-bold text-ink">{title}</h2>
      <div className="mt-2 w-full">{children}</div>
    </div>
  );
}

/**
 * Vorlesetext für Screenreader: nicht bei jeder Messung, sondern bei Lochwechsel, anderem Ziel oder
 * einer Änderung von mindestens 10 Einheiten – sonst würde VoiceOver ständig sprechen.
 */
function useDistanceAnnouncement(view: DistanceViewState): string {
  const last = useRef<{ hole: number | null; target: GreenTarget; value: number | null } | null>(null);
  const [text, setText] = useState("");
  const rounded = view.display.rounded;
  useEffect(() => {
    const prev = last.current;
    const changed = !prev || prev.hole !== view.hole || prev.target !== view.target || (rounded !== null && (prev.value === null || Math.abs(prev.value - rounded) >= 10));
    if (!changed || rounded === null || view.updating) return;
    last.current = { hole: view.hole, target: view.target, value: rounded };
    const id = setTimeout(() => setText(`${gpsText("hole", { n: view.hole ?? "–" })}: ${view.display.spoken}`), 0);
    return () => clearTimeout(id);
  }, [view.hole, view.target, rounded, view.updating, view.display.spoken]);
  return text;
}
