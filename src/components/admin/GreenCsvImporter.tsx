"use client";

import { useActionState } from "react";
import { Download } from "lucide-react";
import { initialGreenCsvState as initial } from "@/lib/courses/adminForm";
import { GREEN_CSV_COLUMNS, greenCsvTemplate } from "@/lib/courses/greenCsv";
import { downloadText } from "@/lib/export/download";
import { cn } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader } from "@/components/ui";
import { useAdminBackend } from "./AdminBackend";

const ACTION_TONE = { CREATE: "good", UPDATE: "info", UNCHANGED: "neutral", INVALID: "critical" } as const;
const ACTION_LABEL = { CREATE: "neu", UPDATE: "Änderung", UNCHANGED: "unverändert", INVALID: "Fehler" } as const;
const POINT_LABEL = { front: "Front", center: "Mitte", back: "Back" } as const;

/**
 * GPS-Grünkoordinaten per CSV: prüfen → Vorschau → nach Bestätigung übernehmen.
 * Ändert ausschließlich Grünkoordinaten – Ratings, Abschläge und Lochdaten bleiben unverändert.
 */
export function GreenCsvImporter() {
  const { previewGreenCsv, applyGreenCsv } = useAdminBackend();
  const [preview, previewAction, previewPending] = useActionState(previewGreenCsv, initial);
  const [applied, applyAction, applyPending] = useActionState(applyGreenCsv, initial);
  const plan = preview.plan;
  const changes = plan ? plan.summary.create + plan.summary.update : 0;

  return (
    <div className="space-y-5" data-green-csv>
      <Card>
        <CardHeader
          title="GPS-Grünkoordinaten (CSV)"
          subtitle="Je Zeile ein Loch. Leere Zellen lassen vorhandene Werte unverändert."
          action={
            <Button size="sm" variant="ghost" onClick={() => downloadText("gps-gruen-vorlage.csv", greenCsvTemplate(), "text/csv;charset=utf-8")}>
              <Download className="h-4 w-4" /> Vorlage
            </Button>
          }
        />
        <CardBody className="space-y-3">
          <p className="text-xs text-ink-3">
            Spalten: {GREEN_CSV_COLUMNS.join(", ")}. Pflicht: hole_number, course_id (ID oder Slug) oder course_name; bei mehreren Plätzen layout_id bzw. layout_name.
            Koordinaten in Dezimalgrad (Breite −90 bis 90, Länge −180 bis 180). Eine vorausgefüllte Liste aller Löcher gibt es in der Anlagenliste unter „Export“.
          </p>
          <form action={previewAction} className="flex flex-wrap items-center gap-3">
            <input type="file" name="file" accept=".csv,text/csv" className="text-sm" required aria-label="GPS-CSV-Datei" />
            <Button type="submit" disabled={previewPending}>
              {previewPending ? "Prüfe …" : "GPS-Vorschau erstellen"}
            </Button>
          </form>
          {preview.error && <Alert tone="error">{preview.error}</Alert>}
        </CardBody>
      </Card>

      {plan && (
        <Card>
          <CardHeader title="GPS-Vorschau" subtitle={`${plan.summary.total} Zeilen · ${plan.summary.create} neu · ${plan.summary.update} Änderungen · ${plan.summary.unchanged} unverändert · ${plan.summary.invalid} fehlerhaft`} />
          <CardBody className="space-y-3">
            {plan.missingColumns.length > 0 && <Alert tone="error">Fehlende Spalten: {plan.missingColumns.join(", ")}</Alert>}
            {plan.unknownColumns.length > 0 && <Alert tone="warning">Unbekannte Spalten werden ignoriert: {plan.unknownColumns.join(", ")}</Alert>}
            <div className="max-h-[28rem] overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 text-left text-ink-3">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Zeile</th>
                    <th className="px-2 py-1.5 font-medium">Aktion</th>
                    <th className="px-2 py-1.5 font-medium">Anlage / Platz</th>
                    <th className="px-2 py-1.5 font-medium">Loch</th>
                    <th className="px-2 py-1.5 font-medium">Änderungen / Hinweise</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((r) => (
                    <tr key={r.rowNumber} className={cn("border-t border-border align-top", r.action === "INVALID" && "bg-critical-soft/40")}>
                      <td className="px-2 py-1.5">{r.rowNumber}</td>
                      <td className="px-2 py-1.5">
                        <Badge tone={ACTION_TONE[r.action]}>{ACTION_LABEL[r.action]}</Badge>
                      </td>
                      <td className="px-2 py-1.5">
                        {r.courseName || "–"}
                        {r.layoutName && <span className="text-ink-3"> · {r.layoutName}</span>}
                      </td>
                      <td className="tabular px-2 py-1.5">{r.holeNumber ?? "–"}</td>
                      <td className="px-2 py-1.5">
                        {r.changes.map((c) => (
                          <div key={c.point} className="font-mono">
                            <strong className="font-sans">{POINT_LABEL[c.point]}</strong>: {c.from || "–"} → <span className="text-info">{c.to || "–"}</span>
                          </div>
                        ))}
                        {r.errors.map((e) => (
                          <div key={e} className="text-critical">
                            {e}
                          </div>
                        ))}
                        {r.warnings.map((w) => (
                          <div key={w} className="text-warning">
                            {w}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form action={applyAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="text" value={preview.text} />
              <Button type="submit" disabled={applyPending || changes === 0}>
                {applyPending ? "Übernehme …" : `Bestätigen und ${changes} Löcher übernehmen`}
              </Button>
              <span className="text-xs text-ink-3">Fehlerhafte Zeilen werden übersprungen. CR/Slope und Abschläge bleiben unverändert.</span>
            </form>
          </CardBody>
        </Card>
      )}

      {applied.error && <Alert tone="error">{applied.error}</Alert>}
      {applied.result && (
        <Alert tone="success" title="GPS-Import abgeschlossen">
          {applied.result.updatedHoles} Löcher auf {applied.result.layouts} Plätzen aktualisiert · {applied.result.skipped} Zeilen übersprungen.
        </Alert>
      )}
    </div>
  );
}
