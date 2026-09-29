import type { Metadata } from "next";
import { Suspense } from "react";
import { SystemPage } from "@/components/admin/pages/SystemPages";

export const metadata: Metadata = { title: "Systemstatus" };

export default function Page() {
  return (
    <Suspense>
      <SystemPage />
    </Suspense>
  );
}
