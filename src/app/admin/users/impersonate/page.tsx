import type { Metadata } from "next";
import { Suspense } from "react";
import { ImpersonatePage } from "@/components/admin/pages/ImpersonatePage";

export const metadata: Metadata = { title: "Benutzeransicht" };

export default function Page() {
  return (
    <Suspense>
      <ImpersonatePage />
    </Suspense>
  );
}
