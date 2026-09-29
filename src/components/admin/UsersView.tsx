"use client";

import { useActionState, useEffect, useState } from "react";
import { Copy, KeyRound, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { ROLE_LABELS, USER_ROLES, generatePassword, type AdminUserView } from "@/lib/account/types";
import { initialActionState, type ActionState } from "@/lib/courses/adminForm";
import { formatDate } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { useAdminBackend } from "./AdminBackend";
import { useKeepValuesSubmit } from "./useKeepValuesSubmit";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "–");

/** Zugangsdaten einmalig anzeigen (zum Weitergeben an den Spieler). */
function Credentials({ state }: { state: ActionState }) {
  const [copied, setCopied] = useState(false);
  if (!state.message) return null;
  if (!state.ok) return <Alert tone="error">{state.message}</Alert>;
  if (!state.credentials) return <Alert tone="success">{state.message}</Alert>;
  const text = `Benutzername: ${state.credentials.username}\nPasswort: ${state.credentials.password}`;
  return (
    <Alert tone="success" title={state.message}>
      <p className="mt-1">Diese Zugangsdaten jetzt weitergeben – das Passwort wird nicht erneut angezeigt und muss bei der ersten Anmeldung geändert werden.</p>
      <pre className="tabular mt-2 rounded-md bg-surface px-3 py-2 text-sm text-ink">{text}</pre>
      <Button
        size="sm"
        variant="secondary"
        className="mt-2"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        <Copy className="h-4 w-4" /> {copied ? "Kopiert" : "Kopieren"}
      </Button>
    </Alert>
  );
}

function CreateUserForm() {
  const { createUser } = useAdminBackend();
  const [password, setPassword] = useState("");
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    // Zufallspasswort erst im Browser erzeugen (kein Unterschied zwischen Server- und Browser-HTML)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPassword(generatePassword());
  }, []);
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const res = await createUser(prev, fd);
    if (res.ok) {
      setPassword(generatePassword());
      setFormKey((k) => k + 1);
    }
    return res;
  }, initialActionState);
  const submit = useKeepValuesSubmit(action);
  return (
    <Card>
      <CardHeader title="Benutzer anlegen" subtitle="Der Spieler meldet sich unter „Anmelden“ an; seine Runden werden dann auf diesem Server gespeichert." />
      <CardBody className="space-y-3">
        <form key={formKey} onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name *" htmlFor="u-name">
            <Input id="u-name" name="displayName" required maxLength={80} placeholder="Max Muster" />
          </Field>
          <Field label="Benutzername *" htmlFor="u-user" hint="Kleinbuchstaben, Ziffern, . _ -">
            <Input id="u-user" name="username" required pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,39}" autoCapitalize="none" spellCheck={false} placeholder="max.muster" />
          </Field>
          <Field label="Startpasswort *" htmlFor="u-pw" hint="Muss bei der ersten Anmeldung geändert werden">
            <div className="flex gap-1">
              <Input id="u-pw" name="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="tabular" />
              <Button type="button" variant="ghost" size="sm" title="Neues Passwort erzeugen" onClick={() => setPassword(generatePassword())}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </Field>
          <Field label="Rolle" htmlFor="u-role">
            <Select id="u-role" name="role" defaultValue="player">
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" disabled={pending}>
              <UserPlus className="h-4 w-4" /> Benutzer anlegen
            </Button>
          </div>
        </form>
        <Credentials state={state} />
      </CardBody>
    </Card>
  );
}

function UserRow({ user }: { user: AdminUserView }) {
  const { updateUser, resetUserPassword, deleteUser } = useAdminBackend();
  const [updState, updAction, updPending] = useActionState(updateUser, initialActionState);
  const [pwState, pwAction, pwPending] = useActionState((prev: ActionState, fd: FormData) => {
    fd.set("password", generatePassword());
    return resetUserPassword(prev, fd);
  }, initialActionState);
  const [delState, delAction, delPending] = useActionState(deleteUser, initialActionState);
  const busy = updPending || pwPending || delPending;
  const errorState = [updState, delState].find((s) => s.message && !s.ok);
  return (
    <li className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink">
            {user.displayName} <span className="font-normal text-ink-3">· {user.username}</span>
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge tone={user.role === "editor" ? "info" : "neutral"}>{ROLE_LABELS[user.role]}</Badge>
            {user.active ? <Badge tone="good">aktiv</Badge> : <Badge tone="critical">gesperrt</Badge>}
            {user.mustChangePassword && <Badge tone="warning">Passwortwechsel ausstehend</Badge>}
          </div>
          <p className="tabular mt-1.5 text-xs text-ink-3">
            {user.rounds} Runden · Daten geändert {when(user.dataUpdatedAt)} · letzte Anmeldung {when(user.lastLoginAt)} · angelegt {formatDate(user.createdAt.slice(0, 10))}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <form action={updAction}>
            <input type="hidden" name="id" value={user.id} />
            <input type="hidden" name="role" value={user.role === "editor" ? "player" : "editor"} />
            <Button size="sm" variant="ghost" type="submit" disabled={busy}>
              {user.role === "editor" ? "Golfplatzpflege entziehen" : "Golfplatzpflege erlauben"}
            </Button>
          </form>
          <form action={updAction}>
            <input type="hidden" name="id" value={user.id} />
            <input type="hidden" name="active" value={user.active ? "false" : "true"} />
            <Button size="sm" variant="ghost" type="submit" disabled={busy}>
              {user.active ? "Sperren" : "Entsperren"}
            </Button>
          </form>
          <form action={pwAction}>
            <input type="hidden" name="id" value={user.id} />
            <input type="hidden" name="username" value={user.username} />
            <Button size="sm" variant="ghost" type="submit" disabled={busy} title="Neues Startpasswort erzeugen (meldet den Benutzer auf allen Geräten ab)">
              <KeyRound className="h-4 w-4" /> Passwort zurücksetzen
            </Button>
          </form>
          <form
            action={delAction}
            onSubmit={(e) => {
              if (!window.confirm(`Benutzer „${user.username}“ und alle gespeicherten Runden (${user.rounds}) endgültig löschen?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={user.id} />
            <Button size="sm" variant="ghost" type="submit" disabled={busy} className="text-critical">
              <Trash2 className="h-4 w-4" /> Löschen
            </Button>
          </form>
        </div>
      </div>
      {pwState.message && <Credentials state={pwState} />}
      {errorState && <Alert tone="error">{errorState.message}</Alert>}
    </li>
  );
}

/** Benutzerverwaltung (beide Editionen; Schreibzugriff über den AdminBackend-Kontext). */
export function UsersView({ users }: { users: AdminUserView[] | null }) {
  return (
    <>
      <PageHeader
        title="Benutzer"
        description="Zugänge für Spieler anlegen. Angemeldete Spieler speichern Profil und Runden auf diesem Server und sehen sie auf jedem Gerät. Mit „Golfplatzpflege“ darf ein Benutzer zusätzlich die Golfplatzdaten im Admin-Bereich bearbeiten (Anmeldung dort mit Benutzername und Passwort)."
      />
      <div className="space-y-5">
        <CreateUserForm />
        {users === null ? (
          <p className="text-sm text-ink-3">Lade Benutzer …</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-ink-3">Noch keine Benutzer angelegt.</p>
        ) : (
          <ul className="space-y-3">
            {users.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
