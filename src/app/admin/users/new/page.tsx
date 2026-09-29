import type { Metadata } from "next";
import { Suspense } from "react";
import { NewUserPage } from "@/components/admin/pages/UsersPages";

export const metadata: Metadata = { title: "Benutzer anlegen" };

export default function Page() {
  return (
    <Suspense>
      <NewUserPage />
    </Suspense>
  );
}
