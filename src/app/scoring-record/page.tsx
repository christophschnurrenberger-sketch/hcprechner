import type { Metadata } from "next";
import { ScoringRecordView } from "./ScoringRecordView";

export const metadata: Metadata = { title: "Scoring Record" };

export default function ScoringRecordPage() {
  return <ScoringRecordView />;
}
