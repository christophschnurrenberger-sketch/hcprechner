import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { RoundWizard } from "@/components/rounds/RoundWizard";

export const metadata: Metadata = { title: "Runde erfassen" };

export default async function RecordRoundPage(props: PageProps<"/runde-erfassen">) {
  const params = await props.searchParams;
  const edit = typeof params.edit === "string" ? params.edit : null;
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
