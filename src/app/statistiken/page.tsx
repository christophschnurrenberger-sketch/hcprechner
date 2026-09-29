import type { Metadata } from "next";
import { StatisticsView } from "./StatisticsView";

export const metadata: Metadata = { title: "Statistiken" };

export default function StatisticsPage() {
  return <StatisticsView />;
}
