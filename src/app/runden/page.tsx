import type { Metadata } from "next";
import { RoundsView } from "./RoundsView";

export const metadata: Metadata = { title: "Meine Runden" };

export default function RoundsPage() {
  return <RoundsView />;
}
