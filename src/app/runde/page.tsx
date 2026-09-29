import type { Metadata } from "next";
import { Suspense } from "react";
import { RoundDetail } from "@/components/rounds/RoundDetail";
import { LoadingState } from "@/components/dashboard/DashboardView";

export const metadata: Metadata = { title: "Runden-Detail" };

/** Runden liegen im Browser – die ID kommt daher als Query-Parameter (?id=…). */
export default function RoundDetailPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <RoundDetail />
    </Suspense>
  );
}
