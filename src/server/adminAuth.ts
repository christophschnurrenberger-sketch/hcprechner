/**
 * Berechtigungen für die Golfplatzpflege der Node-Edition (Server-Seiten und Server Actions).
 * Grundlage ist die Sitzung (src/server/session.ts) – Rolle und Status kommen aus der Datenbank.
 */
import { redirect } from "next/navigation";
import type { UserRow } from "@/db/schema";
import { can, type Permission } from "@/lib/auth/permissions";
import { pageUser, roleOf, sessionUser } from "./session";

/** Für Seiten: ohne Anmeldung zur Anmeldung, ohne Berechtigung zurück in den Mitgliederbereich. */
export async function requireAdminPage(permission: Permission = "courses.read"): Promise<UserRow> {
  const { user } = await pageUser();
  if (!user) redirect("/login?next=/admin");
  if (!can(roleOf(user), "admin.access") || !can(roleOf(user), permission)) redirect("/member?denied=admin");
  return user;
}

/** Für Server Actions und Route Handler: wirft bei fehlender Berechtigung. */
export async function requireAdmin(permission: Permission = "courses.write"): Promise<UserRow> {
  const { user } = await sessionUser();
  if (!user || !can(roleOf(user), permission)) throw new Error("Dafür fehlt dir die Berechtigung.");
  return user;
}

export function actorName(user: Pick<UserRow, "firstName" | "lastName" | "email">): string {
  return `${user.firstName} ${user.lastName}`.trim() || user.email || "Admin";
}
