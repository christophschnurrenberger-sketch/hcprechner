"use client";

import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { RoundWizard } from "@/components/rounds/RoundWizard";

/** Liest `?edit=<id>` im Browser, damit die Seite auch als statische Datei funktioniert. */
export function RecordRoundView() {
  const params = useSearchParams();
  const edit = params.get("edit");
  return (
    <>
      <PageHeader
        title={edit ? "Runde bearbeiten" : "Runde erfassen"}
        description="Schritt für Schritt: Platz und Abschlag wählen – Par, Course Rating und Slope werden automatisch geladen. Die Berechnung erfolgt mit dem HCPI, der am Spieltag galt."
      />
      <RoundWizard key={edit ?? "new"} editId={edit} />
    </>
  );
}
