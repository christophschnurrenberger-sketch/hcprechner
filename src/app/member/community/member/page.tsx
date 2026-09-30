import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicProfilePage } from "@/components/member/pages/PublicProfilePage";

export const metadata: Metadata = { title: "Mitglied" };

export default function Page() {
  return (
    <Suspense>
      <PublicProfilePage />
    </Suspense>
  );
}
