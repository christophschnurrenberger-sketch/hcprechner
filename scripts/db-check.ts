import { getDbHandle, closeDb, schema } from "@/db/client";
async function main() {
  const h = await getDbHandle();
  const rows = await h.db.select().from(schema.courses).limit(1);
  console.log(`Datenbank erreichbar (${h.kind}), Migrationen angewendet.`);
  await closeDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
