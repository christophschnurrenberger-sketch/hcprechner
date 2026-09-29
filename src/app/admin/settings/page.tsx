import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsPage } from "@/components/admin/pages/SystemPages";

export const metadata: Metadata = { title: "Einstellungen" };

export default function Page() {
  return (
    <Suspense>
      <SettingsPage />
    </Suspense>
  );
}
