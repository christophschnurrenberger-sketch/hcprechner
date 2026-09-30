"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { CloudOff, Flag } from "lucide-react";
import { api } from "@/lib/api/client";
import { useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/session/SessionProvider";
import { useLocalActiveRound, useOnline } from "./hooks";
import { clearLocalDraft, type LocalRoundDraft } from "./localDraft";

/**
 * Reicht eine offline abgeschlossene Runde nach, sobald wieder Verbindung besteht – auch wenn die Eingabe
 * inzwischen geschlossen wurde. Idempotent über die Entwurfs-ID: Es entsteht nie eine zweite Runde.
 */
export function RoundSyncAgent() {
  const { user } = useSession();
  const path = usePathname() ?? "";
  const online = useOnline();
  const toast = useToast();
  const local = useLocalActiveRound(user?.id);
  const busy = useRef(false);

  useEffect(() => {
    if (!user || !online || !local?.pendingSave || busy.current || path.startsWith("/member/rounds/new")) return;
    busy.current = true;
    const { input } = local.pendingSave;
    api.member
      .createRound(input, local.draftId)
      .then(() => {
        clearLocalDraft(user.id, local.draftId);
        toast("Runde synchronisiert.");
      })
      .catch(() => undefined)
      .finally(() => {
        busy.current = false;
      });
  }, [user, online, local, path, toast]);

  return null;
}

/** Hinweis auf eine laufende Runde (Dashboard). */
export function ActiveRoundBanner({ round }: { round: LocalRoundDraft }) {
  const holes = round.state.holes;
  const text = round.pendingSave ? "Abgeschlossen – wird synchronisiert, sobald du online bist" : round.pos.step === "FINAL" || round.pos.step === "FRONT_NINE" ? "Bereit zum Abschließen" : round.mode === "TOTAL" ? "Gesamtergebnis eintragen" : `Loch ${Math.min(round.pos.hole + 1, holes)} von ${holes}`;
  return (
    <Link href={`/member/rounds/new?draft=${encodeURIComponent(round.draftId)}&resume=1`} className="flex items-center gap-3 rounded-2xl border-2 border-brand-2/50 bg-brand-soft/70 p-4">
      {round.pendingSave ? <CloudOff className="h-6 w-6 shrink-0 text-warning" aria-hidden /> : <Flag className="h-6 w-6 shrink-0 text-brand" aria-hidden />}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">Du hast eine laufende Runde</span>
        <span className="block truncate text-sm text-ink-2">
          {round.courseName ?? "Runde"} · {text}
        </span>
      </span>
      <span className="shrink-0 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white dark:text-[#0d1510]">Fortsetzen</span>
    </Link>
  );
}
