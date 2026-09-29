import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WebspaceAdminShell } from "@/components/admin/webspace/WebspaceAdminShell";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

/** Webspace-Edition: Anmeldung und Speichern über api/admin.php. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <WebspaceAdminShell>{children}</WebspaceAdminShell>;
}
