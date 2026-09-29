import type { Metadata } from "next";
import { Suspense } from "react";
import { RoundDetailPage } from "@/components/member/pages/RoundDetailPage";

export const metadata: Metadata = { title: "Runde" };

export default function Page() {
  return (
    <Suspense>
      <RoundDetailPage />
    </Suspense>
  );
}
