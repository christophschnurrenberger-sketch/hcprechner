import type { Metadata } from "next";
import { LegalPage } from "@/components/public/LegalText";

export const metadata: Metadata = { title: "Impressum" };

export default function ImprintPage() {
  return (
    <LegalPage
      title="Impressum"
      kind="imprint"
      fallback={<p>Angaben gemäß § 5 DDG werden vom Betreiber dieser Installation im Admin-Bereich unter „Einstellungen“ hinterlegt.</p>}
    />
  );
}
