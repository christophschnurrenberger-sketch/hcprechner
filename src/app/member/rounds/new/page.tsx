import type { Metadata } from "next";
import { Suspense } from "react";
import { RoundWizardPage } from "@/components/member/wizard/RoundWizardPage";

export const metadata: Metadata = { title: "Runde erfassen" };

export default function Page() {
  return (
    <Suspense>
      <RoundWizardPage />
    </Suspense>
  );
}
