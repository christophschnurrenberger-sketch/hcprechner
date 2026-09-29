import type { Metadata } from "next";
import { GbeCalculatorView } from "./GbeCalculatorView";

export const metadata: Metadata = { title: "GBE-Rechner" };

export default function GbeCalculatorPage() {
  return <GbeCalculatorView />;
}
