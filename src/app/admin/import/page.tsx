import { requireAdminPage } from "@/server/adminAuth";
import { PageHeader } from "@/components/ui";
import { CsvImporter } from "./CsvImporter";

export default async function AdminImportPage() {
  await requireAdminPage();
  return (
    <>
      <PageHeader
        title="CSV-Import"
        description="Validieren → Duplikate erkennen → Vorschau mit markierten Änderungen → erst nach Bestätigung importieren. Werte ohne Quelle werden nie als verifiziert übernommen."
      />
      <CsvImporter />
    </>
  );
}
