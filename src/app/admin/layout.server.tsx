import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { can } from "@/lib/auth/permissions";
import { pageUser, roleOf } from "@/server/session";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · Golf HCP Rechner" }, robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Node-Edition: Der Admin-Bereich wird nur mit Sitzung und Berechtigung „admin.access“ ausgeliefert.
 * Jede Admin-API prüft ihre Einzelberechtigung zusätzlich selbst.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = await pageUser();
  if (!user) redirect("/login?next=/admin");
  if (!can(roleOf(user), "admin.access")) redirect("/member?denied=admin");
  return <AdminShell>{children}</AdminShell>;
}
