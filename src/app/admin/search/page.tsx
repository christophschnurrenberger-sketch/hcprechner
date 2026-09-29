import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchPage } from "@/components/admin/pages/SystemPages";

export const metadata: Metadata = { title: "Suche" };

export default function Page() {
  return (
    <Suspense>
      <SearchPage />
    </Suspense>
  );
}
