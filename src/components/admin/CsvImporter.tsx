"use client";

import { useActionState } from "react";
import { Download } from "lucide-react";
import { csvTemplate, CSV_OPTIONAL_COLUMNS, CSV_REQUIRED_COLUMNS } from "@/lib/courses/csv";
import { downloadText } from "@/lib/export/download";
import { cn, formatDecimal } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader } from "@/components/ui";
import { initialCsvState as initial } from "@/lib/courses/adminForm";
import { useAdminBackend } from "./AdminBackend";

const ACTION_TONE = { CREATE: "good", UPDATE: "info", UNCHANGED: "neutral", INVALID: "critical" } as const;
const ACTION_LABEL = { CREATE: "neu", UPDATE: "Änderung", UNCHANGED: "unverändert", INVALID: "Fehler" } as const;

export function CsvImporter() {
  const { previewCsv, applyCsv } = useAdminBackend();
  const [preview, previewAction, previewPending] = useActionState(previewCsv, initial);
  const [applied, applyAction, applyPending] = useActionState(applyCsv, initial);
  const plan = preview.plan;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="1. Datei auswählen"
          action={
            <Button size="sm" variant="ghost" onClick={() => downloadText("golfplaetze-import-vorlage.csv", csvTemplate(), "text/csv;charset=utf-8")}>
              <Download className="h-4 w-4" /> Vorlage
            </Button>
          }
        />
        <CardBody className="space-y-3">
          <p className="text-xs text-ink-3">
            Pflichtspalten: {CSV_REQUIRED_COLUMNS.join(", ")}. Optional: {CSV_OPTIONAL_COLUMNS.join(", ")}. Trennzeichen Komma, Semikolon oder Tab;
            Dezimalkomma oder -punkt.
          </p>
          <form action={previewAction} className="flex flex-wrap items-center gap-3">
            <input type="file" name="file" accept=".csv,text/csv" className="text-sm" required />
            <Button type="submit" disabled={previewPending}>
              {previewPending ? "Prüfe …" : "Vorschau erstellen"}
            </Button>
          </form>
          {preview.error && <Alert tone="error">{preview.error}</Alert>}
        </CardBody>
      </Card>

      {plan && (
        <Card>
          <CardHeader
            title="2. Vorschau"
            subtitle={`${plan.summary.total} Zeilen · ${plan.summary.create} neu · ${plan.summary.update} Änderungen · ${plan.summary.unchanged} unverändert · ${plan.summary.invalid} fehlerhaft · ${plan.summary.newCourses} neue Anlagen · ${plan.summary.newLayouts} neue Plätze`}
          />
          <CardBody className="space-y-3">
            {plan.missingColumns.length > 0 && <Alert tone="error">Fehlende Spalten: {plan.missingColumns.join(", ")}</Alert>}
            {plan.unknownColumns.length > 0 && <Alert tone="warning">Unbekannte Spalten werden ignoriert: {plan.unknownColumns.join(", ")}</Alert>}
            <div className="max-h-[32rem] overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 text-left text-ink-3">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Zeile</th>
                    <th className="px-2 py-1.5 font-medium">Aktion</th>
                    <th className="px-2 py-1.5 font-medium">Anlage</th>
                    <th className="px-2 py-1.5 font-medium">Platz</th>
                    <th className="px-2 py-1.5 font-medium">Rating</th>
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
                        {r.course.name}
                        <span className="ml-1 text-ink-3">{r.course.action === "CREATE" ? "(neu)" : ""}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        {r.layout.name}
                        <span className="ml-1 text-ink-3">{r.layout.action === "CREATE" ? "(neu)" : ""}</span>
                      </td>
                      <td className="tabular px-2 py-1.5">
                        {r.row
                          ? `${r.row.teeColor} ${r.row.gender === "F" ? "D" : "H"} ${r.row.holes}${r.row.nine ? (r.row.nine === "FRONT" ? "F" : "B") : ""} · CR ${formatDecimal(r.row.courseRating)} / ${r.row.slopeRating ?? "–"} · Par ${r.row.par ?? "–"}${r.row.verified ? " ✓" : ""}`
                          : "–"}
                      </td>
                      <td className="px-2 py-1.5">
                        {r.changes.map((c) => (
                          <div key={c.field}>
                            <strong>{c.field}</strong>: {String(c.from ?? "–")} → <span className="text-info">{String(c.to ?? "–")}</span>
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
              <Button type="submit" disabled={applyPending || plan.summary.create + plan.summary.update === 0}>
                {applyPending ? "Importiere …" : `3. Bestätigen und ${plan.summary.create + plan.summary.update} Zeilen importieren`}
              </Button>
              <span className="text-xs text-ink-3">Fehlerhafte Zeilen werden übersprungen. Jede Änderung wird protokolliert.</span>
            </form>
          </CardBody>
        </Card>
      )}

      {applied.error && <Alert tone="error">{applied.error}</Alert>}
      {applied.result && (
        <Alert tone="success" title="Import abgeschlossen">
          {applied.result.createdCourses} Anlagen, {applied.result.createdLayouts} Plätze, {applied.result.createdRatings} Ratings angelegt ·{" "}
          {applied.result.updatedRatings} Ratings aktualisiert · {applied.result.skipped} Zeilen übersprungen.
        </Alert>
      )}
    </div>
  );
}
