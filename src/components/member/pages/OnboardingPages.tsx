"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Loader2, MapPin, PartyPopper } from "lucide-react";
import { api } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import { changePasswordSchema, handicapInputSchema } from "@/lib/auth/validation";
import type { CourseDto } from "@/lib/courses/types";
import { Alert, Button, Field, Input, Segmented } from "@/components/ui";
import { PasswordInput } from "@/components/ui/feedback";
import { CoursePicker } from "@/components/courses/CoursePicker";
import { useFormErrors } from "@/components/auth/useFormErrors";
import { useSession } from "@/components/session/SessionProvider";
import type { Gender } from "@/lib/whs/types";

/** Erster Besuch: Start-Handicap und Heimatplatz – danach sofort startklar. */
export function WelcomePage() {
  const router = useRouter();
  const { user, refresh } = useSession();
  const [step, setStep] = useState<1 | 2>(1);
  const [hcp, setHcp] = useState("");
  const [gender, setGender] = useState<Gender>("M");
  const [home, setHome] = useState<CourseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function finish(skipCourse: boolean) {
    const parsed = handicapInputSchema.safeParse(hcp);
    if (!parsed.success) {
      setStep(1);
      setError("Handicap zwischen +10 und 54,0 – oder leer lassen.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.member.completeOnboarding({ startHandicapIndex: parsed.data, homeCourseId: skipCourse ? null : (home?.id ?? null), gender });
      await refresh();
      router.replace("/member");
    } catch (e) {
      setError(userMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="text-center">
        <PartyPopper className="mx-auto h-10 w-10 text-brand" aria-hidden />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Willkommen{user ? `, ${user.firstName}` : ""}!</h1>
        <p className="mt-1 text-sm text-ink-3">Zwei kurze Fragen, dann kann es losgehen. Schritt {step} von 2.</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {step === 1 ? (
        <div className="space-y-5 rounded-2xl border border-border bg-surface p-5">
          <Field label="Wie ist dein aktueller Handicap Index?" htmlFor="w-hcp" hint="Aus der DGV-App oder vom Club. Leer lassen, wenn du noch keinen hast (Start mit 54,0).">
            <Input id="w-hcp" inputMode="decimal" value={hcp} onChange={(e) => setHcp(e.target.value)} placeholder="z. B. 18,4" className="h-12 max-w-[10rem] text-lg" autoFocus />
          </Field>
          <Field label="Du spielst meist als">
            <Segmented name="Geschlecht" value={gender} onChange={setGender} options={[{ value: "M", label: "Herren" }, { value: "F", label: "Damen" }]} />
          </Field>
          <Button size="lg" className="w-full" onClick={() => setStep(2)}>
            Weiter <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <div className="space-y-5 rounded-2xl border border-border bg-surface p-5">
          <div>
            <h2 className="font-semibold text-ink">Wo ist dein Heimatplatz?</h2>
            <p className="text-sm text-ink-3">Er steht dann beim Erfassen ganz oben. Optional.</p>
          </div>
          {home ? (
            <div className="flex items-center justify-between rounded-xl border border-brand-2/40 bg-brand-soft/60 px-4 py-3">
              <span className="flex items-center gap-2 font-semibold text-ink">
                <MapPin className="h-4 w-4 text-brand" aria-hidden /> {home.name}
              </span>
              <button type="button" className="text-sm font-medium text-brand hover:underline" onClick={() => setHome(null)}>
                ändern
              </button>
            </div>
          ) : (
            <CoursePicker selectedId={null} onSelect={setHome} />
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="lg" className="flex-1" onClick={() => finish(false)} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Fertig
            </Button>
            <Button size="lg" variant="ghost" onClick={() => finish(true)} disabled={busy}>
              Überspringen
            </Button>
          </div>
          <button type="button" className="text-sm text-ink-3 hover:text-ink" onClick={() => setStep(1)}>
            Zurück
          </button>
        </div>
      )}
    </div>
  );
}

/** Vorläufiges Passwort (vom Admin vergeben) → eigenes Passwort festlegen. */
export function ForcePasswordPage() {
  const router = useRouter();
  const { setUser } = useSession();
  const errors = useFormErrors();
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", newPasswordRepeat: "" });
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Eigenes Passwort festlegen</h1>
        <p className="mt-1 text-sm text-ink-3">Du bist mit einem vorläufigen Passwort angemeldet. Bitte wähle jetzt ein eigenes.</p>
      </div>
      <form
        noValidate
        className="space-y-4 rounded-2xl border border-border bg-surface p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const input = errors.validate(changePasswordSchema, values);
          if (!input) return;
          setBusy(true);
          try {
            const res = await api.auth.changePassword(input);
            setUser(res.user);
            router.replace(res.user.onboarded ? "/member" : "/member/welcome");
          } catch (error) {
            errors.fromError(error);
            setBusy(false);
          }
        }}
      >
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        <Field label="Vorläufiges Passwort" htmlFor="f-cur" error={errors.fields.currentPassword}>
          <PasswordInput id="f-cur" autoComplete="current-password" value={values.currentPassword} onChange={(e) => setValues({ ...values, currentPassword: e.target.value })} />
        </Field>
        <Field label="Neues Passwort" htmlFor="f-new" hint="Mindestens 8 Zeichen." error={errors.fields.newPassword}>
          <PasswordInput id="f-new" autoComplete="new-password" value={values.newPassword} onChange={(e) => setValues({ ...values, newPassword: e.target.value })} />
        </Field>
        <Field label="Neues Passwort wiederholen" htmlFor="f-rep" error={errors.fields.newPasswordRepeat}>
          <PasswordInput id="f-rep" autoComplete="new-password" value={values.newPasswordRepeat} onChange={(e) => setValues({ ...values, newPasswordRepeat: e.target.value })} />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Passwort speichern
        </Button>
      </form>
    </div>
  );
}
