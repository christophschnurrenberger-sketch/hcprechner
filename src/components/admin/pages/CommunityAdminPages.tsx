"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { EyeOff, Loader2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import { VISIBILITY_LABELS } from "@/lib/community/policy";
import type { AdminUserDetail } from "@/lib/api/types";
import type { AdminPublicRoundRow, AdminRankingRow, CommunityFlags, ModerationAction, RoundModeration, RoundVisibility } from "@/lib/community/types";
import { formatDate, formatDecimal, formatHcp } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, PageHeader, Segmented, Select, Textarea } from "@/components/ui";
import { ConfirmDialog, ErrorState, PageSkeleton, useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/session/SessionProvider";
import { formatPercent } from "@/components/stats/StatsUi";
import { AdminTable, EmptyRow, KpiCard, Pagination, Td, Th, formatDateTime } from "../AdminUi";
import { adminRoundHref } from "./RoundsPages";
import { userHref } from "./UsersPages";

type Tab = "overview" | "ranking" | "rounds";

export const FLAG_LABELS: Record<keyof CommunityFlags, { label: string; description: string }> = {
  communityEnabled: { label: "Community", description: "Hauptschalter: Aus = keine Community-Seiten, keine Profile, kein Ranking." },
  rankingEnabled: { label: "Ranking", description: "Ranking nach Handicap Index (nur Mitglieder mit Zustimmung)." },
  publicRoundsEnabled: { label: "Öffentliche Runden", description: "Mitglieder dürfen einzelne Runden für andere freigeben." },
  statsSharingEnabled: { label: "Statistiken teilen", description: "Scorekarten und Statistiken in freigegebenen Runden und Profilen. Aus = nur Basisdaten." },
  activityFeedEnabled: { label: "Aktivität", description: "Liste der zuletzt freigegebenen Runden." },
};

export const MODERATION_LABELS: Record<ModerationAction, { label: string; confirm: string }> = {
  HIDE: { label: "Für andere ausblenden", confirm: "Die Runde verschwindet für andere Mitglieder. Für das Mitglied und sein Handicap ändert sich nichts." },
  UNHIDE: { label: "Wieder freigeben", confirm: "Die Runde ist wieder mit der vom Mitglied gewählten Sichtbarkeit zu sehen." },
  MAKE_PRIVATE: { label: "Auf „Nur ich“ setzen", confirm: "Die Sichtbarkeit wird auf „Nur ich“ gesetzt. Das Mitglied kann sie selbst wieder ändern." },
  REMOVE_NOTES: { label: "Notizen entfernen", confirm: "Die Notizen der Runde (auch je Loch) werden gelöscht. Das lässt sich nicht rückgängig machen." },
};

/** Moderation mit Begründung (Audit-Log). Runden werden nie gelöscht – das Handicap bleibt unverändert. */
export function ModerationDialog({ target, onClose, onDone }: { target: { userId: string; roundId: string; action: ModerationAction; label: string } | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const meta = target ? MODERATION_LABELS[target.action] : null;
  return (
    <ConfirmDialog
      open={target !== null}
      title={meta ? `${meta.label}?` : ""}
      confirmLabel={meta?.label ?? "OK"}
      tone={target?.action === "UNHIDE" ? "primary" : "danger"}
      busy={busy}
      onClose={() => {
        setReason("");
        onClose();
      }}
      onConfirm={async () => {
        if (!target) return;
        setBusy(true);
        try {
          await api.admin.moderateRound(target.userId, target.roundId, target.action, reason.trim() || undefined);
          toast("Gespeichert und protokolliert.");
          setReason("");
          onDone();
        } catch (e) {
          toast(userMessage(e), "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      {target && meta && (
        <div className="space-y-3">
          <p className="text-ink-2">
            <strong className="text-ink">{target.label}</strong> – {meta.confirm}
          </p>
          <Field label="Begründung (für das Audit-Log)" htmlFor="mod-reason">
            <Textarea id="mod-reason" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="z. B. beleidigende Notiz" />
          </Field>
        </div>
      )}
    </ConfirmDialog>
  );
}

function FlagsCard({ flags }: { flags: CommunityFlags }) {
  const { can } = useSession();
  return (
    <Card>
      <CardHeader title="Schalter" action={can("settings.write") ? <Link href="/admin/settings#community" className="text-sm font-medium text-brand hover:underline">Ändern</Link> : undefined} />
      <CardBody className="flex flex-wrap gap-2">
        {(Object.keys(FLAG_LABELS) as (keyof CommunityFlags)[]).map((k) => (
          <Badge key={k} tone={flags[k] ? "good" : "neutral"}>
            {FLAG_LABELS[k].label}: {flags[k] ? "an" : "aus"}
          </Badge>
        ))}
      </CardBody>
    </Card>
  );
}

function Overview() {
  const toast = useToast();
  const { can } = useSession();
  const { data, error, reload } = useApi(() => api.admin.communityOverview(), "community-overview");
  const [refreshing, setRefreshing] = useState(false);
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton />;
  const p = data.performance;
  return (
    <div className="space-y-5">
      {!data.flags.communityEnabled && <Alert tone="info">Die Community ist ausgeschaltet. Mitglieder sehen keine Community-Seiten; ihre Freigaben bleiben gespeichert.</Alert>}
      <FlagsCard flags={data.flags} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Mitglieder" value={data.members} />
        <KpiCard label="Profile sichtbar" value={data.profilesVisible} sub="Zustimmung erteilt" />
        <KpiCard label="Im Ranking" value={data.rankingOptIn} sub={`Stand ${formatDate(data.lastSnapshotDate)}`} />
        <KpiCard label="Geteilte Runden" value={data.publicRounds} sub={`${data.publicRoundsFull} mit Details`} />
        <KpiCard label="Runden teilen" value={data.roundsVisibleUsers} sub="Mitglieder" />
        <KpiCard label="Statistik teilen" value={data.statsVisibleUsers} sub="Mitglieder" />
        <KpiCard label="Ausgeblendet" value={data.hiddenRounds} sub="durch Moderation" tone={data.hiddenRounds ? "warning" : undefined} />
        <KpiCard label="Detailliert erfasst" value={p.detailedRounds} sub={`${p.quickRounds} nur mit Ergebnis`} />
      </div>
      <Card>
        <CardHeader title="Spielleistung aller Mitglieder" subtitle="Aggregiert aus allen Runden mit Lochstatistik – keine Einzelwerte, keine Rückschlüsse auf Personen." />
        <CardBody>
          {p.detailedRounds < 5 ? (
            <p className="text-sm text-ink-3">Zu wenige Runden mit Lochstatistik für eine aussagekräftige Auswertung (mindestens 5).</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard label="Putts pro Loch" value={formatDecimal(p.puttsPerHole, 2)} />
              <KpiCard label="GIR" value={formatPercent(p.girPercentage)} />
              <KpiCard label="Fairways" value={formatPercent(p.firPercentage)} />
              <KpiCard label="Up & Down" value={formatPercent(p.upAndDownPercentage)} />
              <KpiCard label="Sand Save" value={formatPercent(p.sandSavePercentage)} />
              <KpiCard label="Drei-Putts / Runde" value={formatDecimal(p.threePuttsPerRound, 1)} />
            </div>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Datenqualität" />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard label="Runden ohne Statistik" value={data.dataQuality.roundsWithoutStats} />
          <KpiCard label="Statistik unvollständig" value={data.dataQuality.incompleteStats} tone={data.dataQuality.incompleteStats ? "warning" : undefined} />
          <KpiCard label="Mit Prüfhinweisen" value={data.dataQuality.withWarnings} tone={data.dataQuality.withWarnings ? "warning" : undefined} sub="z. B. GIR trotz vieler Schläge" />
        </CardBody>
      </Card>
      {can("community.moderate") && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-ink">Ranking aktualisieren</p>
              <p className="text-sm text-ink-3">Baut Profile, Ranking und Statistik aller Mitglieder neu auf und ersetzt den heutigen Ranking-Stand.</p>
            </div>
            <Button
              variant="secondary"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  const res = await api.admin.refreshRanking();
                  toast(`Aktualisiert: ${res.users} Mitglieder, Stand ${formatDate(res.snapshotDate)}.`);
                  reload();
                } catch (e) {
                  toast(userMessage(e), "error");
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />} Ranking aktualisieren
            </Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function RankingAdmin() {
  const toast = useToast();
  const { can } = useSession();
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [hide, setHide] = useState<{ row: AdminRankingRow; key: "rankingVisible" | "profileVisible" } | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, error, loading, reload } = useApi(() => api.admin.communityRanking({ filter, q, page }), `${filter}|${q}|${page}`);
  const moderate = can("community.moderate");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Suche" htmlFor="cr-q" className="w-64">
          <Input id="cr-q" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name oder Anzeigename" />
        </Field>
        <Field label="Filter" htmlFor="cr-f" className="w-56">
          <Select id="cr-f" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
            <option value="">Alle Mitglieder</option>
            <option value="OPT_IN">Im Ranking (Zustimmung)</option>
            <option value="OPT_OUT">Nicht im Ranking</option>
            <option value="ACTIVE">Nur aktive Konten</option>
          </Select>
        </Field>
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
                <Th right>Platz</Th>
                <Th>Mitglied</Th>
                <Th>Anzeigename</Th>
                <Th right>HCPI</Th>
                <Th>Freigaben</Th>
                <Th right>Geteilte Runden</Th>
                <Th>Status</Th>
                {moderate && <Th />}
              </tr>
            }
            empty={data.items.length === 0 ? <EmptyRow text="Keine Einträge." /> : undefined}
          >
            {data.items.map((r) => (
              <tr key={r.userId}>
                <Td right>{r.position ?? "–"}</Td>
                <Td>
                  <Link href={userHref(r.userId)} className="font-medium text-ink hover:text-brand hover:underline">
                    {r.name}
                  </Link>
                </Td>
                <Td>{r.displayName}</Td>
                <Td right>{formatHcp(r.handicapIndex)}</Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {r.rankingVisible && <Badge tone="brand">Ranking</Badge>}
                    {r.profileVisible && <Badge tone="good">Profil</Badge>}
                    {r.roundsVisible && <Badge tone="info">Runden</Badge>}
                    {r.statsVisible && <Badge tone="accent">Statistik</Badge>}
                    {!r.rankingVisible && !r.profileVisible && <span className="text-xs text-ink-3">privat</span>}
                  </span>
                </Td>
                <Td right>{r.publicRoundsCount}</Td>
                <Td>{r.status === "ACTIVE" ? <span className="text-xs text-ink-3">aktiv</span> : <Badge tone="warning">{r.status}</Badge>}</Td>
                {moderate && (
                  <Td className="whitespace-nowrap text-right">
                    {r.rankingVisible && (
                      <Button size="sm" variant="ghost" onClick={() => setHide({ row: r, key: "rankingVisible" })}>
                        Aus Ranking
                      </Button>
                    )}
                    {r.profileVisible && (
                      <Button size="sm" variant="ghost" onClick={() => setHide({ row: r, key: "profileVisible" })}>
                        Profil verbergen
                      </Button>
                    )}
                  </Td>
                )}
              </tr>
            ))}
          </AdminTable>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        </>
      )}
      <ConfirmDialog
        open={hide !== null}
        title={hide?.key === "rankingVisible" ? "Aus dem Ranking entfernen?" : "Profil verbergen?"}
        confirmLabel={hide?.key === "rankingVisible" ? "Entfernen" : "Verbergen"}
        busy={busy}
        onClose={() => setHide(null)}
        onConfirm={async () => {
          if (!hide) return;
          setBusy(true);
          try {
            await api.admin.hideUserCommunity(hide.row.userId, { [hide.key]: false });
            toast("Gespeichert und protokolliert.");
            setHide(null);
            reload();
          } catch (e) {
            toast(userMessage(e), "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-ink-2">
          {hide?.row.name}: Die Freigabe wird ausgeschaltet. Einschalten kann sie nur das Mitglied selbst – die Administration kann Freigaben nie erteilen.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function RoundActions({ row, onPick }: { row: AdminPublicRoundRow; onPick: (a: ModerationAction) => void }) {
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {row.hidden ? (
        <Button size="sm" variant="secondary" onClick={() => onPick("UNHIDE")}>
          Freigeben
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => onPick("HIDE")}>
          <EyeOff className="h-3.5 w-3.5" aria-hidden /> Ausblenden
        </Button>
      )}
      {row.visibility !== "PRIVATE" && (
        <Button size="sm" variant="ghost" onClick={() => onPick("MAKE_PRIVATE")}>
          Privat
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => onPick("REMOVE_NOTES")}>
        Notizen
      </Button>
    </span>
  );
}

function RoundsAdmin() {
  const { can } = useSession();
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<{ userId: string; roundId: string; action: ModerationAction; label: string } | null>(null);
  const { data, error, loading, reload } = useApi(() => api.admin.communityRounds({ filter, q, page }), `${filter}|${q}|${page}`);
  const moderate = can("community.moderate");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Suche" htmlFor="crr-q" className="w-64">
          <Input id="crr-q" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Mitglied oder Platz" />
        </Field>
        <Field label="Filter" htmlFor="crr-f" className="w-56">
          <Select id="crr-f" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
            <option value="">Geteilt oder ausgeblendet</option>
            <option value="FULL">Mit Details</option>
            <option value="HIDDEN">Ausgeblendet</option>
          </Select>
        </Field>
      </div>
      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <PageSkeleton variant="table" />
      ) : (
        <>
          <AdminTable
            loading={loading}
            minWidth="60rem"
            head={
              <tr>
                <Th>Datum</Th>
                <Th>Mitglied</Th>
                <Th>Platz</Th>
                <Th right>Löcher</Th>
                <Th>Sichtbarkeit</Th>
                <Th>Für andere</Th>
                {moderate && <Th />}
              </tr>
            }
            empty={data.items.length === 0 ? <EmptyRow text="Keine geteilten Runden." /> : undefined}
          >
            {data.items.map((r) => (
              <tr key={`${r.userId}-${r.roundId}`} className={r.hidden ? "bg-warning-soft/40" : undefined}>
                <Td>
                  <Link href={adminRoundHref(r.userId, r.roundId)} className="text-brand hover:underline">
                    {formatDate(r.date)}
                  </Link>
                </Td>
                <Td>
                  <Link href={userHref(r.userId)} className="font-medium text-ink hover:text-brand hover:underline">
                    {r.userName}
                  </Link>
                  <span className="block text-xs text-ink-3">{r.displayName}</span>
                </Td>
                <Td className="max-w-[14rem] truncate">{r.courseName}</Td>
                <Td right>{r.holes}</Td>
                <Td>
                  {VISIBILITY_LABELS[r.visibility].label}
                  {r.detailed && <span className="block text-xs text-ink-3">mit Lochstatistik</span>}
                </Td>
                <Td>{r.hidden ? <Badge tone="warning">ausgeblendet</Badge> : r.level ? <Badge tone={r.level === "FULL" ? "info" : "neutral"}>{r.level === "FULL" ? "Details" : "Basis"}</Badge> : <span className="text-xs text-ink-3">nicht sichtbar</span>}</Td>
                {moderate && (
                  <Td>
                    <RoundActions row={r} onPick={(action) => setTarget({ userId: r.userId, roundId: r.roundId, action, label: `${r.userName} · ${r.courseName} · ${formatDate(r.date)}` })} />
                  </Td>
                )}
              </tr>
            ))}
          </AdminTable>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          <p className="text-xs text-ink-3">„Nicht sichtbar“: Das Mitglied hat die Runde freigegeben, aber Runden in den Privatsphäre-Einstellungen nicht geteilt – oder die Community-Schalter verhindern die Anzeige.</p>
        </>
      )}
      <ModerationDialog
        target={target}
        onClose={() => setTarget(null)}
        onDone={() => {
          setTarget(null);
          reload();
        }}
      />
    </div>
  );
}

/** Admin → Community: Übersicht, Ranking und geteilte Runden (Berechtigung community.read, Moderation community.moderate). */
export function CommunityAdminPage() {
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("tab") as Tab | null;
  const tab: Tab = requested === "ranking" || requested === "rounds" ? requested : "overview";
  return (
    <div className="space-y-5">
      <PageHeader title="Community" description="Freigaben der Mitglieder, Ranking und Moderation. Privatsphäre-Einstellungen der Mitglieder werden nie überschrieben – Admins können nur ausblenden." />
      <Segmented
        name="Bereich"
        value={tab}
        onChange={(t) => router.replace(`/admin/community?tab=${t}`, { scroll: false })}
        options={[
          { value: "overview", label: "Übersicht" },
          { value: "ranking", label: "Ranking" },
          { value: "rounds", label: "Geteilte Runden" },
        ]}
      />
      {tab === "overview" && <Overview />}
      {tab === "ranking" && <RankingAdmin />}
      {tab === "rounds" && <RoundsAdmin />}
    </div>
  );
}

/** Community-Status eines Benutzers (Admin → Benutzer). Freigaben lassen sich nur ausschalten. */
export function UserCommunityCard({ userId, community, onChange }: { userId: string; community: AdminUserDetail["community"]; onChange: () => void }) {
  const toast = useToast();
  const { can } = useSession();
  const [hide, setHide] = useState<"rankingVisible" | "profileVisible" | null>(null);
  const [busy, setBusy] = useState(false);
  const s = community.settings;
  const items: { key: keyof typeof s; label: string }[] = [
    { key: "rankingVisible", label: "Ranking" },
    { key: "profileVisible", label: "Profil" },
    { key: "roundsVisible", label: "Runden" },
    { key: "statsVisible", label: "Statistik" },
    { key: "notesVisible", label: "Notizen" },
  ];
  return (
    <Card>
      <CardHeader title="Community & Privatsphäre" subtitle={`Anzeigename: ${community.displayName}`} />
      <CardBody className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {items.map((i) => (
            <Badge key={i.key} tone={s[i.key] ? "good" : "neutral"}>
              {i.label}: {s[i.key] ? "geteilt" : "privat"}
            </Badge>
          ))}
        </div>
        <dl className="grid grid-cols-2 gap-2">
          <div>
            <dt className="text-xs text-ink-3">Geteilte Runden</dt>
            <dd className="tabular font-semibold text-ink">{community.publicRounds}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Ausgeblendet</dt>
            <dd className="tabular font-semibold text-ink">{community.hiddenRounds}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Mit Lochstatistik</dt>
            <dd className="tabular font-semibold text-ink">{community.detailedRounds}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Vorauswahl neue Runden</dt>
            <dd className="font-semibold text-ink">{VISIBILITY_LABELS[s.defaultRoundVisibility].label}</dd>
          </div>
        </dl>
        {can("community.moderate") && (s.rankingVisible || s.profileVisible) && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {s.rankingVisible && (
              <Button size="sm" variant="secondary" onClick={() => setHide("rankingVisible")}>
                Aus dem Ranking entfernen
              </Button>
            )}
            {s.profileVisible && (
              <Button size="sm" variant="secondary" onClick={() => setHide("profileVisible")}>
                Profil verbergen
              </Button>
            )}
          </div>
        )}
        <p className="text-xs text-ink-3">Freigaben erteilt nur das Mitglied selbst. Die Administration kann sie ausschalten (protokolliert), aber nie einschalten.</p>
      </CardBody>
      <ConfirmDialog
        open={hide !== null}
        title={hide === "rankingVisible" ? "Aus dem Ranking entfernen?" : "Profil verbergen?"}
        confirmLabel={hide === "rankingVisible" ? "Entfernen" : "Verbergen"}
        busy={busy}
        onClose={() => setHide(null)}
        onConfirm={async () => {
          if (!hide) return;
          setBusy(true);
          try {
            await api.admin.hideUserCommunity(userId, { [hide]: false });
            toast("Gespeichert und protokolliert.");
            setHide(null);
            onChange();
          } catch (e) {
            toast(userMessage(e), "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-ink-2">Die Freigabe wird ausgeschaltet. Das Mitglied kann sie selbst wieder einschalten.</p>
      </ConfirmDialog>
    </Card>
  );
}

/** Community-Teil der Admin-Rundenansicht: Sichtbarkeit, Moderation und Statistik. */
export function AdminRoundCommunity({ userId, roundId, visibility, moderation, hasNotes, onChange }: { userId: string; roundId: string; visibility: RoundVisibility; moderation: RoundModeration | null; hasNotes: boolean; onChange: () => void }) {
  const { can } = useSession();
  const [target, setTarget] = useState<{ userId: string; roundId: string; action: ModerationAction; label: string } | null>(null);
  const pick = (action: ModerationAction) => setTarget({ userId, roundId, action, label: "Diese Runde" });
  return (
    <Card>
      <CardHeader title="Community" subtitle={`Sichtbarkeit (vom Mitglied gewählt): ${VISIBILITY_LABELS[visibility].label}`} />
      <CardBody className="space-y-3 text-sm">
        {moderation?.hidden ? (
          <Alert tone="warning" title="Für andere Mitglieder ausgeblendet">
            {formatDateTime(moderation.at)}
            {moderation.by ? ` von ${moderation.by}` : ""}
            {moderation.reason ? ` – ${moderation.reason}` : ""}
          </Alert>
        ) : (
          <p className="text-ink-2">{visibility === "PRIVATE" ? "Nicht geteilt." : "Für andere Mitglieder sichtbar, soweit die Freigaben des Mitglieds es erlauben."}</p>
        )}
        {can("community.moderate") && (
          <div className="flex flex-wrap gap-2">
            {moderation?.hidden ? (
              <Button size="sm" variant="secondary" onClick={() => pick("UNHIDE")}>
                Wieder freigeben
              </Button>
            ) : (
              visibility !== "PRIVATE" && (
                <Button size="sm" variant="secondary" onClick={() => pick("HIDE")}>
                  <EyeOff className="h-3.5 w-3.5" aria-hidden /> Für andere ausblenden
                </Button>
              )
            )}
            {visibility !== "PRIVATE" && (
              <Button size="sm" variant="ghost" onClick={() => pick("MAKE_PRIVATE")}>
                Auf „Nur ich“ setzen
              </Button>
            )}
            {hasNotes && (
              <Button size="sm" variant="ghost" onClick={() => pick("REMOVE_NOTES")}>
                Notizen entfernen
              </Button>
            )}
          </div>
        )}
      </CardBody>
      <ModerationDialog
        target={target}
        onClose={() => setTarget(null)}
        onDone={() => {
          setTarget(null);
          onChange();
        }}
      />
    </Card>
  );
}
