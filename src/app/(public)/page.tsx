import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardList, Gauge, MapPinned, ShieldCheck, Smartphone } from "lucide-react";
import { LandingActions } from "@/components/public/LandingActions";

const FEATURES = [
  { icon: Gauge, title: "Dein Handicap Index", text: "Sofort sichtbar – mit Verlauf und verständlicher Erklärung, welche Runden zählen." },
  { icon: ClipboardList, title: "Runde in unter einer Minute", text: "Platz wählen, Abschlag wählen, Ergebnis eingeben. Die Berechnung übernimmt der Server." },
  { icon: MapPinned, title: "Golfplätze in Bayern", text: "Course und Slope Rating aus der Datenbank – nur geprüfte Werte, nie geschätzt." },
  { icon: Smartphone, title: "Gemacht fürs Smartphone", text: "Große Bedienelemente, Loch-für-Loch-Eingabe direkt nach der Runde." },
];

const STEPS = [
  { n: 1, title: "Konto anlegen", text: "Mit E-Mail-Adresse registrieren und bestätigen." },
  { n: 2, title: "Start-Handicap eintragen", text: "Deinen aktuellen HCPI aus der DGV-App oder vom Club." },
  { n: 3, title: "Runden erfassen", text: "Ab drei Ergebnissen berechnet der Rechner deinen Handicap Index nach WHS." },
];

export default function LandingPage() {
  return (
    <div>
      <section className="bg-gradient-to-b from-brand-soft/70 to-surface-2">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-brand shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> World Handicap System · DGV-Regeln 2026
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">Dein Handicap. Klar berechnet.</h1>
            <p className="mt-4 max-w-xl text-lg text-ink-2">
              Runden erfassen, Handicap Index sehen, Entwicklung verstehen – ohne Formeln, ohne Tabellen. Einfach für Golferinnen und Golfer.
            </p>
            <LandingActions />
            <ul className="mt-8 space-y-2 text-sm text-ink-2">
              {["Berechnung nach offiziellen WHS-Regeln 2026", "9- und 18-Loch-Runden, Scorekarte oder Gesamtergebnis", "Deine Daten sieht nur du"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-good" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-border bg-surface p-6 shadow-xl shadow-brand/5 sm:p-8" aria-hidden>
            <p className="text-sm font-medium text-ink-3">Dein Handicap Index</p>
            <p className="tabular mt-1 text-7xl font-semibold tracking-tight text-brand">18,4</p>
            <p className="mt-2 text-sm text-ink-2">
              <span className="font-semibold text-good">−0,6</span> seit der letzten Runde
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              {[
                ["20", "Ergebnisse"],
                ["8", "zählen"],
                ["15,2", "bestes SD"],
              ].map(([v, l]) => (
                <div key={l} className="rounded-xl bg-surface-2 px-2 py-3">
                  <p className="tabular text-lg font-semibold text-ink">{v}</p>
                  <p className="text-xs text-ink-3">{l}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-xl bg-brand px-4 py-3 text-center text-sm font-semibold text-white dark:text-[#0d1510]">+ Runde erfassen</div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Alles, was du für dein Handicap brauchst</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-border bg-surface p-5">
              <Icon className="h-6 w-6 text-brand" aria-hidden />
              <h3 className="mt-3 font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm text-ink-3">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">So einfach geht&apos;s</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl bg-surface-2 p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white dark:text-[#0d1510]">{s.n}</span>
                <h3 className="mt-3 font-semibold text-ink">{s.title}</h3>
                <p className="mt-1 text-sm text-ink-3">{s.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-sm text-ink-3">
            Wie genau gerechnet wird, steht im{" "}
            <Link href="/methodik" className="font-medium text-brand underline-offset-2 hover:underline">
              Berechnungsweg
            </Link>
            . Fragen? Die{" "}
            <Link href="/hilfe" className="font-medium text-brand underline-offset-2 hover:underline">
              Hilfe
            </Link>{" "}
            erklärt die wichtigsten Begriffe. <ArrowRight className="inline h-3.5 w-3.5" aria-hidden />
          </p>
        </div>
      </section>
    </div>
  );
}
