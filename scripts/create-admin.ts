/**
 * Super-Admin-Konto anlegen oder zurücksetzen (Node-Edition).
 *
 *   npm run user:create-admin -- --email admin@club.de --password '…' --first Vorname --last Nachname
 *
 * Existiert die E-Mail-Adresse bereits, erhält das Konto die Rolle Super-Admin, Status „aktiv“ und das neue Passwort.
 */
import { closeDb } from "@/db/client";
import { createSuperAdmin } from "@/server/bootstrap";

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "") : "";
}

async function main() {
  const email = arg("email");
  const password = arg("password");
  if (!email || !password) {
    console.error("Aufruf: npm run user:create-admin -- --email <adresse> --password <passwort> [--first Vorname] [--last Nachname]");
    process.exit(1);
  }
  const user = await createSuperAdmin({ email, password, firstName: arg("first") || "Admin", lastName: arg("last") });
  console.log(`Super-Admin ${user.email} ist bereit (ID ${user.id}).`);
  await closeDb();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
