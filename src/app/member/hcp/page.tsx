import type { Metadata } from "next";
import { HcpPage } from "@/components/member/pages/HcpPage";

export const metadata: Metadata = { title: "Mein Handicap" };

export default function Page() {
  return <HcpPage />;
}
