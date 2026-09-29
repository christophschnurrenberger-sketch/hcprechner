import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminDashboardPage } from "@/components/admin/pages/AdminDashboardPage";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <Suspense>
      <AdminDashboardPage />
    </Suspense>
  );
}
