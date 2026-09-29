import { requireAdminPage } from "@/server/adminAuth";
import { loadAllCourses } from "@/server/courseRepository";
import { toDuplicateViews } from "@/lib/courses/adminViews";
import { DuplicatesView } from "@/components/admin/DuplicatesView";

export default async function DuplicatesPage() {
  await requireAdminPage("courses.read");
  return <DuplicatesView pairs={toDuplicateViews(await loadAllCourses())} />;
}
