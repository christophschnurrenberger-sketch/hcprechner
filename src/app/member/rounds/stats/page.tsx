import type { Metadata } from "next";
import { Suspense } from "react";
import { RoundStatsPage } from "@/components/member/pages/RoundStatsPage";

export const metadata: Metadata = { title: "Statistik ergänzen" };

export default function Page() {
  return (
    <Suspense>
      <RoundStatsPage />
    </Suspense>
  );
}
