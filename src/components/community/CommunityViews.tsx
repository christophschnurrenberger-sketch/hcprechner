"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Crown, Flag, Medal, Search, Trophy, Users } from "lucide-react";
import { api } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import type { ActivityItem, MemberListItem, MyCommunity, MyRanking, PublicMemberRef, PublicRoundSummary, RankingEntry, RankingScope } from "@/lib/community/types";
import { cn, formatDate, formatDecimal, formatHcp } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Badge, Button, ButtonLink, Card, CardBody, EmptyState, Input, Segmented } from "@/components/ui";
import { ConfirmDialog, ErrorState, PageSkeleton, useToast } from "@/components/ui/feedback";
import { MemberAvatar } from "./MemberAvatar";

export const memberHref = (publicId: string) => `/member/community/member?id=${encodeURIComponent(publicId)}`;
export const publicRoundHref = (publicId: string, roundId: string) => `/member/community/round?member=${encodeURIComponent(publicId)}&round=${encodeURIComponent(roundId)}`;

/** Name mit Link zum Profil – nur, wenn das Mitglied sein Profil freigegeben hat. */
export function MemberName({ member, className }: { member: PublicMemberRef; className?: string }) {
  if (!member.profileVisible) return <span className={cn("font-semibold text-ink", className)}>{member.displayName}</span>;
  return (
    <Link href={memberHref(member.publicId)} className={cn("font-semibold text-ink hover:text-brand hover:underline", className)}>
      {member.displayName}
    </Link>
  );
}

/** Veränderung der Position (+ = verbessert). */
export function Trend({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <span className={cn("text-xs text-ink-3", className)}>–</span>;
  if (value === 0) return <span className={cn("text-xs text-ink-3", className)} aria-label="unverändert">=</span>;
  const up = value > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("tabular inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-good" : "text-ink-3", className)} aria-label={`${Math.abs(value)} ${Math.abs(value) === 1 ? "Platz" : "Plätze"} ${up ? "verbessert" : "verloren"}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {Math.abs(value)}
    </span>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Seiten" className="flex items-center justify-between gap-3 text-sm">
      <Button variant="secondary" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
        <ChevronLeft className="h-4 w-4" aria-hidden /> Zurück
      </Button>
      <span className="text-ink-3">
        Seite {page} von {pages}
      </span>
      <Button variant="secondary" size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages}>
        Weiter <ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/** Zustimmung zur Ranking-Teilnahme (ausdrücklich, jederzeit widerrufbar). */
export function RankingOptIn({ community, onJoined, children }: { community: MyCommunity | null | undefined; onJoined: () => void; children?: ReactNode }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{children ?? "Am Ranking teilnehmen"}</Button>
      <ConfirmDialog
        open={open}
        title="Am Ranking teilnehmen?"
        confirmLabel="Teilnehmen"
        tone="primary"
        busy={busy}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api.member.saveCommunity({ rankingVisible: true });
            toast("Du nimmst jetzt am Ranking teil.");
            setOpen(false);
            onJoined();
          } catch (e) {
            toast(userMessage(e), "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-2 text-ink-2">
          <p>
            Angemeldete Mitglieder sehen im Ranking deinen Anzeigenamen{community ? ` „${community.effectiveDisplayName}“` : ""}, dein Profilbild (falls vorhanden), deinen Handicap Index, deinen Heimatclub und die Anzahl deiner Runden.
          </p>
          <p>E-Mail-Adresse, Runden und Notizen bleiben privat. Du kannst die Teilnahme jederzeit unter Profil → Community beenden.</p>
        </div>
      </ConfirmDialog>
    </>
  );
}

function MyPosition({ me, community, onJoined }: { me: MyRanking; community: MyCommunity | null | undefined; onJoined: () => void }) {
  return (
    <Card className={me.participating ? "border-brand-2/40 bg-brand-soft/40" : undefined}>
      <CardBody className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink-3">{me.participating ? "Deine Position" : "Du nimmst nicht teil"}</p>
          {me.position !== null ? (
            <p className="mt-0.5 text-ink">
              <span className="tabular text-3xl font-semibold">Platz {me.position}</span>
              <span className="text-sm text-ink-3"> von {me.participating ? me.total : me.total + 1}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-ink-2">Noch keine Position – dafür braucht es einen Handicap Index.</p>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            HCPI {formatHcp(me.handicapIndex)}
            {me.participating && me.trend !== null && (
              <>
                · <Trend value={me.trend} /> <span className="text-xs text-ink-3">seit {formatDate(me.trendSince)}</span>
              </>
            )}
          </p>
          {!me.participating && me.position !== null && <p className="mt-1 text-xs text-ink-3">So stündest du im Ranking – diese Angabe siehst nur du.</p>}
        </div>
        {!me.participating && <RankingOptIn community={community} onJoined={onJoined} />}
      </CardBody>
    </Card>
  );
}

const PODIUM = [
  { icon: Crown, tone: "text-accent" },
  { icon: Medal, tone: "text-ink-3" },
  { icon: Medal, tone: "text-[#a0663a]" },
];

function Podium({ top }: { top: RankingEntry[] }) {
  if (top.length < 3) return null;
  return (
    <ol className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Die ersten drei">
      {top.slice(0, 3).map((e, i) => {
        const { icon: Icon, tone } = PODIUM[i];
        return (
          <li key={e.publicId} className={cn("flex flex-col items-center gap-1.5 rounded-xl border bg-surface px-2 py-3 text-center", e.isMe ? "border-brand-2 ring-1 ring-brand-2" : "border-border")}>
            <Icon className={cn("h-5 w-5", tone)} aria-hidden />
            <MemberAvatar member={e} size="lg" />
            <MemberName member={e} className="line-clamp-1 text-sm" />
            <span className="tabular text-lg font-semibold text-brand">{formatHcp(e.handicapIndex)}</span>
            <span className="text-xs text-ink-3">Platz {e.position}</span>
          </li>
        );
      })}
    </ol>
  );
}

function RankingTable({ items }: { items: RankingEntry[] }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs text-ink-3">
            <tr>
              <th scope="col" className="w-16 py-2.5 pl-4 font-medium">Platz</th>
              <th scope="col" className="py-2.5 font-medium">Mitglied</th>
              <th scope="col" className="py-2.5 text-right font-medium">HCPI</th>
              <th scope="col" className="py-2.5 pl-6 font-medium">Heimatclub</th>
              <th scope="col" className="py-2.5 text-right font-medium">Runden</th>
              <th scope="col" className="py-2.5 pr-4 text-right font-medium">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((e) => (
              <tr key={e.publicId} className={e.isMe ? "bg-brand-soft/60" : undefined} aria-current={e.isMe ? "true" : undefined}>
                <td className="tabular py-2.5 pl-4 font-semibold text-ink">{e.position}</td>
                <td className="py-2.5">
                  <span className="flex items-center gap-2.5">
                    <MemberAvatar member={e} size="sm" />
                    <MemberName member={e} />
                    {e.isMe && <Badge tone="brand">Du</Badge>}
                  </span>
                </td>
                <td className="tabular py-2.5 text-right font-semibold text-ink">{formatHcp(e.handicapIndex)}</td>
                <td className="max-w-[14rem] truncate py-2.5 pl-6 text-ink-2">{e.homeCourseName ?? "–"}</td>
                <td className="tabular py-2.5 text-right text-ink-2">{e.roundsCount}</td>
                <td className="py-2.5 pr-4 text-right">
                  <Trend value={e.trend} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden">
        {items.map((e) => (
          <li key={e.publicId} className={cn("flex items-center gap-3 rounded-xl border bg-surface px-3 py-2.5", e.isMe ? "border-brand-2 bg-brand-soft/60" : "border-border")}>
            <span className="tabular w-8 shrink-0 text-center text-lg font-semibold text-ink">{e.position}</span>
            <MemberAvatar member={e} size="md" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <MemberName member={e} className="truncate" />
                {e.isMe && <Badge tone="brand">Du</Badge>}
              </span>
              <span className="block truncate text-xs text-ink-3">{e.homeCourseName ?? `${e.roundsCount} Runden`}</span>
            </span>
            <span className="text-right">
              <span className="tabular block text-lg font-semibold text-ink">{formatHcp(e.handicapIndex)}</span>
              <Trend value={e.trend} />
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function RankingTab({ community, onCommunityChange }: { community: MyCommunity | null | undefined; onCommunityChange: () => void }) {
  const [scope, setScope] = useState<RankingScope>("ALL");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi(() => api.community.ranking({ scope, page }), `${scope}|${page}`);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton variant="list" />;
  const joined = () => {
    onCommunityChange();
    reload();
  };
  return (
    <div className={cn("space-y-4", loading && "opacity-70")}>
      {data.me && <MyPosition me={data.me} community={community} onJoined={joined} />}
      {data.scopes.length > 1 && (
        <Segmented
          name="Ranking-Bereich"
          value={data.scope}
          onChange={(s) => {
            setScope(s);
            setPage(1);
          }}
          options={data.scopes.map((s) => ({ value: s.scope, label: s.label }))}
        />
      )}
      {data.total === 0 ? (
        <EmptyState icon={<Trophy className="h-8 w-8" />} title="Noch niemand im Ranking">
          Im Ranking erscheinen nur Mitglieder, die ausdrücklich zugestimmt haben.
        </EmptyState>
      ) : (
        <>
          {page === 1 && <Podium top={data.top} />}
          <RankingTable items={data.items} />
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          <p className="text-xs text-ink-3">
            Sortiert nach Handicap Index (niedrigster zuerst). Gleicher Handicap Index = gleicher Platz.
            {data.previousSnapshotDate ? ` Trend im Vergleich zum ${formatDate(data.previousSnapshotDate)}.` : ""} Nur Mitglieder, die zugestimmt haben.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aktivität
// ---------------------------------------------------------------------------

export function RoundCard({ round, showMember = true }: { round: PublicRoundSummary; showMember?: boolean }) {
  return (
    <li className="rounded-xl border border-border bg-surface p-3 sm:p-4">
      <div className="flex items-start gap-3">
        {showMember && <MemberAvatar member={round.member} />}
        <div className="min-w-0 flex-1">
          {showMember && (
            <p className="text-sm text-ink-2">
              <MemberName member={round.member} /> hat eine Runde gespielt
            </p>
          )}
          <p className={cn("truncate text-sm", showMember ? "text-ink-3" : "font-semibold text-ink")}>
            {round.courseName} · {round.holes} Loch · {formatDate(round.date)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {round.grossScore !== null && <Badge>{round.grossScore} Schläge</Badge>}
            {round.adjustedGrossScore !== null && <Badge>GBE {round.adjustedGrossScore}</Badge>}
            {round.scoreDifferential !== null && <Badge tone="brand">SD {formatDecimal(round.scoreDifferential)}</Badge>}
            {round.level === "FULL" && <Badge tone="info">Scorekarte</Badge>}
          </div>
        </div>
        <Link href={publicRoundHref(round.member.publicId, round.roundId)} className="shrink-0 text-sm font-medium text-brand hover:underline">
          Ansehen
        </Link>
      </div>
    </li>
  );
}

export function ActivityTab() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi(() => api.community.activity(page), `activity|${page}`);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton variant="list" />;
  if (data.total === 0) {
    return (
      <EmptyState icon={<Flag className="h-8 w-8" />} title="Noch keine Aktivität">
        Hier erscheinen Runden, die Mitglieder für andere freigegeben haben.
      </EmptyState>
    );
  }
  return (
    <div className={cn("space-y-4", loading && "opacity-70")}>
      <ul className="space-y-2">
        {data.items.map((a: ActivityItem) => (
          <RoundCard key={`${a.round.member.publicId}-${a.round.roundId}`} round={a.round} />
        ))}
      </ul>
      <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mitglieder
// ---------------------------------------------------------------------------

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function MembersTab() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"HCP" | "NAME" | "ACTIVITY">("HCP");
  const [page, setPage] = useState(1);
  const query = useDebounced(q.trim());
  const { data, error, loading, reload } = useApi(() => api.community.members({ q: query || undefined, sort, page }), `${query}|${sort}|${page}`);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block sm:w-72">
          <span className="sr-only">Mitglieder suchen</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Name suchen"
            className="pl-9"
            maxLength={60}
          />
        </label>
        <Segmented
          name="Sortierung"
          size="sm"
          value={sort}
          onChange={(s) => {
            setSort(s);
            setPage(1);
          }}
          options={[
            { value: "HCP", label: "Handicap" },
            { value: "NAME", label: "Name" },
            { value: "ACTIVITY", label: "Aktivität" },
          ]}
        />
      </div>
      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <PageSkeleton variant="list" />
      ) : data.total === 0 ? (
        <EmptyState icon={<Users className="h-8 w-8" />} title={query ? "Niemand gefunden" : "Noch keine sichtbaren Profile"}>
          {query ? "Versuche einen anderen Namen." : "Hier erscheinen Mitglieder, die ihr Profil für andere freigegeben haben."}
        </EmptyState>
      ) : (
        <div className={cn("space-y-4", loading && "opacity-70")}>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((m: MemberListItem) => (
              <li key={m.publicId}>
                <Link href={memberHref(m.publicId)} className={cn("flex items-center gap-3 rounded-xl border bg-surface p-3 hover:border-border-strong", m.isMe ? "border-brand-2" : "border-border")}>
                  <MemberAvatar member={m} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-semibold text-ink">{m.displayName}</span>
                      {m.isMe && <Badge tone="brand">Du</Badge>}
                    </span>
                    <span className="block truncate text-xs text-ink-3">{[m.homeCourseName, `${m.roundsCount} Runden`].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="tabular text-lg font-semibold text-ink">{formatHcp(m.handicapIndex)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}

/** Einladung zur Community (nur wenn noch nichts freigegeben ist). */
export function CommunityOnboarding({ community }: { community: MyCommunity }) {
  const s = community.settings;
  if (s.profileVisible || s.rankingVisible) return null;
  return (
    <Card className="border-brand-2/30">
      <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-ink">Mach mit – ganz freiwillig</p>
          <p className="mt-0.5 text-sm text-ink-2">
            Andere Mitglieder sehen dich erst, wenn du es erlaubst: Ranking, Profil, Runden und Statistik schaltest du einzeln frei. Deine E-Mail-Adresse ist nie sichtbar.
          </p>
        </div>
        <ButtonLink href="/member/profile?tab=community" variant="subtle" className="shrink-0">
          Privatsphäre einstellen
        </ButtonLink>
      </CardBody>
    </Card>
  );
}
