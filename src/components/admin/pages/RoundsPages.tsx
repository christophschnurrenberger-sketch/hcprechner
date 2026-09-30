"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api/client";
import { formatDate, formatDecimal, formatHcp } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/whs/messages";
import { useApi } from "@/lib/useApi";
import { Alert, Badge, Card, CardBody, CardHeader, Input, KeyValue, PageHeader, Select } from "@/components/ui";
import { ErrorState, PageSkeleton } from "@/components/ui/feedback";
import { CalculationDetails } from "@/components/member/pages/RoundDetailPage";
import { AdminTable, EmptyRow, Pagination, Td, Th, formatDateTime } from "../AdminUi";
import { userHref } from "./UsersPages";
import { AdminRoundCommunity } from "./CommunityAdminPages";
import { Scorecard } from "@/components/stats/Scorecard";
import { RoundStatsSummary } from "@/components/stats/StatsUi";

export const adminRoundHref = (userId: string, roundId: string) => `/admin/rounds/view?user=${encodeURIComponent(userId)}&id=${encodeURIComponent(roundId)}`;

export function RoundsListPage() {
  const params = useSearchParams();
  const [filter, setFilter] = useState({ q: "", status: "", from: "", to: "", userId: params.get("userId") ?? "" });
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi(() => api.admin.rounds({ ...filter, page, pageSize: 50 }), JSON.stringify({ ...filter, page }));
  const set = (patch: Partial<typeof filter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Runden" description="Alle erfassten Runden. Werte zum Zeitpunkt der Speicherung; die Detailansicht rechnet mit der aktuellen Engine neu." />
      <div className="flex flex-wrap gap-2">
        <Input value={filter.q} onChange={(e) => set({ q: e.target.value })} placeholder="Golfplatz, Spieler, Runden-ID" className="max-w-xs" aria-label="Runden suchen" />
        <Select value={filter.status} onChange={(e) => set({ status: e.target.value })} className="max-w-[11rem]" aria-label="Status">
          <option value="">Alle</option>
          <option value="COMPLETED">abgeschlossen</option>
          <option value="DELETED">gelöscht</option>
        </Select>
        <Input type="date" value={filter.from} onChange={(e) => set({ from: e.target.value })} className="max-w-[10rem]" aria-label="von" />
        <Input type="date" value={filter.to} onChange={(e) => set({ to: e.target.value })} className="max-w-[10rem]" aria-label="bis" />
        {filter.userId && (
          <button type="button" className="text-sm text-brand hover:underline" onClick={() => set({ userId: "" })}>
            Filter „ein Benutzer“ entfernen
          </button>
        )}
      </div>
      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <PageSkeleton variant="table" />
      ) : (
        <>
          <AdminTable
            loading={loading}
            minWidth="56rem"
            head={
              <tr>
                <Th>Datum</Th>
                <Th>Spieler</Th>
                <Th>Golfplatz</Th>
                <Th right>Löcher</Th>
                <Th right>GBE</Th>
                <Th right>SD</Th>
                <Th right>HCPI danach</Th>
                <Th>Status</Th>
                <Th>Engine</Th>
              </tr>
            }
            empty={data.items.length === 0 ? <EmptyRow text="Keine Runden gefunden." /> : undefined}
          >
            {data.items.map((r) => (
              <tr key={`${r.userId}-${r.roundId}`} className="hover:bg-surface-2">
                <Td className="whitespace-nowrap">{formatDate(r.date)}</Td>
                <Td>
                  <Link href={userHref(r.userId)} className="text-ink hover:text-brand hover:underline">
                    {r.userName}
                  </Link>
                </Td>
                <Td>
                  <Link href={adminRoundHref(r.userId, r.roundId)} className="font-medium text-ink hover:text-brand hover:underline">
                    {r.courseName}
                  </Link>
                </Td>
                <Td right>{r.holes}</Td>
                <Td right>{r.adjustedGrossScore ?? "–"}</Td>
                <Td right>{formatDecimal(r.scoreDifferential)}</Td>
                <Td right>{formatHcp(r.handicapIndexAfter)}</Td>
                <Td>{r.status === "DELETED" ? <Badge tone="warning">gelöscht</Badge> : <Badge tone="good">abgeschlossen</Badge>}</Td>
                <Td className="max-w-[12rem] truncate text-xs text-ink-3">{r.engine ?? "–"}</Td>
              </tr>
            ))}
          </AdminTable>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}

export function RoundAdminDetailPage() {
  const params = useSearchParams();
  const userId = params.get("user") ?? "";
  const roundId = params.get("id") ?? "";
  const { data, error, reload } = useApi(() => api.admin.round(userId, roundId), `${userId}/${roundId}`);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton variant="detail" />;
  const { round, result, item } = data;
  return (
    <div className="space-y-5">
      <Link href="/admin/rounds" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Runden
      </Link>
      <PageHeader
        title={`${round.course.courseName} · ${formatDate(round.date)}`}
        description={
          <>
            Spieler:{" "}
            <Link href={userHref(data.user.id)} className="text-brand hover:underline">
              {data.user.name}
            </Link>{" "}
            ({data.user.email ?? "ohne E-Mail"})
          </>
        }
      />
      {round.status === "DELETED" && <Alert tone="warning">Diese Runde wurde am {formatDateTime(round.deletedAt ?? null)} gelöscht und zählt nicht mehr.</Alert>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Eingabe" />
          <CardBody>
            <KeyValue
              items={[
                { label: "Art", value: CATEGORY_LABELS[round.category] },
                { label: "Löcher", value: `${round.holes}${round.rating.nine ? ` (${round.rating.nine === "FRONT" ? "1–9" : "10–18"})` : ""}` },
                { label: "Abschlag", value: round.course.teeColor ?? "–" },
                { label: "Eingabe", value: round.entry.mode },
                { label: "Erfasst", value: formatDateTime(round.createdAt) },
                { label: "Geändert", value: formatDateTime(round.updatedAt) },
                { label: "Runden-ID", value: <span className="font-mono text-xs">{round.id}</span> },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Berechnung" subtitle={data.engine} />
          <CardBody>
            <KeyValue
              items={[
                { label: "GBE", value: item?.adjustedGrossScore ?? "–" },
                { label: "Score Differential", value: formatDecimal(item?.scoreDifferential ?? null) },
                { label: "HCPI vorher → nachher", value: item ? `${formatHcp(item.handicapIndexBefore)} → ${formatHcp(item.handicapIndexAfter)}` : "–" },
                { label: "Beim Speichern", value: round.computed ? `SD ${formatDecimal(round.computed.scoreDifferential)} · ${round.computed.engine}` : "–" },
                { label: "Neu berechnet", value: formatDateTime(data.computedAt) },
              ]}
            />
          </CardBody>
        </Card>
      </div>
      <AdminRoundCommunity
        userId={data.user.id}
        roundId={round.id}
        visibility={data.visibility}
        moderation={data.moderation}
        hasNotes={Boolean(round.notes) || Boolean(round.holeStats?.some((h) => h.note))}
        onChange={reload}
      />
      {data.stats && (
        <Card>
          <CardHeader title="Lochstatistik" subtitle="Spielleistung – ohne Einfluss auf das Handicap" />
          <CardBody className="space-y-5">
            <RoundStatsSummary stats={data.stats} insights={[]} />
            {round.holeStats && <Scorecard holes={round.holeStats} showNotes />}
          </CardBody>
        </Card>
      )}
      {result && (
        <Card>
          <CardHeader title="Rechenweg" />
          <CardBody>
            <CalculationDetails detail={{ round, result }} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
