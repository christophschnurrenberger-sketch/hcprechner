import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MemberShell } from "@/components/layout/MemberShell";

export const metadata: Metadata = { title: { default: "Mein Handicap", template: "%s · Golf HCP Rechner" }, robots: { index: false } };

/** Webspace-Edition: gate.php prüft die Sitzung vor der Auslieferung; die Daten liefert nur die API. */
export default function MemberLayout({ children }: { children: ReactNode }) {
  return <MemberShell>{children}</MemberShell>;
}
