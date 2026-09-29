import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/feedback";
import { CourseBySlugView } from "./CourseBySlugView";

export const metadata: Metadata = { title: "Golfplatz" };

/** Anlagen-Detailseite der Webspace-Edition (/golfplaetze/anlage?slug=…). */
export default function CourseBySlugPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <CourseBySlugView />
    </Suspense>
  );
}
