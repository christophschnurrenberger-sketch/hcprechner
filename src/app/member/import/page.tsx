import type { Metadata } from "next";
import { ImportPage } from "@/components/member/pages/ImportPage";

export const metadata: Metadata = { title: "Runden importieren" };

export default function Page() {
  return <ImportPage />;
}
