import type { Metadata } from "next";
import { Suspense } from "react";
import { CommunityPage } from "@/components/member/pages/CommunityPage";

export const metadata: Metadata = { title: "Community" };

export default function Page() {
  return (
    <Suspense>
      <CommunityPage />
    </Suspense>
  );
}
