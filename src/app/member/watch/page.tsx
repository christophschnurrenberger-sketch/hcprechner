import type { Metadata } from "next";
import { WatchPreviewPage } from "@/components/gps/WatchPreview";

export const metadata: Metadata = { title: "Apple-Watch-Vorschau" };

export default function Page() {
  return <WatchPreviewPage />;
}
