import type { Metadata } from "next";
import { Suspense } from "react";
import { RoundAdminDetailPage } from "@/components/admin/pages/RoundsPages";

export const metadata: Metadata = { title: "Runde" };

export default function Page() {
  return (
    <Suspense>
      <RoundAdminDetailPage />
    </Suspense>
  );
}
