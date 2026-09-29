import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/dashboard/DashboardView";
import { CourseBySlugView } from "./CourseBySlugView";

export const metadata: Metadata = { title: "Golfplatz" };

/** Anlagen-Detailseite der Webspace-Edition (/golfplaetze/anlage?slug=…). */
export default function CourseBySlugPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CourseBySlugView />
    </Suspense>
  );
}
