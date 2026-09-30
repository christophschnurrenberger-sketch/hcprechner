"use client";

import { Loader2, SatelliteDish } from "lucide-react";
import type { GpsStatusView } from "@/lib/gps/format";
import { cn } from "@/lib/format";

/** GPS-Status: „GPS ● ±5 m“, „GPS ungenau ● ±28 m“, „GPS wird ermittelt…“, „Kein GPS-Signal“ (nie nur Farbe). */
export function GpsStatus({ gps, className }: { gps: GpsStatusView; className?: string }) {
  const tone = gps.kind === "ACTIVE" ? (gps.quality === "poor" ? "text-warning" : "text-good") : gps.kind === "NO_SIGNAL" || gps.kind === "UNAVAILABLE" ? "text-critical" : "text-ink-2";
  return (
    <p role="status" aria-live="polite" className={cn("inline-flex items-center justify-center gap-2 text-lg font-semibold", className)}>
      <span className="sr-only">{gps.spoken}</span>
      <span aria-hidden className={cn("inline-flex items-center gap-2", tone)}>
        {!gps.dot && (gps.kind === "ACQUIRING" || gps.kind === "ACTIVE") && <Loader2 className="h-5 w-5 animate-spin" />}
        {!gps.dot && gps.kind === "NO_SIGNAL" && <SatelliteDish className="h-5 w-5" />}
        {gps.label}
        {gps.dot && <span className="h-3.5 w-3.5 rounded-full bg-current" />}
      </span>
      {gps.detail && (
        <span aria-hidden className="tabular text-ink">
          {gps.detail}
        </span>
      )}
    </p>
  );
}
