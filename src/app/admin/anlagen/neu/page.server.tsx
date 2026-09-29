import { requireAdminPage } from "@/server/adminAuth";
import { AdminNewCourse } from "@/components/admin/AdminCourseEditor";

export default async function NewCoursePage() {
  await requireAdminPage();
  return <AdminNewCourse />;
}
