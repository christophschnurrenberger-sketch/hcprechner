"use client";

import Link from "next/link";
import { useState } from "react";
import { BarChart3, Flag, MapPinned, Plus, Upload } from "lucide-react";
import { api } from "@/lib/api/client";
import { useApi } from "@/lib/useApi";
import { ButtonLink, EmptyState, PageHeader, Segmented } from "@/components/ui";
import { ErrorState, PageSkeleton, useToast } from "@/components/ui/feedback";
import { DraftList, RoundList } from "@/components/member/RoundList";

export function RoundsPage() {
  const [holes, setHoles] = useState<"all" | 18 | 9>("all");
  const toast = useToast();
  const rounds = useApi(() => api.member.rounds({ holes: holes === "all" ? null : holes }), `rounds-${holes}`);
  const drafts = useApi(() => api.member.drafts(), "drafts");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Meine Runden"
        description="Alle erfassten Ergebnisse. Grün markierte Score Differentials zählen aktuell für deinen Handicap Index."
        actions={
          <>
            <ButtonLink href="/member/stats" variant="secondary">
              <BarChart3 className="h-4 w-4" aria-hidden /> Statistik
            </ButtonLink>
            <ButtonLink href="/member/courses" variant="secondary">
              <MapPinned className="h-4 w-4" aria-hidden /> Golfplätze
            </ButtonLink>
            <ButtonLink href="/member/import" variant="secondary">
              <Upload className="h-4 w-4" aria-hidden /> Importieren
            </ButtonLink>
            <ButtonLink href="/member/rounds/new">
              <Plus className="h-4 w-4" aria-hidden /> Runde erfassen
            </ButtonLink>
          </>
        }
      />
      {drafts.data && (
        <DraftList
          drafts={drafts.data}
          onDelete={async (id) => {
            try {
              await api.member.deleteDraft(id);
              drafts.setData(drafts.data!.filter((d) => d.id !== id));
              toast("Entwurf verworfen.");
            } catch {
              toast("Entwurf konnte nicht gelöscht werden.", "error");
            }
          }}
        />
      )}
      <Segmented
        name="Lochanzahl"
        value={holes}
        onChange={setHoles}
        options={[
          { value: "all", label: "Alle" },
          { value: 18, label: "18 Loch" },
          { value: 9, label: "9 Loch" },
        ]}
      />
      {rounds.error && !rounds.data ? (
        <ErrorState error={rounds.error} onRetry={rounds.reload} />
      ) : !rounds.data ? (
        <PageSkeleton variant="list" />
      ) : rounds.data.length === 0 ? (
        <EmptyState
          icon={<Flag className="h-8 w-8" />}
          title={holes === "all" ? "Noch keine Runden" : `Keine ${holes}-Loch-Runden`}
          action={
            <Link href="/member/rounds/new" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 font-semibold text-white hover:bg-brand-hover dark:text-[#0d1510]">
              Runde erfassen
            </Link>
          }
        >
          Erfasse deine Runden direkt nach dem Spiel – das dauert keine Minute.
        </EmptyState>
      ) : (
        <div className={rounds.loading ? "opacity-60 transition-opacity" : undefined}>
          <RoundList rounds={rounds.data} />
        </div>
      )}
    </div>
  );
}
