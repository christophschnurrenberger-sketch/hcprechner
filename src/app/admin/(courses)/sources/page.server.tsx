import type { Metadata } from "next";
import { requireAdminPage } from "@/server/adminAuth";
import { loadAllCourses } from "@/server/courseRepository";
import { toSourceRows } from "@/lib/courses/adminViews";
import { SourcesView } from "@/components/admin/RatingsView";

export const metadata: Metadata = { title: "Quellen" };

export default async function SourcesPage() {
  await requireAdminPage("courses.read");
  return <SourcesView rows={toSourceRows(await loadAllCourses({ includeInactive: true }))} />;
}
