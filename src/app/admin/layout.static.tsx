import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · Golf HCP Rechner" }, robots: { index: false } };

/** Webspace-Edition: gate.php liefert den Admin-Bereich nur mit Berechtigung aus; api/admin.php prüft jede Aktion. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
