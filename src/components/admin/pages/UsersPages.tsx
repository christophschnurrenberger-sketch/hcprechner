"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowLeft, Eye, KeyRound, Loader2, Mail, Plus, ShieldCheck, Trash2, UserCheck } from "lucide-react";
import { api } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import type { AdminUserDetail } from "@/lib/api/types";
import { ROLES, ROLE_LABELS, STATUS_LABELS, USER_STATUSES, type Role, type UserStatus } from "@/lib/auth/permissions";
import { formatDate, formatDecimal, formatHcp } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardHeader, Field, Input, PageHeader, Segmented, Select } from "@/components/ui";
import { ConfirmDialog, ErrorState, PageSkeleton, PasswordInput, useToast } from "@/components/ui/feedback";
import { useFormErrors } from "@/components/auth/useFormErrors";
import { useSession } from "@/components/session/SessionProvider";
import { HcpHistoryChart } from "@/components/member/HcpHistoryChart";
import { AdminTable, AuditActionLabel, AuditValue, EmptyRow, Pagination, RoleBadge, StatusBadge, Td, Th, formatDateTime } from "../AdminUi";

export const userHref = (id: string) => `/admin/users/view?id=${encodeURIComponent(id)}`;

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------

export function UsersListPage() {
  const { can } = useSession();
  const [filter, setFilter] = useState({ q: "", role: "", status: "", verified: "", sort: "name" });
  const [page, setPage] = useState(1);
  const key = JSON.stringify({ ...filter, page });
  const { data, error, loading, reload } = useApi(() => api.admin.users({ ...filter, page, pageSize: 25 }), key);
  const set = (patch: Partial<typeof filter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Benutzer"
        description={data ? `${data.total} Konten` : undefined}
        actions={
          can("users.write") && (
            <ButtonLink href="/admin/users/new" size="sm">
              <Plus className="h-4 w-4" aria-hidden /> Benutzer anlegen
            </ButtonLink>
          )
        }
      />
      <div className="flex flex-wrap gap-2">
        <Input value={filter.q} onChange={(e) => set({ q: e.target.value })} placeholder="Name, E-Mail, ID" className="max-w-xs" aria-label="Benutzer suchen" />
        <Select value={filter.role} onChange={(e) => set({ role: e.target.value })} className="max-w-[11rem]" aria-label="Rolle">
          <option value="">Alle Rollen</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        <Select value={filter.status} onChange={(e) => set({ status: e.target.value })} className="max-w-[10rem]" aria-label="Status">
          <option value="">Alle Status</option>
          {USER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select value={filter.verified} onChange={(e) => set({ verified: e.target.value })} className="max-w-[12rem]" aria-label="E-Mail-Status">
          <option value="">E-Mail: alle</option>
          <option value="yes">bestätigt</option>
          <option value="no">nicht bestätigt</option>
        </Select>
        <Select value={filter.sort} onChange={(e) => set({ sort: e.target.value })} className="max-w-[12rem]" aria-label="Sortierung">
          <option value="name">Name</option>
          <option value="created">Neueste zuerst</option>
          <option value="lastLogin">Letzte Anmeldung</option>
          <option value="lastActivity">Letzte Aktivität</option>
          <option value="role">Rolle</option>
        </Select>
      </div>
      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <PageSkeleton variant="table" />
      ) : (
        <>
          <AdminTable
            loading={loading}
            head={
              <tr>
                <Th>Name</Th>
                <Th>E-Mail</Th>
                <Th>Rolle</Th>
                <Th>Status</Th>
                <Th right>Runden</Th>
                <Th>Registriert</Th>
                <Th>Letzte Anmeldung</Th>
              </tr>
            }
            empty={data.items.length === 0 ? <EmptyRow text="Keine Benutzer gefunden." /> : undefined}
          >
            {data.items.map((u) => (
              <tr key={u.id} className="hover:bg-surface-2">
                <Td>
                  <Link href={userHref(u.id)} className="font-medium text-ink hover:text-brand hover:underline">
                    {u.firstName} {u.lastName}
                  </Link>
                  {u.username && <span className="block text-xs text-ink-3">Benutzername {u.username}</span>}
                </Td>
                <Td>
                  <span className="text-ink-2">{u.email ?? "–"}</span>
                  {!u.emailVerified && u.email && <Badge tone="warning" className="ml-1">unbestätigt</Badge>}
                </Td>
                <Td>
                  <RoleBadge role={u.role} />
                </Td>
                <Td>
                  <StatusBadge status={u.status} />
                </Td>
                <Td right>{u.rounds}</Td>
                <Td className="text-ink-2">{formatDate(u.createdAt)}</Td>
                <Td className="text-ink-2">{formatDateTime(u.lastLoginAt)}</Td>
              </tr>
            ))}
          </AdminTable>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anlegen
// ---------------------------------------------------------------------------

export function NewUserPage() {
  const router = useRouter();
  const toast = useToast();
  const { can, user: me } = useSession();
  const errors = useFormErrors();
  const [values, setValues] = useState({ firstName: "", lastName: "", email: "", role: "USER" as Role, password: "" });
  const [mode, setMode] = useState<"invite" | "password">("invite");
  const [busy, setBusy] = useState(false);
  const rank = (r: Role) => ROLES.indexOf(r);
  const assignable = ROLES.filter((r) => r === "USER" || (can("users.roles") && me && rank(r) <= rank(me.role)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    errors.clear();
    try {
      const res = await api.admin.createUser({ ...values, password: mode === "password" ? values.password : "" });
      toast(res.invite ? (res.mailSent ? "Benutzer angelegt – Einladung verschickt." : "Benutzer angelegt. Die Einladung konnte nicht verschickt werden.") : "Benutzer angelegt.", res.invite && !res.mailSent ? "error" : "success");
      router.push(userHref(res.user.id));
    } catch (error) {
      errors.fromError(error);
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Benutzer
      </Link>
      <PageHeader title="Benutzer anlegen" />
      <Card>
        <CardBody>
          <form onSubmit={submit} noValidate className="space-y-4">
            {errors.form && <Alert tone="error">{errors.form}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Vorname" htmlFor="n-first" error={errors.fields.firstName}>
                <Input id="n-first" value={values.firstName} onChange={(e) => setValues({ ...values, firstName: e.target.value })} required />
              </Field>
              <Field label="Nachname" htmlFor="n-last" error={errors.fields.lastName}>
                <Input id="n-last" value={values.lastName} onChange={(e) => setValues({ ...values, lastName: e.target.value })} required />
              </Field>
            </div>
            <Field label="E-Mail-Adresse" htmlFor="n-email" error={errors.fields.email}>
              <Input id="n-email" type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} required />
            </Field>
            <Field label="Rolle" htmlFor="n-role" hint={assignable.length === 1 ? "Weitere Rollen vergibt ein Super-Admin." : undefined} error={errors.fields.role}>
              <Select id="n-role" value={values.role} onChange={(e) => setValues({ ...values, role: e.target.value as Role })}>
                {assignable.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Zugang">
              <Segmented
                name="Zugang"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "invite", label: "Einladung per E-Mail" },
                  { value: "password", label: "Vorläufiges Passwort" },
                ]}
              />
            </Field>
            {mode === "password" && (
              <Field label="Vorläufiges Passwort" htmlFor="n-pw" hint="Mindestens 8 Zeichen. Der Benutzer muss es bei der ersten Anmeldung ändern." error={errors.fields.password}>
                <PasswordInput id="n-pw" autoComplete="new-password" value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} />
              </Field>
            )}
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Benutzer anlegen
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function ManageCard({ user, onChange }: { user: AdminUserDetail; onChange: () => void }) {
  const toast = useToast();
  const { can, user: me } = useSession();
  const router = useRouter();
  const [values, setValues] = useState({ firstName: user.firstName, lastName: user.lastName, email: user.email ?? "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [tempPw, setTempPw] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<UserStatus | null>(null);
  const errors = useFormErrors();
  const rank = (r: Role) => ROLES.indexOf(r);

  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    try {
      await fn();
      toast(success);
      onChange();
    } catch (e) {
      toast(userMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  if (!user.canManage) {
    return (
      <Card>
        <CardHeader title="Verwaltung" />
        <CardBody>
          <Alert tone="info">{me?.id === user.id ? "Dein eigenes Konto bearbeitest du unter „Profil“." : "Für dieses Konto fehlt dir die Berechtigung (gleiche oder höhere Rolle)."}</Alert>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Stammdaten" />
        <CardBody>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy("profile");
              try {
                await api.admin.updateUser(user.id, values);
                toast("Gespeichert.");
                errors.clear();
                onChange();
              } catch (error) {
                errors.fromError(error);
              } finally {
                setBusy(null);
              }
            }}
          >
            {errors.form && <Alert tone="error">{errors.form}</Alert>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Vorname" htmlFor="u-first" error={errors.fields.firstName}>
                <Input id="u-first" value={values.firstName} onChange={(e) => setValues({ ...values, firstName: e.target.value })} />
              </Field>
              <Field label="Nachname" htmlFor="u-last" error={errors.fields.lastName}>
                <Input id="u-last" value={values.lastName} onChange={(e) => setValues({ ...values, lastName: e.target.value })} />
              </Field>
            </div>
            <Field label="E-Mail-Adresse" htmlFor="u-email" error={errors.fields.email}>
              <Input id="u-email" type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} />
            </Field>
            <Button type="submit" size="sm" disabled={busy !== null}>
              {busy === "profile" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Speichern
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Rolle & Status" />
        <CardBody className="space-y-4">
          {user.canAssignRole ? (
            <Field label="Rolle" htmlFor="u-role">
              <Select
                id="u-role"
                value={user.role}
                disabled={busy !== null}
                onChange={(e) => run("role", () => api.admin.updateUser(user.id, { role: e.target.value as Role }), "Rolle geändert.")}
              >
                {ROLES.filter((r) => me && rank(r) <= rank(me.role)).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="text-sm text-ink-2">
              Rolle: <RoleBadge role={user.role} /> <span className="text-xs text-ink-3">(Rollen vergibt ein Super-Admin)</span>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {user.status !== "ACTIVE" && (
              <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => run("status", () => api.admin.updateUser(user.id, { status: "ACTIVE" }), "Konto aktiviert.")}>
                <UserCheck className="h-4 w-4" aria-hidden /> Aktivieren
              </Button>
            )}
            {user.status === "ACTIVE" && (
              <>
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setConfirmStatus("DISABLED")}>
                  Deaktivieren
                </Button>
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setConfirmStatus("LOCKED")}>
                  Sperren
                </Button>
              </>
            )}
            {!user.emailVerified && user.email && (
              <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => run("verify", () => api.admin.updateUser(user.id, { emailVerified: true }), "E-Mail als bestätigt markiert.")}>
                <ShieldCheck className="h-4 w-4" aria-hidden /> E-Mail bestätigen
              </Button>
            )}
          </div>
          <p className="text-xs text-ink-3">Deaktivierte oder gesperrte Konten können sich nicht anmelden; ihre Daten bleiben erhalten.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Passwort" />
        <CardBody className="space-y-3">
          <Button size="sm" variant="secondary" disabled={busy !== null || !user.email} onClick={() => run("mail", () => api.admin.userPassword(user.id, "mail"), "Link zum Zurücksetzen verschickt.")}>
            <Mail className="h-4 w-4" aria-hidden /> Link zum Zurücksetzen senden
          </Button>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run("temp", () => api.admin.userPassword(user.id, "temporary", tempPw), "Vorläufiges Passwort gesetzt. Alle Sitzungen des Benutzers wurden beendet.").then(() => setTempPw(""));
            }}
          >
            <Field label="Vorläufiges Passwort setzen" htmlFor="u-temp" className="w-64">
              <PasswordInput id="u-temp" autoComplete="new-password" value={tempPw} onChange={(e) => setTempPw(e.target.value)} />
            </Field>
            <Button type="submit" size="sm" variant="secondary" disabled={busy !== null || tempPw.length < 8}>
              <KeyRound className="h-4 w-4" aria-hidden /> Setzen
            </Button>
          </form>
        </CardBody>
      </Card>

      {can("users.delete") && (
        <Card>
          <CardHeader title="Konto löschen" subtitle="Löscht Konto und alle Runden endgültig. Das Audit-Log bleibt erhalten." />
          <CardBody>
            <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" aria-hidden /> Löschen …
            </Button>
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={confirmStatus !== null}
        title={confirmStatus === "LOCKED" ? "Konto sperren?" : "Konto deaktivieren?"}
        confirmLabel={confirmStatus === "LOCKED" ? "Sperren" : "Deaktivieren"}
        busy={busy === "status"}
        onClose={() => setConfirmStatus(null)}
        onConfirm={() => {
          const next = confirmStatus!;
          setConfirmStatus(null);
          void run("status", () => api.admin.updateUser(user.id, { status: next }), next === "LOCKED" ? "Konto gesperrt." : "Konto deaktiviert.");
        }}
      >
        <p className="text-ink-2">
          {user.firstName} {user.lastName} kann sich danach nicht mehr anmelden. Laufende Sitzungen enden sofort. Die Daten bleiben erhalten.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmDelete}
        title="Konto endgültig löschen?"
        confirmLabel="Endgültig löschen"
        requireText="LÖSCHEN"
        busy={busy === "delete"}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async (typed) => {
          setBusy("delete");
          try {
            await api.admin.deleteUser(user.id, typed);
            toast("Konto gelöscht.");
            router.replace("/admin/users");
          } catch (e) {
            toast(userMessage(e), "error");
            setBusy(null);
          }
        }}
      >
        <p className="text-ink-2">
          {user.firstName} {user.lastName} ({user.email ?? "ohne E-Mail"}) mit {user.rounds} Runden wird gelöscht.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function ActivityCard({ userId }: { userId: string }) {
  const { can } = useSession();
  const logs = useApi(() => (can("logs.read") ? api.admin.logs({ userId, pageSize: 15 }) : Promise.resolve(null)), `logs-${userId}`);
  if (!can("logs.read")) return null;
  return (
    <Card>
      <CardHeader title="Aktivität" action={<Link href={`/admin/logs?userId=${encodeURIComponent(userId)}`} className="text-sm text-brand hover:underline">Audit-Log</Link>} />
      <CardBody className="p-0">
        {!logs.data ? (
          <p className="px-5 py-4 text-sm text-ink-3">Wird geladen …</p>
        ) : logs.data.items.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-3">Keine Einträge.</p>
        ) : (
          <ul className="divide-y divide-border">
            {logs.data.items.map((e) => (
              <li key={e.id} className="grid grid-cols-[1fr_auto] gap-2 px-5 py-2.5 text-sm">
                <span>
                  <span className="font-medium text-ink">
                    <AuditActionLabel action={e.action} />
                  </span>
                  <span className="block text-xs text-ink-3">{e.actorName ?? "System"}</span>
                  {e.newValue !== null && e.newValue !== undefined && (
                    <span className="mt-1 block text-ink-2">
                      <AuditValue value={e.newValue} />
                    </span>
                  )}
                </span>
                <span className="text-xs text-ink-3">{formatDateTime(e.timestamp)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function UserDetailPage() {
  const id = useSearchParams().get("id") ?? "";
  const { can } = useSession();
  const { data: user, error, reload } = useApi(() => api.admin.user(id), `user-${id}`);
  if (error && !user) return <ErrorState error={error} onRetry={reload} />;
  if (!user) return <PageSkeleton variant="detail" />;
  const hcp = user.hcp;
  return (
    <div className="space-y-5">
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Benutzer
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {user.firstName} {user.lastName}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-3">
            {user.email ?? "keine E-Mail"} {user.emailVerified ? <Badge tone="good">bestätigt</Badge> : <Badge tone="warning">unbestätigt</Badge>} <RoleBadge role={user.role} /> <StatusBadge status={user.status} />
            {user.mustChangePassword && <Badge tone="info">vorläufiges Passwort</Badge>}
          </p>
          {user.pendingEmail && <p className="mt-1 text-xs text-ink-3">Neue E-Mail-Adresse wartet auf Bestätigung: {user.pendingEmail}</p>}
        </div>
        {can("users.impersonate") && (
          <ButtonLink href={`/admin/users/impersonate?id=${encodeURIComponent(user.id)}`} variant="secondary" size="sm">
            <Eye className="h-4 w-4" aria-hidden /> Benutzeransicht öffnen
          </ButtonLink>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-xs text-ink-3">Handicap Index</p>
          <p className="tabular text-2xl font-semibold text-brand">{formatHcp(hcp.currentHandicapIndex)}</p>
          <p className="text-xs text-ink-3">{user.hcpState === "INITIAL" ? "Initial Handicap (Start-HCPI)" : "aktiver WHS Scoring Record"}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-xs text-ink-3">Runden</p>
          <p className="tabular text-2xl font-semibold">{user.rounds}</p>
          <p className="text-xs text-ink-3">letzte {formatDate(user.lastRoundDate)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-xs text-ink-3">Start-HCPI</p>
          <p className="tabular text-2xl font-semibold">{formatHcp(hcp.startHandicapIndex)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-xs text-ink-3">Registriert</p>
          <p className="text-sm font-semibold">{formatDate(user.createdAt)}</p>
          <p className="text-xs text-ink-3">Anmeldung {formatDateTime(user.lastLoginAt)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-xs text-ink-3">Letzte Aktivität</p>
          <p className="text-sm font-semibold">{formatDateTime(user.lastActivityAt)}</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Handicap" subtitle={hcp.calculationLabel} />
            <CardBody className="space-y-4">
              <HcpHistoryChart history={hcp.history} height={200} />
              {hcp.deviation && <Alert tone="info">Abweichung vom berechneten Wert ({formatHcp(hcp.calculatedHandicapIndex)}): {hcp.deviation.reasons.join(", ") || hcp.deviation.text}</Alert>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Runden" subtitle="Neu berechnet mit der aktuellen Engine" />
            <CardBody className="p-0">
              <AdminTable
                minWidth="40rem"
                head={
                  <tr>
                    <Th>Datum</Th>
                    <Th>Golfplatz</Th>
                    <Th right>Löcher</Th>
                    <Th right>GBE</Th>
                    <Th right>SD</Th>
                    <Th right>HCPI danach</Th>
                    <Th>zählt</Th>
                  </tr>
                }
                empty={user.allRounds.length === 0 ? <EmptyRow text="Noch keine Runden." /> : undefined}
              >
                {user.allRounds.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2">
                    <Td className="whitespace-nowrap">{formatDate(r.date)}</Td>
                    <Td>
                      {can("rounds.read") ? (
                        <Link href={`/admin/rounds/view?user=${encodeURIComponent(user.id)}&id=${encodeURIComponent(r.id)}`} className="text-ink hover:text-brand hover:underline">
                          {r.courseName}
                        </Link>
                      ) : (
                        r.courseName
                      )}
                    </Td>
                    <Td right>{r.holes}</Td>
                    <Td right>{r.adjustedGrossScore ?? "–"}</Td>
                    <Td right>{formatDecimal(r.scoreDifferential)}</Td>
                    <Td right>{formatHcp(r.handicapIndexAfter)}</Td>
                    <Td>{r.counted ? <Badge tone="good">ja</Badge> : <span className="text-xs text-ink-3">{r.note ?? "nein"}</span>}</Td>
                  </tr>
                ))}
              </AdminTable>
            </CardBody>
          </Card>
          <ActivityCard userId={user.id} />
        </div>
        <ManageCard user={user} onChange={reload} />
      </div>
    </div>
  );
}
