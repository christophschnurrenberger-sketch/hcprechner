"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, FileUp, Loader2 } from "lucide-react";
import { api, type ImportPreview } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import { downloadText } from "@/lib/export/download";
import { roundsCsvTemplate } from "@/lib/export/roundsCsv";
import { formatDate } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { useToast } from "@/components/ui/feedback";

/** Bisherige Runden aus einer CSV-Datei übernehmen (Vorschau, dann Import). */
export function ImportPage() {
  const router = useRouter();
  const toast = useToast();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(file: File) {
    setError(null);
    setPreview(null);
    setFileName(file.name);
    if (file.size > 2 * 1024 * 1024) {
      setError("Die Datei ist zu groß (maximal 2 MB).");
      return;
    }
    const text = await file.text();
    setCsv(text);
    setBusy(true);
    try {
      setPreview(await api.member.importPreview(text));
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Runden importieren" description="Übernimm bisherige Ergebnisse aus einer CSV-Datei, z. B. aus einer Tabelle. Der Handicap-Verlauf wird danach vollständig neu berechnet." />
      <Card>
        <CardHeader title="1. Datei auswählen" action={<Button variant="ghost" size="sm" onClick={() => downloadText("runden-vorlage.csv", roundsCsvTemplate(), "text/csv")}><Download className="h-4 w-4" aria-hidden /> Vorlage</Button>} />
        <CardBody className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border-strong bg-surface-2 px-6 py-10 text-center hover:border-brand-2">
            <FileUp className="h-8 w-8 text-brand" aria-hidden />
            <span className="font-medium text-ink">{fileName || "CSV-Datei auswählen"}</span>
            <span className="text-xs text-ink-3">Spalten siehe Vorlage (Datum, Platz, Course Rating, Slope, Par, GBE …)</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          </label>
          {busy && (
            <p className="flex items-center gap-2 text-sm text-ink-3">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Datei wird geprüft …
            </p>
          )}
          {error && <Alert tone="error">{error}</Alert>}
        </CardBody>
      </Card>

      {preview && (
        <Card>
          <CardHeader title="2. Vorschau prüfen" subtitle={`${preview.valid} von ${preview.rows.length} Zeilen können übernommen werden.`} />
          <CardBody className="space-y-4">
            {preview.missing.length > 0 && <Alert tone="error">Fehlende Spalten: {preview.missing.join(", ")}</Alert>}
            <div className="max-h-[28rem] overflow-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-2 text-left text-xs text-ink-3">
                  <tr>
                    <th className="px-3 py-2 font-medium">Zeile</th>
                    <th className="px-3 py-2 font-medium">Datum</th>
                    <th className="px-3 py-2 font-medium">Platz</th>
                    <th className="px-3 py-2 font-medium">Löcher</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.rows.map((r) => (
                    <tr key={r.rowNumber} className={r.errors.length ? "bg-critical-soft/40" : undefined}>
                      <td className="tabular px-3 py-2 text-ink-3">{r.rowNumber}</td>
                      <td className="tabular px-3 py-2">{formatDate(r.date)}</td>
                      <td className="px-3 py-2">{r.courseName ?? "–"}</td>
                      <td className="px-3 py-2">{r.holes ?? "–"}</td>
                      <td className="px-3 py-2">
                        {r.errors.length ? (
                          <span className="text-critical">{r.errors.join(" ")}</span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-1">
                            <Badge tone="good">ok</Badge>
                            {r.warnings.map((w) => (
                              <span key={w} className="text-xs text-warning">
                                {w}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              size="lg"
              disabled={busy || preview.valid === 0 || !csv}
              onClick={async () => {
                if (!csv) return;
                setBusy(true);
                try {
                  const res = await api.member.importRounds(csv);
                  toast(`${res.imported} ${res.imported === 1 ? "Runde" : "Runden"} importiert.`);
                  router.push("/member/rounds");
                } catch (e) {
                  setError(userMessage(e));
                  setBusy(false);
                }
              }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {preview.valid} {preview.valid === 1 ? "Runde" : "Runden"} importieren
            </Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
