"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { api } from "@/lib/api/client";
import { registerSchema } from "@/lib/auth/validation";
import { Alert, Button, Checkbox, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/ui/feedback";
import { AuthCard } from "@/components/layout/PublicShell";
import { useSession } from "@/components/session/SessionProvider";
import { useFormErrors } from "./useFormErrors";

export function RegisterForm() {
  const router = useRouter();
  const { settings, setUser, status } = useSession();
  const errors = useFormErrors();
  const [values, setValues] = useState({ firstName: "", lastName: "", email: "", password: "", passwordRepeat: "", handicapIndex: "" });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<{ email: string; mailSent: boolean } | null>(null);
  const [resent, setResent] = useState(false);
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));

  if (status !== "loading" && !settings.registrationOpen) {
    return (
      <AuthCard title="Registrierung geschlossen">
        <Alert tone="info">Neue Konten werden derzeit nur vom Administrator angelegt.</Alert>
        <p className="mt-4 text-sm">
          <Link href="/login" className="font-medium text-brand hover:underline">
            Zur Anmeldung
          </Link>
        </p>
      </AuthCard>
    );
  }

  if (sentTo) {
    return (
      <AuthCard title="Fast geschafft!">
        <div className="space-y-4 text-sm text-ink-2">
          <MailCheck className="h-10 w-10 text-brand" aria-hidden />
          <p>
            Wir haben dir eine E-Mail an <strong className="text-ink">{sentTo.email}</strong> geschickt. Bitte klicke auf den Link darin, um dein Konto zu bestätigen.
          </p>
          {!sentTo.mailSent && <Alert tone="warning">Die E-Mail konnte gerade nicht versendet werden. Bitte versuche es später erneut oder wende dich an den Administrator.</Alert>}
          <p className="text-ink-3">Keine E-Mail erhalten? Schau im Spam-Ordner nach.</p>
          {resent ? (
            <Alert tone="success">Neuer Link ist unterwegs.</Alert>
          ) : (
            <Button
              variant="secondary"
              onClick={async () => {
                await api.auth.resendVerification(sentTo.email).catch(() => undefined);
                setResent(true);
              }}
            >
              E-Mail erneut senden
            </Button>
          )}
          <p>
            <Link href="/login" className="font-medium text-brand hover:underline">
              Zur Anmeldung
            </Link>
          </p>
        </div>
      </AuthCard>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input = errors.validate(registerSchema, { ...values, acceptTerms }, { passwordRepeat: values.passwordRepeat !== values.password && "Die Passwörter stimmen nicht überein." });
    if (!input) return;
    setBusy(true);
    try {
      const res = await api.auth.register({ ...values, acceptTerms });
      if (res.verificationRequired) {
        setSentTo({ email: res.email, mailSent: res.mailSent });
      } else {
        setUser(res.user);
        router.replace("/member/welcome");
      }
    } catch (error) {
      errors.fromError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Konto erstellen"
      subtitle="In einer Minute startklar – dein Handicap, deine Runden, nur für dich sichtbar."
      footer={
        <>
          Schon registriert?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Anmelden
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vorname" htmlFor="firstName" error={errors.fields.firstName}>
            <Input id="firstName" autoComplete="given-name" value={values.firstName} onChange={set("firstName")} aria-invalid={Boolean(errors.fields.firstName)} required />
          </Field>
          <Field label="Nachname" htmlFor="lastName" error={errors.fields.lastName}>
            <Input id="lastName" autoComplete="family-name" value={values.lastName} onChange={set("lastName")} aria-invalid={Boolean(errors.fields.lastName)} required />
          </Field>
        </div>
        <Field label="E-Mail-Adresse" htmlFor="email" error={errors.fields.email}>
          <Input id="email" type="email" inputMode="email" autoComplete="email" value={values.email} onChange={set("email")} aria-invalid={Boolean(errors.fields.email)} required />
        </Field>
        <Field label="Passwort" htmlFor="password" hint="Mindestens 8 Zeichen." error={errors.fields.password}>
          <PasswordInput id="password" autoComplete="new-password" value={values.password} onChange={set("password")} aria-invalid={Boolean(errors.fields.password)} required />
        </Field>
        <Field label="Passwort wiederholen" htmlFor="passwordRepeat" error={errors.fields.passwordRepeat}>
          <PasswordInput id="passwordRepeat" autoComplete="new-password" value={values.passwordRepeat} onChange={set("passwordRepeat")} aria-invalid={Boolean(errors.fields.passwordRepeat)} required />
        </Field>
        <Field
          label="Aktueller Handicap Index (optional)"
          htmlFor="handicapIndex"
          hint="Aus der DGV-App oder vom Club, z. B. 18,4. Ohne Angabe starten wir mit 54,0."
          error={errors.fields.handicapIndex}
        >
          <Input id="handicapIndex" inputMode="decimal" placeholder="z. B. 18,4" value={values.handicapIndex} onChange={set("handicapIndex")} aria-invalid={Boolean(errors.fields.handicapIndex)} />
        </Field>
        <div>
          <Checkbox
            checked={acceptTerms}
            onChange={setAcceptTerms}
            label={
              <>
                Ich habe die{" "}
                <Link href="/datenschutz" className="text-brand underline" target="_blank">
                  Datenschutzhinweise
                </Link>{" "}
                gelesen und stimme der Verarbeitung meiner Angaben zu.
              </>
            }
          />
          {errors.fields.acceptTerms && <p className="mt-1 text-xs font-medium text-critical">{errors.fields.acceptTerms}</p>}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Konto erstellen
        </Button>
      </form>
    </AuthCard>
  );
}
