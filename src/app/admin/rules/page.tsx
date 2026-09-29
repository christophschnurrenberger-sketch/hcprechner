import type { Metadata } from "next";
import { Suspense } from "react";
import { RulesPage } from "@/components/admin/pages/SystemPages";

export const metadata: Metadata = { title: "Regeln & Engine" };

export default function Page() {
  return (
    <Suspense>
      <RulesPage />
    </Suspense>
  );
}
