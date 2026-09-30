"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { UsersRound } from "lucide-react";
import { EmptyState, PageHeader, Segmented } from "@/components/ui";
import { useSession } from "@/components/session/SessionProvider";
import { useMyCommunity } from "@/components/community/Visibility";
import { ActivityTab, CommunityOnboarding, MembersTab, RankingTab } from "@/components/community/CommunityViews";

type Tab = "ranking" | "aktivitaet" | "mitglieder";

/** Community: Ranking, Aktivität und Mitglieder – ausschließlich freigegebene Daten (Filterung im Backend). */
export function CommunityPage() {
  const { settings } = useSession();
  const flags = settings.community;
  const params = useSearchParams();
  const router = useRouter();
  const community = useMyCommunity();

  if (!flags.communityEnabled) {
    return (
      <EmptyState icon={<UsersRound className="h-8 w-8" />} title="Community ist ausgeschaltet">
        Der Betreiber hat die Community derzeit deaktiviert.
      </EmptyState>
    );
  }

  const tabs: { value: Tab; label: string }[] = [
    ...(flags.rankingEnabled ? [{ value: "ranking" as const, label: "Ranking" }] : []),
    ...(flags.activityFeedEnabled && flags.publicRoundsEnabled ? [{ value: "aktivitaet" as const, label: "Aktivität" }] : []),
    { value: "mitglieder", label: "Mitglieder" },
  ];
  const requested = params.get("tab") as Tab | null;
  const tab = tabs.find((t) => t.value === requested)?.value ?? tabs[0].value;

  return (
    <div className="space-y-5">
      <PageHeader title="Community" description="Vergleiche dich mit anderen Mitgliedern – sichtbar ist nur, was jeder selbst freigibt." />
      {community.data && <CommunityOnboarding community={community.data} />}
      <Segmented name="Community-Bereich" value={tab} onChange={(t) => router.replace(`/member/community?tab=${t}`, { scroll: false })} options={tabs} />
      {tab === "ranking" && <RankingTab community={community.data} onCommunityChange={community.reload} />}
      {tab === "aktivitaet" && <ActivityTab />}
      {tab === "mitglieder" && <MembersTab />}
    </div>
  );
}
