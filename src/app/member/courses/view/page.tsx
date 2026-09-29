import type { Metadata } from "next";
import { Suspense } from "react";
import { CourseDetailPage } from "@/components/member/pages/CourseDetailPage";

export const metadata: Metadata = { title: "Golfplatz" };

export default function Page() {
  return (
    <Suspense>
      <CourseDetailPage />
    </Suspense>
  );
}
