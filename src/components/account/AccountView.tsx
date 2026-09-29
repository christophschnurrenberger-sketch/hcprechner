"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CloudUpload, KeyRound, LogOut } from "lucide-react";
import { ROLE_LABELS, validatePassword } from "@/lib/account/types";
import { useAccount } from "@/components/providers/AccountProvider";
import { useHcp } from "@/components/providers/HcpStoreProvider";
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardHeader, Field, Input, PageHeader } from "@/components/ui";
import { LoadingState } from "@/components/dashboard/DashboardView";
import { SyncStatusBadge } from "./SyncStatusBadge";

function PasswordForm({ required }: { required: boolean }) {
  const { changePassword } = useAccount();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <Card>
      <CardHeader title={required ? "Bitte ein eigenes Passwort festlegen" : "Passwort ändern"} />
      <CardBody>
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const next = String(fd.get("next") ?? "");
            const invalid = validatePassword(next);
            if (invalid) return setMessage({ ok: false, text: invalid });
            if (next !== String(fd.get("repeat") ?? "")) return setMessage({ ok: false, text: "Die neuen Passwörter stimmen nicht überein." });
            setPending(true);
            try {
              await changePassword(String(fd.get("current") ?? ""), next);
              form.reset();
              setMessage({ ok: true, text: "Passwort geändert." });
            } catch (error) {
              setMessage({ ok: false, text: (error as Error).message });
            } finally {
              setPending(false);
            }
          }}
        >
          <Field label={required ? "Startpasswort" : "Aktuelles Passwort"} htmlFor="acc-cur">
            <Input id="acc-cur" name="current" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="Neues Passwort" htmlFor="acc-new" hint="mindestens 8 Zeichen">
            <Input id="acc-new" name="next" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Wiederholen" htmlFor="acc-rep">
            <Input id="acc-rep" name="repeat" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
            <Button type="submit" size="sm" disabled={pending}>
              <KeyRound className="h-4 w-4" /> Passwort speichern
            </Button>
            {message && <span className={message.ok ? "text-sm text-good" : "text-sm text-critical"}>{message.text}</span>}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

/** Konto-Seite: Status der Speicherung, Passwort, Übernahme lokaler Daten, Abmelden. */
export function AccountView() {
  const { state, logout } = useAccount();
  const { ready, rounds, sync, anonymousRounds, importAnonymousData, flushSync } = useHcp();
  const router = useRouter();
  const [imported, setImported] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!leaving && (state.status === "anonymous" || state.status === "unavailable")) router.replace("/anmelden");
  }, [state.status, router, leaving]);

  if (state.status !== "authenticated") return <LoadingState />;
  const user = state.user;
  return (
    <>
      <PageHeader title="Mein Konto" description="Ihre Runden und Ihr Profil werden in Ihrem Konto auf dem Server gespeichert und stehen auf jedem Gerät zur Verfügung." />
      <div className="space-y-5">
        {user.mustChangePassword && (
          <Alert tone="warning" title="Startpasswort ändern">
            Sie sind mit dem Startpasswort angemeldet, das der Betreiber vergeben hat. Bitte legen Sie jetzt ein eigenes Passwort fest.
          </Alert>
        )}
        <Card>
          <CardHeader title={user.displayName} subtitle={`Benutzername: ${user.username}`} action={<Badge tone={user.role === "editor" ? "info" : "neutral"}>{ROLE_LABELS[user.role]}</Badge>} />
          <CardBody className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <SyncStatusBadge />
              <span className="text-ink-3">{ready ? `${rounds.length} Runden im Konto` : "Lade Daten …"}</span>
            </div>
            {sync.mode === "account" && sync.state === "error" && sync.message && <Alert tone="warning">{sync.message}</Alert>}
            <div className="flex flex-wrap gap-2">
              {user.role === "editor" && (
                <ButtonLink href="/admin" size="sm" variant="secondary">
                  Golfplatzpflege (Admin-Bereich)
                </ButtonLink>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  setLeaving(true);
                  await flushSync();
                  await logout();
                  router.push("/");
                }}
              >
                <LogOut className="h-4 w-4" /> Abmelden
              </Button>
            </div>
            {user.role === "editor" && (
              <p className="text-xs text-ink-3">Im Admin-Bereich melden Sie sich mit demselben Benutzernamen und Passwort an.</p>
            )}
          </CardBody>
        </Card>

        {ready && anonymousRounds > 0 && !imported && (
          <Card>
            <CardHeader title="Runden aus diesem Browser übernehmen" subtitle={`In diesem Browser sind ohne Anmeldung ${anonymousRounds} Runden gespeichert.`} />
            <CardBody className="space-y-2 text-sm">
              <p className="text-ink-2">
                Die Runden werden Ihrem Konto hinzugefügt (vorhandene Runden bleiben erhalten). Ist Ihr Konto noch leer, wird auch das Spielerprofil
                (Start-HCPI, Geschlecht) übernommen.
              </p>
              <Button
                size="sm"
                onClick={() => {
                  importAnonymousData();
                  setImported(true);
                }}
              >
                <CloudUpload className="h-4 w-4" /> {anonymousRounds} Runden übernehmen
              </Button>
            </CardBody>
          </Card>
        )}
        {imported && <Alert tone="success">Runden übernommen und im Konto gespeichert.</Alert>}

        <PasswordForm required={user.mustChangePassword} />
      </div>
    </>
  );
}
