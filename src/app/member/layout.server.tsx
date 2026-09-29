import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { MemberShell } from "@/components/layout/MemberShell";
import { pageUser } from "@/server/session";

export const metadata: Metadata = { title: { default: "Mein Handicap", template: "%s · Golf HCP Rechner" }, robots: { index: false } };
export const dynamic = "force-dynamic";

/** Node-Edition: serverseitige Prüfung der Sitzung, bevor der Mitgliederbereich ausgeliefert wird. */
export default async function MemberLayout({ children }: { children: ReactNode }) {
  const { user, reason } = await pageUser();
  if (!user) redirect(`/login?next=/member${reason === "expired" ? "&expired=1" : reason === "disabled" ? "&disabled=1" : ""}`);
  return <MemberShell>{children}</MemberShell>;
}
