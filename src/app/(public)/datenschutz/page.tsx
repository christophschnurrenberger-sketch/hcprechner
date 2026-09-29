import type { Metadata } from "next";
import { LegalPage } from "@/components/public/LegalText";

export const metadata: Metadata = { title: "Datenschutz" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Datenschutz"
      kind="privacy"
      fallback={
        <>
          <section className="space-y-2">
            <h2 className="font-semibold text-ink">Welche Daten verarbeitet werden</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Kontodaten: Vorname, Nachname, E-Mail-Adresse, Passwort (nur als sicherer Hash gespeichert).</li>
              <li>Golfdaten: Start-Handicap, erfasste Runden, Entwürfe, Lieblingsplätze.</li>
              <li>Protokoll: Zeitpunkte von Anmeldung und Änderungen (Audit-Log), um Missbrauch zu erkennen und Änderungen nachvollziehen zu können.</li>
            </ul>
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold text-ink">Cookies</h2>
            <p>Es wird ausschließlich ein technisch notwendiges Sitzungscookie gesetzt (HttpOnly). Es gibt kein Tracking und keine Werbung.</p>
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold text-ink">Wer die Daten sieht</h2>
            <p>
              Deine Runden und dein Handicap sind nur für dich sichtbar. Administratoren können Konten zur Unterstützung einsehen; jeder solche Zugriff wird protokolliert.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold text-ink">Deine Rechte</h2>
            <p>Im Profil kannst du deine Daten jederzeit herunterladen (Datenauskunft) und dein Konto mit allen Runden löschen.</p>
          </section>
        </>
      }
    />
  );
}
