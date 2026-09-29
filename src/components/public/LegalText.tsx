"use client";

import type { ReactNode } from "react";
import { Alert } from "@/components/ui";
import { useSession } from "@/components/session/SessionProvider";

/** Text aus den Einstellungen (Absätze durch Leerzeilen) – als Text ausgegeben, nie als HTML. */
function Paragraphs({ text }: { text: string }) {
  return (
    <div className="space-y-4">
      {text.split(/\n\s*\n/).map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}

export function LegalPage({ title, kind, fallback }: { title: string; kind: "imprint" | "privacy"; fallback: ReactNode }) {
  const { settings, status } = useSession();
  const text = kind === "imprint" ? settings.imprintText : settings.privacyText;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>
      <div className="mt-6 rounded-2xl border border-border bg-surface p-6 text-[15px] leading-relaxed text-ink-2 sm:p-8">
        {status !== "ready" ? null : text ? (
          <Paragraphs text={text} />
        ) : (
          <div className="space-y-5">
            <Alert tone="warning">Der Betreiber hat diesen Text noch nicht hinterlegt (Admin → Einstellungen). Die folgenden Angaben sind eine allgemeine Beschreibung der Anwendung.</Alert>
            {fallback}
            {settings.contactEmail && (
              <p>
                Kontakt: <a href={`mailto:${settings.contactEmail}`} className="text-brand underline">{settings.contactEmail}</a>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
