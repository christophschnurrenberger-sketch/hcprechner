import type { Metadata } from "next";
import { Suspense } from "react";
import { RoundsListPage } from "@/components/admin/pages/RoundsPages";

export const metadata: Metadata = { title: "Runden" };

export default function Page() {
  return (
    <Suspense>
      <RoundsListPage />
    </Suspense>
  );
}
