import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfilePage } from "@/components/member/pages/ProfilePage";

export const metadata: Metadata = { title: "Profil" };

export default function Page() {
  return (
    <Suspense>
      <ProfilePage />
    </Suspense>
  );
}
