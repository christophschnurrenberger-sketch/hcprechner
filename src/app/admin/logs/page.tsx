import type { Metadata } from "next";
import { Suspense } from "react";
import { LogsPage } from "@/components/admin/pages/SystemPages";

export const metadata: Metadata = { title: "Audit-Log" };

export default function Page() {
  return (
    <Suspense>
      <LogsPage />
    </Suspense>
  );
}
