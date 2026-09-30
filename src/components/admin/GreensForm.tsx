"use client";

import { useActionState, useMemo, useState, type FormEvent } from "react";
import { ExternalLink, LocateFixed, Loader2 } from "lucide-react";
import { initialActionState as initial } from "@/lib/courses/adminForm";
import { formatCoordinatePair, greenCoverage, greenWarnings, holeGeoFor, maxHoleNumber, osmLink, parseCoordinatePair } from "@/lib/courses/geo";
import type { CourseDto, GeoPoint, LayoutDto } from "@/lib/courses/types";
import { GPS_CONFIG } from "@/lib/gps/config";
import { getLocationService, LocationError } from "@/lib/gps/locationService";
import { cn } from "@/lib/format";
import { Alert, Badge, Button } from "@/components/ui";
import { useAdminBackend } from "./AdminBackend";
import { useKeepValuesSubmit } from "./useKeepValuesSubmit";

const POINTS = [
  { key: "gf", label: "Front" },
  { key: "gc", label: "Mitte" },
  { key: "gb", label: "Back" },
] as const;

/**
 * GPS-Grünkoordinaten eines Platzes: je Loch Grün Mitte (Pflicht für die Entfernung), optional Front und Back.
 * Eingabe als „Breite, Länge“ (Einfügen aus Kartendiensten) oder per „aktuelle Position“ direkt am Grün.
 * Koordinaten werden nie geschätzt; ungültige Werte werden nicht gespeichert.
 */
export function GreensForm({ course, layout }: { course: CourseDto; layout: LayoutDto }) {
  const { saveGreens } = useAdminBackend();
  const [state, action, pending] = useActionState(saveGreens, initial);
  const dispatch = useKeepValuesSubmit(action);
  const count = maxHoleNumber(layout);
  const holeNumbers = useMemo(() => Array.from({ length: count }, (_, i) => i + 1), [count]);
  const parByHole = useMemo(() => new Map(layout.holes.filter((h) => h.gender === null && h.teeColor === null).map((h) => [h.holeNumber, h.par])), [layout.holes]);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const n of holeNumbers) {
      const g = holeGeoFor(layout, n)?.green;
      v[`gf_${n}`] = formatCoordinatePair(g?.front);
      v[`gc_${n}`] = formatCoordinatePair(g?.center);
      v[`gb_${n}`] = formatCoordinatePair(g?.back);
    }
    return v;
  });
  const [sources, setSources] = useState<Record<number, string>>(() => Object.fromEntries(holeNumbers.map((n) => [n, holeGeoFor(layout, n)?.source ?? ""])));
  const [frontBack, setFrontBack] = useState(() => layout.holeGeo.some((g) => g.green.front || g.green.back));
  const [capturing, setCapturing] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, { text: string; tone: "good" | "warning" | "critical" }>>({});
  /** Werte beim letzten Absenden: Fehlermeldungen gelten nur, solange das Feld unverändert ist */
  const [submitted, setSubmitted] = useState<Record<string, string>>({});
  const coverage = greenCoverage(layout);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    setSubmitted(values);
    dispatch(e);
  };
  const fieldError = (field: string) => (state.fieldErrors?.[field] && values[field] === submitted[field] ? state.fieldErrors[field] : undefined);

  const setValue = (field: string, value: string, hole: number, source: "MANUAL" | "DEVICE_GPS") => {
    setValues((v) => ({ ...v, [field]: value }));
    setSources((s) => ({ ...s, [hole]: source }));
  };

  async function capture(field: string, hole: number, label: string) {
    setCapturing(field);
    setNotes((n) => ({ ...n, [field]: { text: "Position wird ermittelt …", tone: "warning" } }));
    try {
      const fix = await getLocationService().getCurrentPosition({ maxAgeMs: 0 });
      const acc = Math.round(fix.accuracy);
      if (fix.accuracy > GPS_CONFIG.adminCaptureMaxAccuracy && !window.confirm(`Loch ${hole} ${label}: GPS-Genauigkeit nur ±${acc} m. Trotzdem übernehmen?`)) {
        setNotes((n) => ({ ...n, [field]: { text: `Nicht übernommen (±${acc} m)`, tone: "warning" } }));
        return;
      }
      setValue(field, formatCoordinatePair(fix), hole, "DEVICE_GPS");
      setNotes((n) => ({ ...n, [field]: { text: `Aktuelle Position übernommen (±${acc} m) – noch nicht gespeichert`, tone: acc <= GPS_CONFIG.adminCaptureMaxAccuracy ? "good" : "warning" } }));
    } catch (error) {
      const text = error instanceof LocationError && error.kind === "PERMISSION_DENIED" ? "Standortzugriff verweigert" : error instanceof LocationError && error.kind === "INSECURE" ? "Standort nur über HTTPS verfügbar" : "Keine GPS-Position verfügbar";
      setNotes((n) => ({ ...n, [field]: { text, tone: "critical" } }));
    } finally {
      setCapturing(null);
    }
  }

  const livePoint = (field: string): GeoPoint | null => {
    const p = parseCoordinatePair(values[field]);
    return p && p !== "INVALID" ? p : null;
  };

  return (
    <form onSubmit={submit} className="space-y-3" data-greens-form={layout.id}>
      <input type="hidden" name="layoutId" value={layout.id} />
      <input type="hidden" name="count" value={count} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-semibold">Green GPS: </span>
          {coverage.level === "NONE" ? (
            <span className="text-ink-3">noch keine Daten</span>
          ) : (
            <Badge tone={coverage.level === "COMPLETE" ? "good" : "warning"}>
              {coverage.withCenter}/{coverage.holes} {coverage.level === "COMPLETE" ? "✓" : "⚠"}
            </Badge>
          )}
          {coverage.level === "PARTIAL" && <span className="ml-2 text-ink-3">GPS-Daten fehlen: Loch {coverage.missing.join(", ")}</span>}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={frontBack} onChange={(e) => setFrontBack(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Front/Back erfassen
        </label>
      </div>
      <p className="text-xs text-ink-3">
        Je Loch „Breite, Länge“ in Dezimalgrad (z. B. 47.941234, 10.312345 – aus Kartendiensten einfügbar) oder am Grün stehend <LocateFixed className="inline h-3 w-3" aria-hidden /> für die
        aktuelle Position. Nie schätzen – leere Felder bleiben leer. Ein Grün gilt für alle Abschläge.
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead className="text-xs text-ink-3">
            <tr>
              <th className="px-1 py-1 text-left font-medium">Loch</th>
              <th className="px-1 py-1 font-medium">Par</th>
              {POINTS.map((p) => (
                <th key={p.key} className={cn("px-1 py-1 text-left font-medium", p.key !== "gc" && !frontBack && "hidden")}>
                  Grün {p.label}
                </th>
              ))}
              <th className="px-1 py-1 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {holeNumbers.map((n) => {
              const center = livePoint(`gc_${n}`);
              const warnings = greenWarnings({ front: livePoint(`gf_${n}`), center, back: livePoint(`gb_${n}`) }, course);
              return (
                <tr key={n} className="align-top">
                  <td className="px-1 py-1 font-semibold tabular">{n}</td>
                  <td className="px-1 py-1 text-center tabular text-ink-2">{parByHole.get(n) ?? "–"}</td>
                  {POINTS.map((p) => (
                    <PointCell
                      key={p.key}
                      hidden={p.key !== "gc" && !frontBack}
                      field={`${p.key}_${n}`}
                      label={`Loch ${n} Grün ${p.label}`}
                      value={values[`${p.key}_${n}`] ?? ""}
                      error={fieldError(`${p.key}_${n}`)}
                      note={notes[`${p.key}_${n}`]}
                      busy={capturing === `${p.key}_${n}`}
                      onChange={(v) => setValue(`${p.key}_${n}`, v, n, "MANUAL")}
                      onCapture={() => void capture(`${p.key}_${n}`, n, p.label)}
                    />
                  ))}
                  <td className="px-1 py-1 text-xs">
                    <input type="hidden" name={`src_${n}`} value={sources[n] ?? ""} />
                    {center ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-good">✓</span>
                        <a href={osmLink(center)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand underline">
                          Karte <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      </span>
                    ) : (
                      <span className="text-warning">GPS-Daten fehlen</span>
                    )}
                    {warnings.map((w) => (
                      <span key={w} className="block text-warning">
                        {w}
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Speichert …" : "GPS-Daten speichern"}
      </Button>
    </form>
  );
}

function PointCell({
  hidden,
  field,
  label,
  value,
  error,
  note,
  busy,
  onChange,
  onCapture,
}: {
  hidden: boolean;
  field: string;
  label: string;
  value: string;
  error?: string;
  note?: { text: string; tone: "good" | "warning" | "critical" };
  busy: boolean;
  onChange: (v: string) => void;
  onCapture: () => void;
}) {
  // Ausgeblendete Front/Back-Felder werden trotzdem gesendet (vorhandene Werte bleiben erhalten)
  return (
    <td className={cn("px-1 py-1", hidden && "hidden")}>
      <div className="flex items-center gap-1">
        <input
          name={field}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          inputMode="decimal"
          autoComplete="off"
          placeholder="Breite, Länge"
          className={cn("h-9 w-52 rounded border bg-surface px-2 font-mono text-xs", error ? "border-critical" : "border-border-strong")}
        />
        <button type="button" onClick={onCapture} disabled={busy} aria-label={`${label}: aktuelle GPS-Position verwenden`} title="GPS-Position verwenden" className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border-strong text-brand hover:bg-surface-2 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LocateFixed className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {error && <p className="mt-0.5 max-w-60 text-xs text-critical">{error}</p>}
      {note && <p className={cn("mt-0.5 max-w-60 text-xs", note.tone === "good" ? "text-good" : note.tone === "warning" ? "text-warning" : "text-critical")}>{note.text}</p>}
    </td>
  );
}
