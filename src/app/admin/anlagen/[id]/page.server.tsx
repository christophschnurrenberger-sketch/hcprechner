import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/adminAuth";
import { getCourse } from "@/server/courseRepository";
import { AdminCourseEditor } from "@/components/admin/AdminCourseEditor";

export default async function EditCoursePage(props: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await props.params;
  const course = await getCourse(id);
  if (!course) notFound();
  return <AdminCourseEditor course={course} />;
}
