import type { Metadata } from "next";
import { WsSources } from "@/components/admin/webspace/WebspaceAdminPages";

export const metadata: Metadata = { title: "Quellen" };

export default function SourcesPage() {
  return <WsSources />;
}
