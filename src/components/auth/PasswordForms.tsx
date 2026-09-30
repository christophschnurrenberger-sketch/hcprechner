"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { z } from "zod";
import { api } from "@/lib/api/client";
import { ApiError, userMessage } from "@/lib/api/errors";
import { emailSchema, passwordSchema } from "@/lib/auth/validation";
import { Alert, Button, Field, Input } from "@/components/ui";
import { PasswordInput, Spinner } from "@/components/ui/feedback";
import { AuthCard } from "@/components/layout/PublicShell";
import { useSession } from "@/components/session/SessionProvider";
import { useFormErrors } from "./useFormErrors";

export function ForgotPasswordForm() {
  const errors = useFormErrors();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input = errors.validate(z.object({ email: emailSchema }), { email });
    if (!input) return;
    setBusy(true);
    try {
      await api.auth.forgotPassword(input.email);
      setDone(true);
    } catch (error) {
      errors.fromError(error);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthCard title="E-Mail ist unterwegs">
        <div className="space-y-4 text-sm text-ink-2">
          <MailCheck className="h-10 w-10 text-brand" aria-hidden />
          <p>Wenn für diese Adresse ein Konto existiert, bekommst du gleich eine E-Mail mit einem Link zum Zurücksetzen. Der Link ist eine Stunde gültig.</p>
          <p>
            <Link href="/login" className="font-medium text-brand hover:underline">
              Zurück zur Anmeldung
            </Link>
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Passwort vergessen?" subtitle="Kein Problem. Gib deine E-Mail-Adresse ein – wir schicken dir einen Link zum Zurücksetzen." footer={<Link href="/login" className="font-medium text-brand hover:underline">Zurück zur Anmeldung</Link>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        <Field label="E-Mail-Adresse" htmlFor="email" error={errors.fields.email}>
          <Input id="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Link anfordern
        </Button>
        <p className="text-sm text-ink-3">Du meldest dich mit einem Benutzernamen an und hast keine E-Mail-Adresse hinterlegt? Dann setzt dir der Administrator ein neues Passwort.</p>
      </form>
    </AuthCard>
  );
}

const resetSchema = z
  .object({ password: passwordSchema, passwordRepeat: z.string() })
  .refine((v) => v.password === v.passwordRepeat, { path: ["passwordRepeat"], message: "Die Passwörter stimmen nicht überein." });

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const invite = params.get("invite") === "1";
  const errors = useFormErrors();
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(!token);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input = errors.validate(resetSchema, { password, passwordRepeat });
    if (!input) return;
    setBusy(true);
    try {
      await api.auth.resetPassword(token, input.password, input.passwordRepeat);
      router.replace("/login?reset=1");
    } catch (error) {
      setBusy(false);
      if (error instanceof ApiError && error.code === "TOKEN_INVALID") setInvalid(true);
      else errors.fromError(error);
    }
  }

  if (invalid) {
    return (
      <AuthCard title="Link ungültig">
        <Alert tone="warning">Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.</Alert>
        <p className="mt-4 text-sm">
          <Link href="/forgot-password" className="font-medium text-brand hover:underline">
            Neuen Link anfordern
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={invite ? "Passwort festlegen" : "Neues Passwort"} subtitle={invite ? "Willkommen! Lege dein persönliches Passwort fest." : "Wähle ein neues Passwort mit mindestens 8 Zeichen."}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        <Field label="Neues Passwort" htmlFor="password" error={errors.fields.password}>
          <PasswordInput id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        </Field>
        <Field label="Passwort wiederholen" htmlFor="passwordRepeat" error={errors.fields.passwordRepeat}>
          <PasswordInput id="passwordRepeat" autoComplete="new-password" value={passwordRepeat} onChange={(e) => setPasswordRepeat(e.target.value)} required />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Passwort speichern
        </Button>
      </form>
    </AuthCard>
  );
}

export function VerifyEmailView() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const { user, refresh } = useSession();
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ok"; email: string } | { kind: "error"; message: string }>(token ? { kind: "loading" } : { kind: "error", message: "Der Link ist unvollständig." });
  const started = useRef(false);
  const [email, setEmail] = useState("");
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api.auth
      .verifyEmail(token)
      .then((res) => {
        setState({ kind: "ok", email: res.email });
        void refresh();
      })
      .catch((error) => setState({ kind: "error", message: userMessage(error) }));
  }, [token, refresh]);

  if (state.kind === "loading") {
    return (
      <AuthCard title="E-Mail wird bestätigt …">
        <Spinner />
      </AuthCard>
    );
  }
  if (state.kind === "ok") {
    return (
      <AuthCard title="E-Mail bestätigt">
        <div className="space-y-4 text-sm text-ink-2">
          <CheckCircle2 className="h-10 w-10 text-good" aria-hidden />
          <p>
            Danke! <strong className="text-ink">{state.email}</strong> ist bestätigt.
          </p>
          <Link href={user ? "/member" : "/login?verified=1"} className="inline-flex h-11 items-center rounded-lg bg-brand px-5 font-medium text-white hover:bg-brand-hover dark:text-[#0d1510]">
            {user ? "Zu meinem Bereich" : "Jetzt anmelden"}
          </Link>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Bestätigung fehlgeschlagen">
      <div className="space-y-4">
        <Alert tone="warning">{state.message}</Alert>
        {resent ? (
          <Alert tone="success">Wenn ein unbestätigtes Konto existiert, ist ein neuer Link unterwegs.</Alert>
        ) : (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await api.auth.resendVerification(email).catch(() => undefined);
              setResent(true);
            }}
          >
            <Field label="Neuen Link anfordern" htmlFor="email">
              <Input id="email" type="email" placeholder="deine@email.de" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Button type="submit" variant="secondary">
              Link senden
            </Button>
          </form>
        )}
      </div>
    </AuthCard>
  );
}
