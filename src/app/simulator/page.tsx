import type { Metadata } from "next";
import { SimulatorView } from "./SimulatorView";

export const metadata: Metadata = { title: "HCP-Simulator" };

export default function SimulatorPage() {
  return <SimulatorView />;
}
