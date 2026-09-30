"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { api, type LogFilter } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import type { AdminSettings } from "@/lib/api/types";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { PERMISSION_LABELS, ROLES, ROLE_LABELS, ROLE_PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { adminCoursePath } from "@/lib/courses/paths";
import { cn } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { CommunityFlags } from "@/lib/community/types";
import { FLAG_LABELS } from "./CommunityAdminPages";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ErrorState, PageSkeleton, PasswordInput, useToast } from "@/components/ui/feedback";
import { useSession } from "@/components/session/SessionProvider";
import { AdminTable, AuditActionLabel, AuditValue, EmptyRow, Pagination, RoleBadge, Td, Th, formatDateTime } from "../AdminUi";
import { userHref } from "./UsersPages";
import { adminRoundHref } from "./RoundsPages";

// ---------------------------------------------------------------------------
// Audit-Log
// ---------------------------------------------------------------------------

export function LogsPage() {
  const params = useSearchParams();
  const [filter, setFilter] = useState<LogFilter>({
    action: params.get("action") ?? "",
    group: (params.get("group") as LogFilter["group"]) ?? "",
    userId: params.get("userId") ?? "",
    actorId: params.get("actorId") ?? "",
    q: "",
    from: "",
    to: "",
  });
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi(() => api.admin.logs({ ...filter, page, pageSize: 50 }), JSON.stringify({ ...filter, page }));
  const set = (patch: Partial<LogFilter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Audit-Log" description="Protokoll aller sicherheitsrelevanten Aktionen: Zeitpunkt, Akteur, betroffener Benutzer, Objekt, alter und neuer Wert." />
      <div className="flex flex-wrap gap-2">
        <Input value={filter.q} onChange={(e) => set({ q: e.target.value })} placeholder="Freitext" className="max-w-[14rem]" aria-label="Freitext" />
        <Select value={filter.group} onChange={(e) => set({ group: e.target.value as LogFilter["group"] })} className="max-w-[12rem]" aria-label="Gruppe">
          <option value="">Alle Bereiche</option>
          <option value="admin">Admin-Aktionen</option>
          <option value="member">Mitglieder-Aktivität</option>
        </Select>
        <Select value={filter.action} onChange={(e) => set({ action: e.target.value })} className="max-w-[16rem]" aria-label="Aktion">
          <option value="">Alle Aktionen</option>
          {Object.entries(AUDIT_ACTIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Input type="date" value={filter.from} onChange={(e) => set({ from: e.target.value })} className="max-w-[10rem]" aria-label="von" />
        <Input type="date" value={filter.to} onChange={(e) => set({ to: e.target.value })} className="max-w-[10rem]" aria-label="bis" />
        {(filter.userId || filter.actorId) && (
          <button type="button" className="text-sm text-brand hover:underline" onClick={() => set({ userId: "", actorId: "" })}>
            Benutzerfilter entfernen
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
            minWidth="64rem"
            head={
              <tr>
                <Th>Zeitpunkt</Th>
                <Th>Aktion</Th>
                <Th>Akteur</Th>
                <Th>Betroffen</Th>
                <Th>Objekt</Th>
                <Th>alt</Th>
                <Th>neu</Th>
              </tr>
            }
            empty={data.items.length === 0 ? <EmptyRow text="Keine Einträge." /> : undefined}
          >
            {data.items.map((e) => (
              <tr key={e.id} className="align-top">
                <Td className="whitespace-nowrap text-xs text-ink-2">{formatDateTime(e.timestamp)}</Td>
                <Td className="font-medium">
                  <AuditActionLabel action={e.action} />
                </Td>
                <Td>
                  {e.actorId ? (
                    <button type="button" className="text-left text-brand hover:underline" onClick={() => set({ actorId: e.actorId! })}>
                      {e.actorName ?? "Benutzer"}
                    </button>
                  ) : (
                    <span className="text-ink-3">System</span>
                  )}
                </Td>
                <Td>
                  {e.userId ? (
                    <Link href={userHref(e.userId)} className="text-brand hover:underline">
                      Konto
                    </Link>
                  ) : (
                    "–"
                  )}
                </Td>
                <Td className="text-xs">
                  {e.entityType ?? "–"}
                  {e.entityType === "round" && e.userId && e.entityId ? (
                    <Link href={adminRoundHref(e.userId, e.entityId)} className="block text-brand hover:underline">
                      öffnen
                    </Link>
                  ) : e.entityType === "course" && e.entityId ? (
                    <Link href={adminCoursePath(e.entityId)} className="block text-brand hover:underline">
                      öffnen
                    </Link>
                  ) : null}
                </Td>
                <Td className="max-w-[16rem]">
                  <AuditValue value={e.oldValue} />
                </Td>
                <Td className="max-w-[16rem]">
                  <AuditValue value={e.newValue} />
                </Td>
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
// Systemstatus
// ---------------------------------------------------------------------------

export function SystemPage() {
  const { data, error, reload } = useApi(() => api.admin.system(), "system");
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton variant="table" />;
  const Icon = { OK: CheckCircle2, WARNING: AlertTriangle, ERROR: XCircle };
  const color = { OK: "text-good", WARNING: "text-warning", ERROR: "text-critical" };
  return (
    <div className="space-y-5">
      <PageHeader title="Systemstatus" description={`Speicher: ${data.storage}`} actions={<Button variant="secondary" size="sm" onClick={reload}>Aktualisieren</Button>} />
      <Card>
        <CardHeader title="Prüfungen" />
        <CardBody className="p-0">
          <ul className="divide-y divide-border">
            {data.checks.map((c) => {
              const I = Icon[c.state];
              return (
                <li key={c.key} className="flex items-start gap-3 px-5 py-3 text-sm">
                  <I className={cn("mt-0.5 h-4 w-4 shrink-0", color[c.state])} aria-label={c.state} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{c.label}</span>
                    <span className="block text-ink-3">{c.detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Rechenengine" />
          <CardBody className="space-y-1 text-sm">
            <p className="font-medium text-ink">{data.engine.ruleSet}</p>
            <p className="text-ink-3">
              Version {data.engine.version || "–"}
              {data.engine.build ? ` · Build ${data.engine.build}` : ""}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="E-Mail-Versand" subtitle={`Modus: ${data.mail.mode}`} />
          <CardBody className="p-0">
            {data.mail.recent.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-3">Noch keine E-Mails versendet.</p>
            ) : (
              <ul className="max-h-72 divide-y divide-border overflow-y-auto text-sm">
                {data.mail.recent.map((m, i) => (
                  <li key={i} className="grid grid-cols-[1fr_auto] gap-2 px-5 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{m.subject}</span>
                      <span className="block truncate text-xs text-ink-3">{m.to}</span>
                    </span>
                    <span className="text-right text-xs">
                      <Badge tone={m.status.startsWith("OK") ? "good" : m.status.startsWith("FEHLER") ? "critical" : "neutral"}>{m.status.slice(0, 40)}</Badge>
                      <span className="block text-ink-3">{formatDateTime(m.timestamp)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Fehler" subtitle={`${data.errorsLast24h} in den letzten 24 Stunden`} />
        <CardBody className="p-0">
          {data.recentErrors.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-3">Keine Fehler protokolliert.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto font-mono text-xs">
              {data.recentErrors.map((e, i) => (
                <li key={i} className="px-5 py-2">
                  <span className="text-ink-3">{formatDateTime(e.timestamp)}</span> {e.message}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Regeln & Engine
// ---------------------------------------------------------------------------

export function RulesPage() {
  const { data, error, reload } = useApi(() => api.admin.rules(), "rules");
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton variant="table" />;
  return (
    <div className="space-y-5">
      <PageHeader title="Regeln & Engine" description="Aktive Regelversion und ihre Parameter. Die Werte stammen aus der Regelkonfiguration und werden nicht im Browser gerechnet." />
      <Card>
        <CardHeader title="Aktive Regelversion" />
        <CardBody className="space-y-2 text-sm">
          <p className="font-semibold text-ink">{data.active.label}</p>
          <p className="text-ink-3">
            {data.active.country}-{data.active.version} · Engine {data.engineVersion}
            {data.build ? ` · Build ${data.build}` : ""}
          </p>
          <p className="text-ink-3">Verfügbar: {data.available.map((r) => `${r.country}-${r.version}`).join(", ")}. Neue Regelversionen werden als eigene Konfiguration ergänzt; bestehende Runden werden dabei vollständig neu berechnet.</p>
        </CardBody>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        {data.parameters.map((g) => (
          <Card key={g.group}>
            <CardHeader title={g.group} />
            <CardBody className="p-0">
              <dl className="divide-y divide-border text-sm">
                {g.items.map((i) => (
                  <div key={i.label} className="grid grid-cols-[1fr_auto] gap-3 px-5 py-2">
                    <dt className="text-ink-2">{i.label}</dt>
                    <dd className="tabular text-right font-medium text-ink">{i.value}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rollen & Rechte
// ---------------------------------------------------------------------------

export function PermissionsPage() {
  const permissions = Object.keys(PERMISSION_LABELS) as Permission[];
  return (
    <div className="space-y-5">
      <PageHeader title="Rollen & Rechte" description="Die Rechte sind fest an die Rollen gebunden und werden bei jeder Anfrage serverseitig geprüft. Rollen vergibt ausschließlich ein Super-Admin – nie der Benutzer selbst." />
      <AdminTable
        minWidth="40rem"
        head={
          <tr>
            <Th>Berechtigung</Th>
            {ROLES.map((r) => (
              <Th key={r}>
                <RoleBadge role={r} />
              </Th>
            ))}
          </tr>
        }
      >
        {permissions.map((p) => (
          <tr key={p}>
            <Td>
              <span className="font-medium text-ink">{PERMISSION_LABELS[p]}</span>
              <span className="block font-mono text-xs text-ink-3">{p}</span>
            </Td>
            {ROLES.map((r) => (
              <Td key={r}>{ROLE_PERMISSIONS[r].includes(p) ? <CheckCircle2 className="h-4 w-4 text-good" aria-label="ja" /> : <span className="text-ink-3" aria-label="nein">–</span>}</Td>
            ))}
          </tr>
        ))}
      </AdminTable>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((r) => (
          <div key={r} className="rounded-xl border border-border bg-surface p-4 text-sm">
            <p className="font-semibold text-ink">{ROLE_LABELS[r]}</p>
            <p className="mt-1 text-ink-3">
              {r === "USER" && "Mitglied: eigene Runden, eigenes Handicap, Golfplätze."}
              {r === "SUPPORT" && "Hilfe für Mitglieder: Konten, Runden und Protokolle lesen – ohne Änderungen."}
              {r === "ADMIN" && "Verwaltung: Mitglieder betreuen, Golfplatzdaten pflegen, Importe."}
              {r === "SUPER_ADMIN" && "Vollzugriff inklusive Rollenvergabe, Löschen und Systemeinstellungen."}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

function SettingsForm({ initial, onSaved }: { initial: AdminSettings; onSaved: () => void }) {
  const toast = useToast();
  const [s, setS] = useState(initial);
  const [smtpPass, setSmtpPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const set = (patch: Partial<AdminSettings>) => setS((v) => ({ ...v, ...patch }));
  return (
    <div className="space-y-5">
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const saved = await api.admin.saveSettings({
              siteName: s.siteName,
              registrationOpen: s.registrationOpen,
              emailVerificationRequired: s.emailVerificationRequired,
              contactEmail: s.contactEmail ?? "",
              mailFrom: s.mailFrom ?? "",
              imprintText: s.imprintText ?? "",
              privacyText: s.privacyText ?? "",
              community: s.community,
              ...(s.mail.editable ? { siteUrl: s.siteUrl, mail: { mode: s.mail.mode, host: s.mail.host, port: s.mail.port, secure: s.mail.secure, user: s.mail.user, pass: smtpPass } } : {}),
            } as never);
            setS(saved);
            setSmtpPass("");
            onSaved();
            toast("Einstellungen gespeichert.");
          } catch (err) {
            setError(userMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <Alert tone="error">{error}</Alert>}
        <Card>
          <CardHeader title="Allgemein" />
          <CardBody className="space-y-4">
            <Field label="Name der Anwendung" htmlFor="st-name">
              <Input id="st-name" value={s.siteName} onChange={(e) => set({ siteName: e.target.value })} />
            </Field>
            <Field label="Kontakt-E-Mail (öffentlich)" htmlFor="st-contact">
              <Input id="st-contact" type="email" value={s.contactEmail ?? ""} onChange={(e) => set({ contactEmail: e.target.value })} />
            </Field>
            <Checkbox checked={s.registrationOpen} onChange={(v) => set({ registrationOpen: v })} label="Registrierung für alle offen" description="Aus: Konten legt nur ein Admin an." />
            <Checkbox checked={s.emailVerificationRequired} onChange={(v) => set({ emailVerificationRequired: v })} label="E-Mail-Bestätigung erforderlich" description="Neue Konten können sich erst nach Klick auf den Bestätigungslink anmelden." />
          </CardBody>
        </Card>
        <Card id="community">
          <CardHeader title="Community" subtitle="Mitglieder entscheiden selbst, was sie teilen. Diese Schalter begrenzen zusätzlich, was überhaupt angeboten wird." />
          <CardBody className="space-y-4">
            {(Object.keys(FLAG_LABELS) as (keyof CommunityFlags)[]).map((k) => (
              <Checkbox
                key={k}
                checked={s.community[k]}
                disabled={k !== "communityEnabled" && !s.community.communityEnabled}
                onChange={(v) => set({ community: { ...s.community, [k]: v } })}
                label={FLAG_LABELS[k].label}
                description={FLAG_LABELS[k].description}
              />
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="E-Mail-Versand" subtitle={s.mail.editable ? undefined : "In der Node-Edition per Umgebungsvariablen (SMTP_URL, MAIL_FROM, APP_URL) festgelegt."} />
          <CardBody className="space-y-4">
            <Field label="Absenderadresse" htmlFor="st-from" hint="Leer: noreply@ihre-domain">
              <Input id="st-from" type="email" value={s.mailFrom ?? ""} onChange={(e) => set({ mailFrom: e.target.value })} />
            </Field>
            {s.mail.editable ? (
              <>
                <Field label="Adresse der Anwendung (für Links in E-Mails)" htmlFor="st-url">
                  <Input id="st-url" type="url" value={s.siteUrl} onChange={(e) => set({ siteUrl: e.target.value })} placeholder="https://www.golfclub.de/hcp" />
                </Field>
                <Field label="Versandart" htmlFor="st-mode">
                  <Select id="st-mode" value={s.mail.mode} onChange={(e) => set({ mail: { ...s.mail, mode: e.target.value } })}>
                    <option value="mail">PHP mail() des Webspace</option>
                    <option value="smtp">SMTP-Postfach</option>
                    <option value="outbox">Testmodus (Ablage im Ordner data/mail-outbox)</option>
                    <option value="off">kein Versand</option>
                  </Select>
                </Field>
                {s.mail.mode === "smtp" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="SMTP-Server" htmlFor="st-host">
                      <Input id="st-host" value={s.mail.host} onChange={(e) => set({ mail: { ...s.mail, host: e.target.value } })} />
                    </Field>
                    <Field label="Port" htmlFor="st-port">
                      <Input id="st-port" inputMode="numeric" value={String(s.mail.port)} onChange={(e) => set({ mail: { ...s.mail, port: Number(e.target.value) || 587 } })} />
                    </Field>
                    <Field label="Verschlüsselung" htmlFor="st-sec">
                      <Select id="st-sec" value={s.mail.secure} onChange={(e) => set({ mail: { ...s.mail, secure: e.target.value } })}>
                        <option value="tls">STARTTLS</option>
                        <option value="ssl">SSL/TLS</option>
                        <option value="none">keine</option>
                      </Select>
                    </Field>
                    <Field label="Benutzer" htmlFor="st-user">
                      <Input id="st-user" value={s.mail.user} onChange={(e) => set({ mail: { ...s.mail, user: e.target.value } })} autoComplete="off" />
                    </Field>
                    <Field label="Passwort" htmlFor="st-pass" hint={s.mail.hasPassword ? "Gespeichert – leer lassen, um es zu behalten." : undefined} className="sm:col-span-2">
                      <PasswordInput id="st-pass" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} autoComplete="new-password" />
                    </Field>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-2">
                Aktuell: <strong>{s.mail.mode}</strong>
                {s.mail.host ? ` über ${s.mail.host}:${s.mail.port}` : ""} · Links in E-Mails: {s.siteUrl}
              </p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Rechtliches" subtitle="Wird auf den öffentlichen Seiten als Text angezeigt (Absätze durch Leerzeilen)." />
          <CardBody className="space-y-4">
            <Field label="Impressum" htmlFor="st-imprint">
              <Textarea id="st-imprint" rows={8} value={s.imprintText ?? ""} onChange={(e) => set({ imprintText: e.target.value })} />
            </Field>
            <Field label="Datenschutzerklärung" htmlFor="st-privacy">
              <Textarea id="st-privacy" rows={12} value={s.privacyText ?? ""} onChange={(e) => set({ privacyText: e.target.value })} />
            </Field>
          </CardBody>
        </Card>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Einstellungen speichern
        </Button>
      </form>
      <Card>
        <CardHeader title="Test-E-Mail" subtitle="Prüft den gespeicherten Versand." />
        <CardBody>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setTesting(true);
              try {
                const res = await api.admin.mailTest(testTo);
                toast(res.ok ? `Test-E-Mail versendet (${res.mode}).` : `Versand fehlgeschlagen (${res.mode}). Details im Systemstatus.`, res.ok ? "success" : "error");
              } catch (err) {
                toast(userMessage(err), "error");
              } finally {
                setTesting(false);
              }
            }}
          >
            <Field label="Empfänger" htmlFor="st-test" className="w-72">
              <Input id="st-test" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            </Field>
            <Button type="submit" variant="secondary" disabled={testing || !testTo}>
              {testing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Senden
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

export function SettingsPage() {
  const { refresh } = useSession();
  const { data, error, reload } = useApi(() => api.admin.settings(), "settings");
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <PageSkeleton variant="detail" />;
  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="Einstellungen" />
      <SettingsForm initial={data} onSaved={() => void refresh()} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Globale Suche
// ---------------------------------------------------------------------------

export function SearchPage() {
  const q = useSearchParams().get("q") ?? "";
  const { data, error, loading, reload } = useApi(() => api.admin.search(q), q);
  return (
    <div className="space-y-5">
      <PageHeader title={`Suche: „${q}“`} />
      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data || loading ? (
        <PageSkeleton variant="list" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card>
            <CardHeader title={`Benutzer (${data.users.length})`} />
            <CardBody className="p-0">
              {data.users.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-3">Keine Treffer.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {data.users.map((u) => (
                    <li key={u.id}>
                      <Link href={userHref(u.id)} className="block px-5 py-2.5 hover:bg-surface-2">
                        <span className="font-medium text-ink">
                          {u.firstName} {u.lastName}
                        </span>
                        <span className="block text-xs text-ink-3">
                          {u.email ?? "–"} · <RoleBadge role={u.role} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={`Golfplätze (${data.courses.length})`} />
            <CardBody className="p-0">
              {data.courses.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-3">Keine Treffer.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {data.courses.map((c) => (
                    <li key={c.id}>
                      <Link href={adminCoursePath(c.id)} className="block px-5 py-2.5 hover:bg-surface-2">
                        <span className="font-medium text-ink">{c.name}</span>
                        <span className="block text-xs text-ink-3">{[c.postalCode, c.city].filter(Boolean).join(" ")}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={`Runden (${data.rounds.length})`} />
            <CardBody className="p-0">
              {data.rounds.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-3">Keine Treffer.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {data.rounds.map((r) => (
                    <li key={`${r.userId}-${r.roundId}`}>
                      <Link href={adminRoundHref(r.userId, r.roundId)} className="block px-5 py-2.5 hover:bg-surface-2">
                        <span className="font-medium text-ink">{r.courseName}</span>
                        <span className="block text-xs text-ink-3">
                          {r.userName} · {r.date.split("-").reverse().join(".")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
