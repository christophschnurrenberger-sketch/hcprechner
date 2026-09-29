import { Download, FileSpreadsheet } from "lucide-react";
import { requireAdminPage } from "@/server/adminAuth";
import { loadAllCourses } from "@/server/courseRepository";
import { missingSeedInDb } from "@/server/seedImport";
import { toAdminCourseRows } from "@/lib/courses/adminViews";
import { can } from "@/lib/auth/permissions";
import { roleOf } from "@/server/session";
import { AdminCourseList } from "@/components/admin/AdminCourseList";
import { CourseExportCard, exportLinkClass } from "@/components/admin/CourseDataTools";
import { SeedCard } from "@/components/admin/SeedCard";

export default async function AdminCoursesPage() {
  const user = await requireAdminPage("courses.read");
  const canWrite = can(roleOf(user), "import");
  const [courses, missing] = await Promise.all([loadAllCourses({ includeInactive: true }), canWrite ? missingSeedInDb() : Promise.resolve([])]);
  return (
    <div className="space-y-5">
      {canWrite && <SeedCard missing={missing.map((c) => ({ id: c.id, name: c.name, city: c.city }))} />}
      <AdminCourseList rows={toAdminCourseRows(courses)} />
      <CourseExportCard>
        <a href="/api/admin/export?format=csv" className={exportLinkClass}>
          <FileSpreadsheet className="h-4 w-4" /> CSV (Importschema)
        </a>
        <a href="/api/admin/export?format=json" className={exportLinkClass}>
          <Download className="h-4 w-4" /> JSON (vollständig)
        </a>
        <a href="/api/admin/export?format=quality" className={exportLinkClass}>
          <Download className="h-4 w-4" /> Datenqualitätsbericht
        </a>
      </CourseExportCard>
    </div>
  );
}
