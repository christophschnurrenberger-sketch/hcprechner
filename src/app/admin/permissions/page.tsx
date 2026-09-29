import type { Metadata } from "next";
import { Suspense } from "react";
import { PermissionsPage } from "@/components/admin/pages/SystemPages";

export const metadata: Metadata = { title: "Rollen & Rechte" };

export default function Page() {
  return (
    <Suspense>
      <PermissionsPage />
    </Suspense>
  );
}
