import type { Metadata } from "next";
import { requireAdminPage } from "@/server/adminAuth";
import { loadAllCourses } from "@/server/courseRepository";
import { toRatingRows } from "@/lib/courses/adminViews";
import { RatingsView } from "@/components/admin/RatingsView";

export const metadata: Metadata = { title: "Ratings" };

export default async function RatingsPage() {
  await requireAdminPage("courses.read");
  return <RatingsView rows={toRatingRows(await loadAllCourses({ includeInactive: true }))} />;
}
