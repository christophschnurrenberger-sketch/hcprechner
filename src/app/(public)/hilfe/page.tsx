import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

export const metadata: Metadata = { title: "Hilfe & FAQ", description: "Handicap Index, Score Differential, 9-Loch-Runden und Golfplatzdaten einfach erklärt." };

const FAQ: { group: string; items: { q: string; a: string }[] }[] = [
  {
    group: "Erste Schritte",
    items: [
      { q: "Wie erfasse ich eine Runde?", a: "Tippe auf „+ Runde erfassen“. Wähle Datum, Golfplatz, Platz/Schleife und Abschlag – dann gibst du entweder dein Gesamtergebnis (GBE) oder die Schläge je Loch ein. Vor dem Speichern siehst du, wie sich dein Handicap verändert." },
      { q: "Welches Start-Handicap soll ich eintragen?", a: "Deinen aktuellen Handicap Index aus der DGV-App bzw. vom Club. Er gilt, bis genügend eigene Runden erfasst sind. Ohne Angabe beginnt der Rechner mit 54,0." },
      { q: "Ab wann wird mein Handicap berechnet?", a: "Ab drei handicaprelevanten Ergebnissen. Vorher gilt dein Start-Handicap. Ab 20 Ergebnissen zählen die besten 8 der letzten 20." },
    ],
  },
  {
    group: "Begriffe",
    items: [
      { q: "Was ist der Handicap Index (HCPI)?", a: "Er beschreibt deine Spielstärke. Er ist der Durchschnitt deiner besten Score Differentials aus den letzten bis zu 20 Ergebnissen – mit Sonderregeln wie Soft Cap, Hard Cap und 26,5-Bremse." },
      { q: "Was ist ein Score Differential?", a: "Das Ergebnis einer Runde, umgerechnet auf einen Platz mittlerer Schwierigkeit: (113 ÷ Slope) × (GBE − Course Rating − PCC). So werden Runden auf unterschiedlichen Plätzen vergleichbar." },
      { q: "Was bedeutet GBE?", a: "Das „Gewertete Bruttoergebnis“ (Adjusted Gross Score). Sehr hohe Lochergebnisse werden dabei auf Netto-Doppelbogey begrenzt – so zählt ein einzelnes Katastrophenloch nicht voll." },
      { q: "Was sind Course Rating und Slope?", a: "Kennzahlen für die Schwierigkeit eines Platzes vom gewählten Abschlag. Der Rechner verwendet nur hinterlegte, geprüfte Werte – geschätzte oder umgerechnete Werte gibt es nicht." },
    ],
  },
  {
    group: "Besondere Fälle",
    items: [
      { q: "Wie zählen 9-Loch-Runden?", a: "Eine 9-Loch-Runde wird mit einem erwarteten Ergebnis für die anderen neun Löcher zu einem 18-Loch-Score-Differential ergänzt. Dafür braucht es ein offizielles 9-Loch-Rating – es wird nie aus dem 18-Loch-Rating abgeleitet." },
      { q: "Warum zählt meine Runde nicht?", a: "Mögliche Gründe: private Runde ohne Registrierung, Spielform ohne Wertung (z. B. Matchplay), nicht zu Ende gespielt, außerhalb der letzten 20 Ergebnisse oder nicht unter den besten. In den Rundendetails steht der genaue Grund." },
      { q: "Warum weicht mein Handicap vom Durchschnitt ab?", a: "Soft Cap und Hard Cap begrenzen einen schnellen Anstieg gegenüber deinem niedrigsten Handicap der letzten 12 Monate. Die 26,5-Bremse bremst Erhöhungen im oberen Bereich. Auf der HCP-Seite siehst du, welche Regel gerade greift." },
      { q: "Was passiert, wenn ich eine alte Runde ändere oder lösche?", a: "Der komplette Verlauf wird chronologisch neu berechnet. Gelöschte Runden bleiben intern erhalten, zählen aber nicht mehr." },
    ],
  },
  {
    group: "Konto & Daten",
    items: [
      { q: "Wer sieht meine Runden?", a: "Nur du. Administratoren können zur Unterstützung Konten einsehen – das wird protokolliert." },
      { q: "Ich habe mein Passwort vergessen.", a: "Auf der Anmeldeseite „Passwort vergessen?“ wählen. Du bekommst einen Link, der eine Stunde gültig ist." },
      { q: "Kann ich meine Daten mitnehmen oder löschen?", a: "Ja. Im Profil unter „Datenschutz“ kannst du alle Daten herunterladen oder dein Konto löschen." },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Hilfe & FAQ</h1>
      <p className="mt-2 text-ink-3">
        Die wichtigsten Fragen kurz erklärt. Den vollständigen Rechenweg findest du im{" "}
        <Link href="/methodik" className="font-medium text-brand hover:underline">
          Berechnungsweg
        </Link>
        .
      </p>
      <div className="mt-8 space-y-8">
        {FAQ.map((group) => (
          <section key={group.group}>
            <h2 className="text-lg font-semibold text-ink">{group.group}</h2>
            <div className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {group.items.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-ink hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronDown className="h-4 w-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="px-5 pb-4 text-[15px] leading-relaxed text-ink-2">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
