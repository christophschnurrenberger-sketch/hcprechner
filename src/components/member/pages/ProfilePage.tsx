"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Download, Loader2, LogOut, Upload } from "lucide-react";
import { api } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import { changePasswordSchema, handicapInputSchema, profileSchema } from "@/lib/auth/validation";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { downloadText } from "@/lib/export/download";
import { formatHcp } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, PageHeader, Segmented } from "@/components/ui";
import { ConfirmDialog, PageSkeleton, PasswordInput, useToast } from "@/components/ui/feedback";
import { useFormErrors } from "@/components/auth/useFormErrors";
import { useSession } from "@/components/session/SessionProvider";
import type { Gender } from "@/lib/whs/types";
import { CommunitySettingsCard } from "@/components/community/CommunitySettingsCard";

type Tab = "konto" | "community" | "sicherheit" | "datenschutz";

function AccountSection() {
  const { user, setUser } = useSession();
  const toast = useToast();
  const errors = useFormErrors();
  const [values, setValues] = useState({ firstName: user?.firstName ?? "", lastName: user?.lastName ?? "", email: user?.email ?? "", currentPassword: "" });
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const emailChanged = values.email.trim().toLowerCase() !== (user?.email ?? "");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input = errors.validate(profileSchema, values);
    if (!input) return;
    setBusy(true);
    try {
      const res = await api.auth.updateProfile({ ...input, currentPassword: emailChanged ? values.currentPassword : undefined });
      setUser(res.user);
      setPending(res.pendingEmail);
      setValues((v) => ({ ...v, currentPassword: "", email: res.user.email ?? v.email }));
      toast("Gespeichert.");
    } catch (error) {
      errors.fromError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Persönliche Daten" subtitle={user ? `Rolle: ${ROLE_LABELS[user.role]}` : undefined} />
      <CardBody>
        <form onSubmit={submit} noValidate className="space-y-4">
          {errors.form && <Alert tone="error">{errors.form}</Alert>}
          {pending && <Alert tone="info">Wir haben einen Bestätigungslink an {pending} geschickt. Die neue Adresse gilt, sobald du sie bestätigt hast.</Alert>}
          {!user?.email && <Alert tone="warning">Bitte hinterlege eine E-Mail-Adresse – damit kannst du dich künftig anmelden und dein Passwort zurücksetzen.</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vorname" htmlFor="p-first" error={errors.fields.firstName}>
              <Input id="p-first" autoComplete="given-name" value={values.firstName} onChange={(e) => setValues({ ...values, firstName: e.target.value })} />
            </Field>
            <Field label="Nachname" htmlFor="p-last" error={errors.fields.lastName}>
              <Input id="p-last" autoComplete="family-name" value={values.lastName} onChange={(e) => setValues({ ...values, lastName: e.target.value })} />
            </Field>
          </div>
          <Field label="E-Mail-Adresse" htmlFor="p-email" error={errors.fields.email}>
            <Input id="p-email" type="email" autoComplete="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} />
          </Field>
          {emailChanged && (
            <Field label="Aktuelles Passwort (zur Bestätigung)" htmlFor="p-pw" error={errors.fields.currentPassword}>
              <PasswordInput id="p-pw" autoComplete="current-password" value={values.currentPassword} onChange={(e) => setValues({ ...values, currentPassword: e.target.value })} />
            </Field>
          )}
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Speichern
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function GolfSection() {
  const toast = useToast();
  const profile = useApi(() => api.member.profile(), "profile");
  const [value, setValue] = useState<string | null>(null);
  const [gender, setGender] = useState<Gender | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!profile.data) return <PageSkeleton variant="list" />;
  const p = profile.data.profile;
  const shown = value ?? String(p.startHandicapIndex).replace(".", ",");
  const g = gender ?? p.gender;

  return (
    <Card>
      <CardHeader title="Golf" subtitle="Start-Handicap und Abschlagsgruppe" />
      <CardBody>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const parsed = handicapInputSchema.safeParse(shown);
            if (!parsed.success || parsed.data === null) {
              setError("Handicap zwischen +10 und 54,0.");
              return;
            }
            setError(null);
            setBusy(true);
            try {
              profile.setData(await api.member.saveProfile({ gender: g, startHandicapIndex: parsed.data }));
              setValue(null);
              setGender(null);
              toast("Gespeichert. Dein Handicap wurde neu berechnet.");
            } catch (err) {
              setError(userMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Start-Handicap" htmlFor="g-start" hint={`Gilt vor deiner ersten erfassten Runde. Aktuell: ${formatHcp(p.startHandicapIndex)}.`} error={error ?? undefined}>
            <Input id="g-start" inputMode="decimal" value={shown} onChange={(e) => setValue(e.target.value)} className="max-w-[10rem]" />
          </Field>
          <Field label="Ich spiele meist als">
            <Segmented name="Geschlecht" value={g} onChange={setGender} options={[{ value: "M", label: "Herren" }, { value: "F", label: "Damen" }]} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Speichern
            </Button>
            <Link href="/member/import" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
              <Upload className="h-4 w-4" aria-hidden /> Bisherige Runden importieren
            </Link>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

/** Profil → Rundeneingabe: Standard der mobilen Scorecard (sofort gespeichert). */
function RoundEntrySection() {
  const toast = useToast();
  const profile = useApi(() => api.member.profile(), "profile-entry");
  const [busy, setBusy] = useState(false);
  if (!profile.data) return null;
  const value = profile.data.preferences.roundEntryMode ?? "ASK";
  return (
    <Card>
      <CardHeader title="Rundeneingabe" subtitle="Wie die Scorekarte auf dem Smartphone startet. Du kannst es bei jeder Runde ändern." />
      <CardBody>
        <Segmented
          name="Rundeneingabe"
          value={value}
          onChange={async (roundEntryMode) => {
            if (busy) return;
            setBusy(true);
            try {
              const preferences = await api.member.setRoundEntryMode(roundEntryMode);
              profile.setData({ ...profile.data!, preferences });
              toast("Gespeichert.");
            } catch (err) {
              toast(userMessage(err), "error");
            } finally {
              setBusy(false);
            }
          }}
          options={[
            { value: "ASK" as const, label: "Beim Start fragen" },
            { value: "QUICK" as const, label: "Schnell" },
            { value: "DETAILED" as const, label: "Detailliert" },
          ]}
        />
        <p className="mt-2 text-sm text-ink-3">Schnell: nur Schläge je Loch. Detailliert: zusätzlich Putts, Fairways, Grüns und weitere Statistik.</p>
      </CardBody>
    </Card>
  );
}

/** Profil → GPS-Entfernungen: Meter (Standard) oder Yards (sofort gespeichert). */
function DistanceUnitSection() {
  const toast = useToast();
  const profile = useApi(() => api.member.profile(), "profile-distance");
  const [busy, setBusy] = useState(false);
  if (!profile.data) return null;
  const value = profile.data.preferences.distanceUnit ?? "M";
  return (
    <Card>
      <CardHeader title="Distanz" subtitle="Einheit der GPS-Entfernung zum Grün während der Runde." />
      <CardBody>
        <Segmented
          name="Distanz"
          value={value}
          onChange={async (distanceUnit) => {
            if (busy) return;
            setBusy(true);
            try {
              const preferences = await api.member.setDistanceUnit(distanceUnit);
              profile.setData({ ...profile.data!, preferences });
              toast("Gespeichert.");
            } catch (err) {
              toast(userMessage(err), "error");
            } finally {
              setBusy(false);
            }
          }}
          options={[
            { value: "M" as const, label: "Meter" },
            { value: "YD" as const, label: "Yards" },
          ]}
        />
        <p className="mt-2 text-sm text-ink-3">Der Standort wird nur während einer laufenden Runde verwendet und nicht gespeichert.</p>
      </CardBody>
    </Card>
  );
}

function SecuritySection() {
  const { setUser, user } = useSession();
  const toast = useToast();
  const errors = useFormErrors();
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", newPasswordRepeat: "" });
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader title="Passwort ändern" subtitle="Nach der Änderung wirst du auf allen anderen Geräten abgemeldet." />
      <CardBody>
        <form
          noValidate
          className="max-w-md space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const input = errors.validate(changePasswordSchema, values);
            if (!input) return;
            setBusy(true);
            try {
              const res = await api.auth.changePassword(input);
              setUser(res.user);
              setValues({ currentPassword: "", newPassword: "", newPasswordRepeat: "" });
              toast("Passwort geändert.");
            } catch (error) {
              errors.fromError(error);
            } finally {
              setBusy(false);
            }
          }}
        >
          {user?.mustChangePassword && <Alert tone="warning">Du nutzt ein vorläufiges Passwort. Bitte lege ein eigenes fest.</Alert>}
          {errors.form && <Alert tone="error">{errors.form}</Alert>}
          <Field label="Aktuelles Passwort" htmlFor="s-cur" error={errors.fields.currentPassword}>
            <PasswordInput id="s-cur" autoComplete="current-password" value={values.currentPassword} onChange={(e) => setValues({ ...values, currentPassword: e.target.value })} />
          </Field>
          <Field label="Neues Passwort" htmlFor="s-new" hint="Mindestens 8 Zeichen." error={errors.fields.newPassword}>
            <PasswordInput id="s-new" autoComplete="new-password" value={values.newPassword} onChange={(e) => setValues({ ...values, newPassword: e.target.value })} />
          </Field>
          <Field label="Neues Passwort wiederholen" htmlFor="s-rep" error={errors.fields.newPasswordRepeat}>
            <PasswordInput id="s-rep" autoComplete="new-password" value={values.newPasswordRepeat} onChange={(e) => setValues({ ...values, newPasswordRepeat: e.target.value })} />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Passwort ändern
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function PrivacySection() {
  const router = useRouter();
  const toast = useToast();
  const { setUser } = useSession();
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Card>
        <CardHeader title="Datenauskunft" subtitle="Alle über dich gespeicherten Daten als Datei (JSON)." />
        <CardBody>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                const data = await api.auth.exportData();
                downloadText(`golf-hcp-daten-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json");
              } catch (e) {
                toast(userMessage(e), "error");
              }
            }}
          >
            <Download className="h-4 w-4" aria-hidden /> Meine Daten herunterladen
          </Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Konto löschen" subtitle="Löscht dein Konto mit allen Runden endgültig." />
        <CardBody className="space-y-3">
          <p className="text-sm text-ink-2">Das kann nicht rückgängig gemacht werden. Lade vorher bei Bedarf deine Daten herunter.</p>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Konto löschen …
          </Button>
        </CardBody>
      </Card>
      <ConfirmDialog
        open={confirm}
        title="Konto endgültig löschen?"
        confirmLabel="Endgültig löschen"
        requireText="LÖSCHEN"
        busy={busy}
        onClose={() => setConfirm(false)}
        onConfirm={async (typed) => {
          setBusy(true);
          setError(null);
          try {
            await api.auth.deleteAccount(password, typed);
            setUser(null);
            router.replace("/login?deleted=1");
          } catch (e) {
            setError(userMessage(e));
            setBusy(false);
          }
        }}
      >
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Passwort" htmlFor="del-pw">
          <PasswordInput id="del-pw" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </ConfirmDialog>
    </>
  );
}

export function ProfilePage() {
  const params = useSearchParams();
  const router = useRouter();
  const { logout, settings } = useSession();
  const communityOn = settings.community.communityEnabled;
  const tabs: Tab[] = communityOn ? ["konto", "community", "sicherheit", "datenschutz"] : ["konto", "sicherheit", "datenschutz"];
  const initial = (params.get("tab") as Tab) || "konto";
  const [tab, setTab] = useState<Tab>(tabs.includes(initial) ? initial : "konto");
  return (
    <div className="space-y-5">
      <PageHeader title="Profil" />
      <Segmented
        name="Bereich"
        value={tab}
        onChange={setTab}
        options={[
          { value: "konto" as Tab, label: "Konto" },
          ...(communityOn ? [{ value: "community" as Tab, label: "Community" }] : []),
          { value: "sicherheit" as Tab, label: "Sicherheit" },
          { value: "datenschutz" as Tab, label: "Datenschutz" },
        ]}
      />
      {tab === "community" && communityOn && <CommunitySettingsCard />}
      {tab === "konto" && (
        <div className="space-y-5">
          <AccountSection />
          <GolfSection />
          <RoundEntrySection />
          <DistanceUnitSection />
        </div>
      )}
      {tab === "sicherheit" && <SecuritySection />}
      {tab === "datenschutz" && (
        <div className="space-y-5">
          <PrivacySection />
        </div>
      )}
      <Button
        variant="secondary"
        size="lg"
        className="w-full sm:w-auto"
        onClick={async () => {
          await logout();
          router.replace("/login?loggedOut=1");
        }}
      >
        <LogOut className="h-4 w-4" aria-hidden /> Abmelden
      </Button>
    </div>
  );
}
