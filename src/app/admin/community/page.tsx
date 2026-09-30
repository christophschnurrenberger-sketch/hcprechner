import type { Metadata } from "next";
import { Suspense } from "react";
import { CommunityAdminPage } from "@/components/admin/pages/CommunityAdminPages";

export const metadata: Metadata = { title: "Community" };

export default function Page() {
  return (
    <Suspense>
      <CommunityAdminPage />
    </Suspense>
  );
}
