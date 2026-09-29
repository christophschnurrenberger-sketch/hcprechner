import type { Metadata } from "next";
import type { ReactNode } from "react";
import { adminMode, isAdmin } from "@/server/adminAuth";
import { Alert } from "@/components/ui";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminBackendProvider } from "@/components/admin/AdminBackend";
import {
  applyCsvAction,
  logoutAction,
  mergeCoursesAction,
  previewCsvAction,
  saveCourseAction,
  saveHolesAction,
  saveLayoutAction,
  saveRatingSetAction,
  toggleRatingActiveAction,
  verifyRatingAction,
} from "./actions";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Node-Edition: Schreibzugriffe über Server Actions. */
const backend = {
  saveCourse: saveCourseAction,
  saveLayout: saveLayoutAction,
  saveRatingSet: saveRatingSetAction,
  saveHoles: saveHolesAction,
  toggleRatingActive: toggleRatingActiveAction,
  verifyRating: verifyRatingAction,
  mergeCourses: mergeCoursesAction,
  previewCsv: previewCsvAction,
  applyCsv: applyCsvAction,
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const mode = adminMode();
  const authed = await isAdmin();
  return (
    <div className="space-y-5">
      {mode === "OPEN_DEV" && (
        <Alert tone="warning" title="Entwicklungsmodus">
          ADMIN_PASSWORD ist nicht gesetzt – der Admin-Bereich ist nur in der Entwicklung ohne Anmeldung erreichbar. In Produktion ist er ohne Passwort gesperrt.
        </Alert>
      )}
      {mode === "DISABLED" && (
        <Alert tone="error" title="Admin-Bereich gesperrt">
          Setzen Sie die Umgebungsvariable ADMIN_PASSWORD, um den Admin-Bereich zu aktivieren.
        </Alert>
      )}
      {authed && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AdminNav />
          {mode === "PROTECTED" && (
            <form action={logoutAction}>
              <button type="submit" className="text-sm text-ink-3 hover:text-ink">
                Abmelden
              </button>
            </form>
          )}
        </div>
      )}
      <AdminBackendProvider backend={backend}>{children}</AdminBackendProvider>
    </div>
  );
}
