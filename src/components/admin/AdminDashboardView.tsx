import Link from "next/link";
import type { ReactNode } from "react";
import { Plus, Upload } from "lucide-react";
import type { ChangeView, ImportRunView } from "@/lib/courses/adminViews";
import type { QualityReport } from "@/lib/courses/quality";
import { regionByKey } from "@/lib/courses/regions";
import { Alert, ButtonLink, Card, CardBody, CardHeader, PageHeader, Stat } from "@/components/ui";

const when = (iso: string) => new Date(iso).toLocaleString("de-DE");

/** Admin-Übersicht „Bayern Datenstatus“ – alle Zahlen aus den tatsächlichen Daten. */
export function AdminDashboardView({
  report,
  runs,
  changes,
  storage,
  error,
  emptyHint,
  exportSlot,
}: {
  report: QualityReport;
  runs: ImportRunView[];
  changes: ChangeView[];
  storage: string;
  error?: string | null;
  emptyHint: ReactNode;
  exportSlot: ReactNode;
}) {
  return (
    <>
      <PageHeader
        title="Bayern Datenstatus"
        description={`Alle Zahlen werden live aus den gespeicherten Daten berechnet (${storage}).`}
        actions={
          <>
            <ButtonLink href="/admin/anlagen/neu" size="sm">
              <Plus className="h-4 w-4" /> Anlage anlegen
            </ButtonLink>
            <ButtonLink href="/admin/import" size="sm" variant="secondary">
              <Upload className="h-4 w-4" /> CSV importieren
            </ButtonLink>
          </>
        }
      />
      {error && <Alert tone="error" title="Datenbank nicht erreichbar">{error}</Alert>}
      {report.facilities === 0 && !error && (
        <Alert tone="info" title="Noch keine Anlagen in der Datenbank" className="mb-5">
          {emptyHint}
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Anlagen entdeckt" value={report.golfFacilities} sub={`${report.drivingRanges} Übungsanlagen · ${report.inactive} inaktiv`} />
        <Stat label="Mit verifiziertem WHS-Rating" value={report.facilitiesWithVerifiedRating} />
        <Stat label="Ohne vollständiges Rating" value={report.facilitiesWithoutCompleteRating} tone={report.facilitiesWithoutCompleteRating ? "warning" : undefined} />
        <Stat label="Verifizierte Stammdaten" value={report.verifiedFacilities} sub={`${report.unverifiedFacilities} nicht verifiziert`} />
        <Stat label="Rating-Sets" value={report.ratingSets} sub={`${report.verifiedRatingSets} verifiziert`} />
        <Stat label="9-Loch-Rating-Sets" value={report.nineHoleRatingSets} />
        <Stat label="18-Loch-Rating-Sets" value={report.eighteenHoleRatingSets} />
        <Stat label="Anlagen mit mehreren Tee-Ratings" value={report.facilitiesWithMultipleTees} />
        <Stat label="Anlagen mit 18-Loch-Rating" value={report.facilitiesWith18HoleRating} />
        <Stat label="Anlagen mit 9-Loch-Rating" value={report.facilitiesWith9HoleRating} />
        <Stat label="Fehlende CR / Slope" value={`${report.missingCourseRating} / ${report.missingSlope}`} tone={report.missingCourseRating + report.missingSlope ? "warning" : undefined} />
        <Stat label="Duplikat-Verdacht" value={report.duplicates.length} tone={report.duplicates.length ? "warning" : undefined} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Nach Region" />
          <CardBody>
            <table className="tabular w-full text-sm">
              <thead className="text-left text-xs text-ink-3">
                <tr>
                  <th className="py-1 font-medium">Region</th>
                  <th className="py-1 text-right font-medium">Anlagen</th>
                  <th className="py-1 text-right font-medium">mit verifiziertem Rating</th>
                </tr>
              </thead>
              <tbody>
                {report.byRegion.map((r) => (
                  <tr key={r.region ?? "none"} className="border-t border-border">
                    <td className="py-1">{regionByKey(r.region)?.label ?? "ohne Region"}</td>
                    <td className="py-1 text-right">{r.facilities}</td>
                    <td className="py-1 text-right">{r.withVerifiedRating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.byRegion.length === 0 && <p className="text-sm text-ink-3">Keine Daten.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Export" subtitle="Golfplatzdatenbank sichern oder weitergeben" />
          <CardBody className="flex flex-wrap gap-2">{exportSlot}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Letzte Importe" />
          <CardBody>
            {runs.length === 0 ? (
              <p className="text-sm text-ink-3">Noch keine Importe.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {runs.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3">
                    <span>
                      {r.kind} · {r.status}
                    </span>
                    <span className="text-ink-3">{when(r.startedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Letzte Änderungen" action={<Link href="/admin/aenderungen" className="text-sm text-brand">alle</Link>} />
          <CardBody>
            {changes.length === 0 ? (
              <p className="text-sm text-ink-3">Keine Änderungen protokolliert.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {changes.map((c) => (
                  <li key={c.id} className="flex justify-between gap-3">
                    <span>
                      {c.entityType} · {c.action} <span className="text-ink-3">({c.source})</span>
                    </span>
                    <span className="text-ink-3">{when(c.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

export const exportLinkClass =
  "inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong px-3 text-sm font-medium hover:bg-surface-2";
