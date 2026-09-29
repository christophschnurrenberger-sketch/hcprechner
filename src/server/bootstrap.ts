/**
 * Erstes Super-Admin-Konto der Node-Edition: aus ADMIN_EMAIL + ADMIN_PASSWORD (nur solange es noch kein
 * Super-Admin-Konto gibt) oder per `npm run user:create-admin`.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users, type UserRow } from "@/db/schema";
import { emailSchema, passwordSchema } from "@/lib/auth/validation";
import { audit } from "./audit";
import { createMemberDoc } from "./members";
import { hashPassword } from "./security";
import { countActiveSuperAdmins } from "./users";

let checked = false;

export async function createSuperAdmin(input: { email: string; password: string; firstName: string; lastName: string }): Promise<UserRow> {
  const email = emailSchema.parse(input.email);
  passwordSchema.parse(input.password);
  const db = await getDb();
  const now = new Date();
  const values = {
    email,
    firstName: input.firstName.trim() || "Admin",
    lastName: input.lastName.trim(),
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    emailVerified: true,
    emailVerifiedAt: now,
    mustChangePassword: false,
    passwordHash: await hashPassword(input.password),
    passwordChangedAt: now,
    updatedAt: now,
  };
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  const [row] = existing
    ? await db.update(users).set(values).where(eq(users.id, existing.id)).returning()
    : await db.insert(users).values(values).returning();
  await createMemberDoc(row.id);
  await audit("USER_CREATED", null, { userId: row.id, entityType: "user", entityId: row.id, newValue: { email, role: "SUPER_ADMIN", bootstrap: true } });
  return row;
}

/** Einmal pro Prozess: legt das Konto aus den Umgebungsvariablen an, falls noch kein Super-Admin existiert. */
export async function ensureBootstrapAdmin(): Promise<void> {
  if (checked) return;
  checked = true;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  try {
    if ((await countActiveSuperAdmins()) > 0) return;
    await createSuperAdmin({ email, password, firstName: process.env.ADMIN_FIRST_NAME ?? "Admin", lastName: process.env.ADMIN_LAST_NAME ?? "" });
    console.info(`Super-Admin-Konto ${email} angelegt (ADMIN_EMAIL/ADMIN_PASSWORD).`);
  } catch (error) {
    checked = false;
    console.error("Super-Admin-Konto konnte nicht angelegt werden", error);
  }
}
