import { Suspense } from "react";
import { DashboardPage } from "@/components/member/pages/DashboardPage";

export default function MemberHome() {
  return (
    <Suspense>
      <DashboardPage />
    </Suspense>
  );
}
