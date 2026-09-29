import type { Metadata } from "next";
import { ToolsPage } from "@/components/member/pages/ToolsPage";

export const metadata: Metadata = { title: "Werkzeuge & Statistik" };

export default function Page() {
  return <ToolsPage />;
}
