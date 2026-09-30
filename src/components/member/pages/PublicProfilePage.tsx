"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Flag, MapPin, Trophy } from "lucide-react";
import { api } from "@/lib/api/client";
import { formatHcp } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Alert, ButtonLink, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import { ErrorState, PageSkeleton } from "@/components/ui/feedback";
import { MemberAvatar } from "@/components/community/MemberAvatar";
import { Pager, RoundCard } from "@/components/community/CommunityViews";
import { ScoreDistribution, SummaryTiles } from "@/components/stats/StatsUi";

function MemberRounds({ publicId }: { publicId: string }) {
  const [page, setPage] = useState(1);
  const { data, error, reload } = useApi(() => api.community.memberRounds(publicId, page), `${publicId}|${page}`);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton variant="list" />;
  if (data.total === 0) return <p className="text-sm text-ink-3">Keine freigegebenen Runden.</p>;
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {data.items.map((r) => (
          <RoundCard key={r.roundId} round={r} showMember={false} />
        ))}
      </ul>
      <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
    </div>
  );
}

/** Öffentliches Profil eines Mitglieds – nur mit dessen Freigabe (sonst liefert die API nichts). */
export function PublicProfilePage() {
  const id = useSearchParams().get("id") ?? "";
  const { data, error, reload } = useApi(() => api.community.member(id), id);

  if (error && !data) {
    return (
      <div className="space-y-4">
        <Link href="/member/community?tab=mitglieder" className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Community
        </Link>
        <ErrorState error={error} onRetry={reload} title="Profil nicht verfügbar" />
      </div>
    );
  }
  if (!data) return <PageSkeleton variant="detail" />;

  return (
    <div className="space-y-5">
      <Link href="/member/community?tab=mitglieder" className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Community
      </Link>
      {data.isMe && (
        <Alert tone="info" title="So sehen dich andere Mitglieder">
          Was hier erscheint, bestimmst du unter{" "}
          <Link href="/member/profile?tab=community" className="font-medium text-brand hover:underline">
            Profil → Community
          </Link>
          .
        </Alert>
      )}
      <Card>
        <CardBody className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <MemberAvatar member={data} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{data.displayName}</h1>
            <p className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-ink-3 sm:justify-start">
              {data.homeCourseName && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden /> {data.homeCourseName}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Flag className="h-3.5 w-3.5" aria-hidden /> {data.roundsCount} {data.roundsCount === 1 ? "Runde" : "Runden"}
              </span>
              {data.rankingPosition !== null && (
                <span className="inline-flex items-center gap-1">
                  <Trophy className="h-3.5 w-3.5" aria-hidden /> Platz {data.rankingPosition} im Ranking
                </span>
              )}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Handicap Index</p>
            <p className="tabular text-5xl font-semibold text-brand">{formatHcp(data.handicapIndex)}</p>
          </div>
        </CardBody>
      </Card>

      {data.performance && data.performance.roundsWithStats > 0 && (
        <Card>
          <CardHeader title="Spielleistung" subtitle={`Letzte ${data.performance.roundsWithStats} ${data.performance.roundsWithStats === 1 ? "Runde" : "Runden"} mit Lochstatistik`} />
          <CardBody className="space-y-5">
            <SummaryTiles summary={data.performance} />
            <div>
              <p className="mb-2 text-sm font-medium text-ink">Ergebnisse je Loch</p>
              <ScoreDistribution distribution={data.performance.distribution} />
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Freigegebene Runden" subtitle={data.publicRoundsCount > 0 ? `${data.publicRoundsCount} ${data.publicRoundsCount === 1 ? "Runde" : "Runden"}` : undefined} />
        <CardBody>
          {data.publicRoundsCount > 0 ? (
            <MemberRounds publicId={data.publicId} />
          ) : (
            <EmptyState title="Keine freigegebenen Runden">
              {data.isMe ? "Du kannst einzelne Runden in der Rundenansicht für Mitglieder freigeben." : `${data.displayName} teilt derzeit keine Runden.`}
            </EmptyState>
          )}
          {data.isMe && data.publicRoundsCount === 0 && (
            <div className="mt-3 text-center">
              <ButtonLink href="/member/rounds" variant="secondary" size="sm">
                Zu meinen Runden
              </ButtonLink>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
