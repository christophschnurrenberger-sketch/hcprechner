import type { Metadata } from "next";
import { ToolsPage } from "@/components/member/pages/ToolsPage";

export const metadata: Metadata = { title: "Werkzeuge" };

export default function Page() {
  return <ToolsPage />;
}
