import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/dashboard/DashboardView";
import { RecordRoundView } from "./RecordRoundView";

export const metadata: Metadata = { title: "Runde erfassen" };

export default function RecordRoundPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <RecordRoundView />
    </Suspense>
  );
}
