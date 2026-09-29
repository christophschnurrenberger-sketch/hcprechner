import { requireAdminPage } from "@/server/adminAuth";
import { loadAllCourses } from "@/server/courseRepository";
import { buildQualityReport } from "@/lib/courses/quality";
import { todayIso } from "@/lib/whs/dates";
import { QualityView } from "@/components/admin/QualityView";

export default async function QualityPage() {
  await requireAdminPage();
  return <QualityView report={buildQualityReport(await loadAllCourses({ includeInactive: true }), todayIso())} />;
}
