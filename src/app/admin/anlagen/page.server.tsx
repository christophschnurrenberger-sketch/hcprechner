import { requireAdminPage } from "@/server/adminAuth";
import { loadAllCourses } from "@/server/courseRepository";
import { toAdminCourseRows } from "@/lib/courses/adminViews";
import { AdminCourseList } from "@/components/admin/AdminCourseList";

export default async function AdminCoursesPage() {
  await requireAdminPage();
  return <AdminCourseList rows={toAdminCourseRows(await loadAllCourses({ includeInactive: true }))} />;
}
