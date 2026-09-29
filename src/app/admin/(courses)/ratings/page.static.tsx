import type { Metadata } from "next";
import { WsRatings } from "@/components/admin/webspace/WebspaceAdminPages";

export const metadata: Metadata = { title: "Ratings" };

export default function RatingsPage() {
  return <WsRatings />;
}
