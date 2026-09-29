import type { Metadata } from "next";
import { RoundsPage } from "@/components/member/pages/RoundsPage";

export const metadata: Metadata = { title: "Meine Runden" };

export default function Page() {
  return <RoundsPage />;
}
