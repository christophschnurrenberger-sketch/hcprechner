import type { Metadata } from "next";
import { Suspense } from "react";
import { UserDetailPage } from "@/components/admin/pages/UsersPages";

export const metadata: Metadata = { title: "Benutzer" };

export default function Page() {
  return (
    <Suspense>
      <UserDetailPage />
    </Suspense>
  );
}
