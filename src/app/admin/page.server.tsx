import { Download, FileSpreadsheet } from "lucide-react";
import { requireAdminPage } from "@/server/adminAuth";
import { lastImportRuns, loadAllCourses, recentChanges } from "@/server/courseRepository";
import { getDbHandle } from "@/db/client";
import { buildQualityReport } from "@/lib/courses/quality";
import { todayIso } from "@/lib/whs/dates";
import { AdminDashboardView, exportLinkClass } from "@/components/admin/AdminDashboardView";

export default async function AdminDashboard() {
  await requireAdminPage();
  let courses: Awaited<ReturnType<typeof loadAllCourses>> = [];
  let dbKind = "";
  let error: string | null = null;
  try {
    dbKind = (await getDbHandle()).kind;
    courses = await loadAllCourses({ includeInactive: true });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const runs = error ? [] : await lastImportRuns(5);
  const changes = error ? [] : await recentChanges(8);

  return (
    <AdminDashboardView
      report={buildQualityReport(courses, todayIso())}
      runs={runs.map((r) => ({ id: String(r.id), kind: r.kind, status: r.status, startedAt: r.startedAt.toISOString() }))}
      changes={changes.map((c) => ({ id: String(c.id), entityType: c.entityType, entityId: c.entityId, action: c.action, source: c.source, changes: null, createdAt: c.createdAt.toISOString() }))}
      storage={dbKind === "pglite" ? "eingebettetes PostgreSQL/PGlite" : dbKind === "postgres" ? "PostgreSQL" : "–"}
      error={error}
      emptyHint={
        <>
          Befüllen Sie die Datenbank mit dem Bayern-Importer (<code>npm run import:bavaria -- --apply</code>, benötigt Netzzugang zu
          bayerischer-golfverband.de) und ergänzen Sie verifizierte Ratings per CSV-Import oder Formular.
        </>
      }
      exportSlot={
        <>
          <a href="/api/admin/export?format=csv" className={exportLinkClass}>
            <FileSpreadsheet className="h-4 w-4" /> CSV (Importschema)
          </a>
          <a href="/api/admin/export?format=json" className={exportLinkClass}>
            <Download className="h-4 w-4" /> JSON (vollständig)
          </a>
          <a href="/api/admin/export?format=quality" className={exportLinkClass}>
            <Download className="h-4 w-4" /> Datenqualitätsbericht
          </a>
        </>
      }
    />
  );
}
