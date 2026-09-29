"use client";

import { ClipboardList, PlusCircle } from "lucide-react";
import { useHcp } from "@/components/providers/HcpStoreProvider";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { RoundTable, useRoundRows } from "@/components/rounds/RoundTable";
import { LoadingState } from "@/components/dashboard/DashboardView";

export function RoundsView() {
  const { ready, rounds, result } = useHcp();
  const rows = useRoundRows(rounds, result.rounds);
  if (!ready) return <LoadingState />;
  return (
    <>
      <PageHeader
        title="Meine Runden"
        description="Vollständige Historie aller erfassten Runden – auch nicht handicap-relevanter. Klick auf eine Runde zeigt den vollständigen Rechenweg."
        actions={
          <ButtonLink href="/runde-erfassen">
            <PlusCircle className="h-4 w-4" /> Runde erfassen
          </ButtonLink>
        }
      />
      {rounds.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-8 w-8" />} title="Noch keine Runden erfasst" action={<ButtonLink href="/runde-erfassen">Erste Runde erfassen</ButtonLink>}>
          Erfassen Sie Turniere, registrierte Privatrunden oder übernehmen Sie Score Differentials aus Ihrem offiziellen Scoring Record.
        </EmptyState>
      ) : (
        <RoundTable rows={rows} showRelevance />
      )}
    </>
  );
}
