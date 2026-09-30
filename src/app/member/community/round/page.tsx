import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicRoundPage } from "@/components/member/pages/PublicRoundPage";

export const metadata: Metadata = { title: "Runde eines Mitglieds" };

export default function Page() {
  return (
    <Suspense>
      <PublicRoundPage />
    </Suspense>
  );
}
