/**
 * Übernimmt die mitgelieferten Golfplatz-Startdaten (data/seed/golfplaetze-bayern.json) in die Datenbank.
 * Vorhandene Anlagen bleiben unverändert.   npm run db:seed
 */
import { closeDb } from "@/db/client";
import { importSeedIntoDb } from "@/server/seedImport";

async function main() {
  const added = await importSeedIntoDb("db:seed");
  console.log(added.length ? `Übernommen: ${added.join(", ")}` : "Keine neuen Anlagen – alle Startdaten sind bereits vorhanden.");
  await closeDb();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
