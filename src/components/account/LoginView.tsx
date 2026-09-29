"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { useAccount } from "@/components/providers/AccountProvider";
import { Alert, Button, Card, CardBody, CardHeader, Field, Input } from "@/components/ui";
import { LoadingState } from "@/components/dashboard/DashboardView";

export function LoginView() {
  const { state, login } = useAccount();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (state.status === "authenticated") router.replace(state.user.mustChangePassword ? "/konto" : "/");
  }, [state, router]);

  if (state.status === "loading" || state.status === "authenticated") return <LoadingState />;
  if (state.status === "unavailable") {
    return <Alert tone="info" title="Anmeldung nicht verfügbar">Auf diesem Server sind keine Benutzerkonten eingerichtet. Ihre Daten werden im Browser gespeichert.</Alert>;
  }
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader title="Anmelden" subtitle="Mit den Zugangsdaten, die Sie vom Betreiber erhalten haben." />
      <CardBody>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setPending(true);
            setError(null);
            try {
              await login(String(fd.get("username") ?? ""), String(fd.get("password") ?? ""));
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setPending(false);
            }
          }}
        >
          <Field label="Benutzername" htmlFor="login-user">
            <Input id="login-user" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
          </Field>
          <Field label="Passwort" htmlFor="login-pw">
            <Input id="login-pw" name="password" type="password" autoComplete="current-password" required />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" disabled={pending}>
            <LogIn className="h-4 w-4" /> {pending ? "Anmelden …" : "Anmelden"}
          </Button>
          <p className="text-xs text-ink-3">Ohne Anmeldung funktioniert der Rechner ebenfalls – die Daten bleiben dann nur in diesem Browser.</p>
        </form>
      </CardBody>
    </Card>
  );
}
