import type { ReactNode } from "react";
import { AdminBackendProvider } from "@/components/admin/AdminBackend";
import { requireAdminPage } from "@/server/adminAuth";
import {
  applyCsvAction,
  applyGreenCsvAction,
  importSeedAction,
  mergeCoursesAction,
  previewCsvAction,
  previewGreenCsvAction,
  saveCourseAction,
  saveGreensAction,
  saveHolesAction,
  saveLayoutAction,
  saveRatingSetAction,
  toggleRatingActiveAction,
  verifyRatingAction,
} from "../actions";

export const dynamic = "force-dynamic";

/** Node-Edition: Golfplatzpflege über Server Actions (Berechtigung wird in jeder Aktion geprüft). */
const backend = {
  saveCourse: saveCourseAction,
  saveLayout: saveLayoutAction,
  saveRatingSet: saveRatingSetAction,
  saveHoles: saveHolesAction,
  saveGreens: saveGreensAction,
  toggleRatingActive: toggleRatingActiveAction,
  verifyRating: verifyRatingAction,
  mergeCourses: mergeCoursesAction,
  previewCsv: previewCsvAction,
  applyCsv: applyCsvAction,
  previewGreenCsv: previewGreenCsvAction,
  applyGreenCsv: applyGreenCsvAction,
  importSeed: importSeedAction,
};

export default async function CourseAdminLayout({ children }: { children: ReactNode }) {
  await requireAdminPage("courses.read");
  return <AdminBackendProvider backend={backend}>{children}</AdminBackendProvider>;
}
