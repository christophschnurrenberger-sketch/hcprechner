"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { loginSchema } from "@/lib/auth/validation";
import { Alert, Button, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/ui/feedback";
import { AuthCard } from "@/components/layout/PublicShell";
import { useSession } from "@/components/session/SessionProvider";
import { safeNext, useFormErrors } from "./useFormErrors";

const NOTICES: Record<string, { tone: "info" | "success" | "warning"; text: string }> = {
  expired: { tone: "warning", text: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an." },
  disabled: { tone: "warning", text: "Dieses Konto ist deaktiviert. Bitte wende dich an den Administrator." },
  locked: { tone: "warning", text: "Dieses Konto ist gesperrt. Bitte wende dich an den Administrator." },
  loggedOut: { tone: "success", text: "Du wurdest abgemeldet." },
  reset: { tone: "success", text: "Dein Passwort wurde geändert. Bitte melde dich mit dem neuen Passwort an." },
  verified: { tone: "success", text: "Deine E-Mail-Adresse ist bestätigt. Du kannst dich jetzt anmelden." },
  deleted: { tone: "info", text: "Dein Konto wurde gelöscht." },
};

export function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, status, setUser, settings } = useSession();
  const next = safeNext(params.get("next"));
  const errors = useFormErrors();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);
  const notice = Object.keys(NOTICES).find((k) => params.get(k) === "1");

  useEffect(() => {
    if (status === "ready" && user && !busy) router.replace(next);
  }, [status, user, busy, next, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input = errors.validate(loginSchema, { email, password });
    if (!input) return;
    setBusy(true);
    setUnverified(false);
    try {
      const res = await api.auth.login(input.email, input.password);
      setUser(res.user);
      router.replace(res.user.mustChangePassword ? "/member/password" : next);
    } catch (error) {
      setBusy(false);
      if (error instanceof ApiError && error.code === "EMAIL_NOT_VERIFIED") setUnverified(true);
      errors.fromError(error);
    }
  }

  return (
    <AuthCard
      title="Anmelden"
      subtitle="Willkommen zurück! Melde dich mit deiner E-Mail-Adresse oder deinem Benutzernamen an."
      footer={
        settings.registrationOpen ? (
          <>
            Noch kein Konto?{" "}
            <Link href="/register" className="font-medium text-brand hover:underline">
              Jetzt registrieren
            </Link>
          </>
        ) : null
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {notice && !errors.form && <Alert tone={NOTICES[notice].tone === "success" ? "success" : NOTICES[notice].tone}>{NOTICES[notice].text}</Alert>}
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        {unverified && (
          <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm text-ink-2">
            {resent ? (
              "Wir haben dir einen neuen Bestätigungslink geschickt (falls ein Konto existiert). Bitte prüfe auch den Spam-Ordner."
            ) : (
              <button
                type="button"
                className="font-medium text-brand hover:underline"
                onClick={async () => {
                  await api.auth.resendVerification(email).catch(() => undefined);
                  setResent(true);
                }}
              >
                Bestätigungs-E-Mail erneut senden
              </button>
            )}
          </div>
        )}
        {/* type="text": vom Admin angelegte Konten ohne E-Mail (und Konten aus Version 1) melden sich mit dem Benutzernamen an */}
        <Field label="E-Mail oder Benutzername" htmlFor="email" error={errors.fields.email}>
          <Input id="email" type="text" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.fields.email)} required autoFocus />
        </Field>
        <Field label="Passwort" htmlFor="password" error={errors.fields.password}>
          <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(errors.fields.password)} required />
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium text-brand hover:underline">
            Passwort vergessen?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Anmelden
        </Button>
      </form>
    </AuthCard>
  );
}
