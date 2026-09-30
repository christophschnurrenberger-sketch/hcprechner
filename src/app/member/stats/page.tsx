import type { Metadata } from "next";
import { StatsPage } from "@/components/member/pages/StatsPage";

export const metadata: Metadata = { title: "Statistik" };

export default function Page() {
  return <StatsPage />;
}
