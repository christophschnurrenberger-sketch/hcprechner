"use client";

import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { useSession } from "@/components/session/SessionProvider";

export function LandingActions() {
  const { user, settings, status } = useSession();
  if (status === "ready" && user) {
    return (
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/member" size="lg">
          Zu meinem Handicap <ArrowRight className="h-4 w-4" aria-hidden />
        </ButtonLink>
        <ButtonLink href="/member/rounds/new" size="lg" variant="secondary">
          Runde erfassen
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      {settings.registrationOpen && (
        <ButtonLink href="/register" size="lg">
          Kostenlos registrieren <ArrowRight className="h-4 w-4" aria-hidden />
        </ButtonLink>
      )}
      <ButtonLink href="/login" size="lg" variant="secondary">
        Anmelden
      </ButtonLink>
    </div>
  );
}
