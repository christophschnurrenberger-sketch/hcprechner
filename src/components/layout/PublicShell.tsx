"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, LogIn } from "lucide-react";
import { useSession } from "@/components/session/SessionProvider";
import { Brand } from "./Brand";

/** Öffentlicher Bereich: Startseite, Anmeldung, Registrierung, Hilfe, Golfplätze, Rechtliches. */
export function PublicShell({ children }: { children: ReactNode }) {
  const { user, status, settings } = useSession();
  return (
    <div className="flex min-h-dvh flex-col bg-surface-2">
      <a href="#inhalt" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Zum Inhalt springen
      </a>
      <header className="border-b border-border bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Brand />
          <nav aria-label="Hauptnavigation" className="flex items-center gap-1 text-sm">
            <Link href="/golfplaetze" className="hidden rounded-lg px-3 py-2 font-medium text-ink-2 hover:bg-surface-3 hover:text-ink sm:inline-flex">
              Golfplätze
            </Link>
            <Link href="/hilfe" className="hidden rounded-lg px-3 py-2 font-medium text-ink-2 hover:bg-surface-3 hover:text-ink sm:inline-flex">
              Hilfe
            </Link>
            {status === "ready" && user ? (
              <Link href="/member" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 font-medium text-white hover:bg-brand-hover dark:text-[#0d1510]">
                Mein Bereich <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <>
                <Link href="/login" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium text-ink-2 hover:bg-surface-3 hover:text-ink">
                  <LogIn className="h-4 w-4" aria-hidden /> Anmelden
                </Link>
                {settings.registrationOpen && (
                  <Link href="/register" className="hidden rounded-lg bg-brand px-3.5 py-2 font-medium text-white hover:bg-brand-hover sm:inline-flex dark:text-[#0d1510]">
                    Registrieren
                  </Link>
                )}
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="inhalt" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {settings.siteName} · Berechnung nach World Handicap System, DGV-Regeln 2026
          </p>
          <nav aria-label="Rechtliches" className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/hilfe" className="hover:text-ink">
              Hilfe & FAQ
            </Link>
            <Link href="/methodik" className="hover:text-ink">
              Berechnungsweg
            </Link>
            <Link href="/golfplaetze" className="hover:text-ink">
              Golfplätze
            </Link>
            <Link href="/datenschutz" className="hover:text-ink">
              Datenschutz
            </Link>
            <Link href="/impressum" className="hover:text-ink">
              Impressum
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** Zentrierte Karte für Anmeldung, Registrierung usw. */
export function AuthCard({ title, subtitle, children, footer }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-3">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-5 text-center text-sm text-ink-3">{footer}</div>}
    </div>
  );
}
