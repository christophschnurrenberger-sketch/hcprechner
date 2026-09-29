"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  Calculator,
  ClipboardList,
  FlaskConical,
  Flag,
  Gauge,
  ListOrdered,
  MapPinned,
  MoreHorizontal,
  PlusCircle,
  Settings,
  ShieldCheck,
  BookOpen,
  LogIn,
  UserCircle,
  X,
} from "lucide-react";
import { cn, formatHcp } from "@/lib/format";
import { useHcp } from "@/components/providers/HcpStoreProvider";
import { useAccount } from "@/components/providers/AccountProvider";
import { SyncStatusBadge } from "@/components/account/SyncStatusBadge";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Gauge;
  match?: (path: string) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: Gauge, match: (p) => p === "/" },
  { href: "/runde-erfassen", label: "Runde erfassen", icon: PlusCircle },
  { href: "/runden", label: "Meine Runden", icon: ClipboardList },
  { href: "/scoring-record", label: "Scoring Record", icon: ListOrdered },
  { href: "/golfplaetze", label: "Golfplätze", icon: MapPinned },
  { href: "/simulator", label: "HCP-Simulator", icon: FlaskConical },
  { href: "/gbe-rechner", label: "GBE-Rechner", icon: Calculator },
  { href: "/statistiken", label: "Statistiken", icon: BarChart3 },
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
  { href: "/admin", label: "Admin", icon: ShieldCheck },
];

const MOBILE_PRIMARY = ["/", "/runde-erfassen", "/runden", "/scoring-record"];

function isActive(item: NavItem, path: string) {
  return item.match ? item.match(path) : path === item.href || path.startsWith(item.href + "/");
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white dark:text-[#0d1510]">
        <Flag className="h-5 w-5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold text-ink">Golf HCP Rechner</span>
        <span className="block text-[11px] font-medium uppercase tracking-wider text-ink-3">WHS 2026 · Bayern</span>
      </span>
    </Link>
  );
}

function HcpChip() {
  const { ready, result } = useHcp();
  if (!ready) return null;
  return (
    <Link href="/scoring-record" className="rounded-lg bg-brand-soft px-2.5 py-1 text-right" title="Aktueller Handicap Index">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-brand">HCPI</span>
      <span className="tabular block text-sm font-semibold text-ink">{formatHcp(result.status.currentHandicapIndex)}</span>
    </Link>
  );
}

/** Anmelden bzw. angemeldeter Benutzer (nur wenn der Server Benutzerkonten anbietet). */
function AccountEntry({ compact = false }: { compact?: boolean }) {
  const { state } = useAccount();
  if (state.status === "authenticated") {
    return (
      <Link href="/konto" className={cn("flex items-center gap-2 rounded-lg hover:text-ink", compact ? "" : "px-3 py-2 hover:bg-surface-2")} title="Mein Konto">
        <UserCircle className="h-[18px] w-[18px] shrink-0 text-brand" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">{state.user.displayName}</span>
          {!compact && <SyncStatusBadge />}
        </span>
      </Link>
    );
  }
  if (state.status === "anonymous") {
    return (
      <Link href="/anmelden" className={cn("flex items-center gap-2 rounded-lg text-sm font-medium text-ink-2 hover:text-ink", compact ? "" : "px-3 py-2 hover:bg-surface-2")}>
        <LogIn className="h-[18px] w-[18px]" aria-hidden /> Anmelden
      </Link>
    );
  }
  return null;
}

/** Hinweis, solange ein Benutzer noch mit dem vom Admin vergebenen Startpasswort angemeldet ist. */
function PasswordReminder({ pathname }: { pathname: string }) {
  const { state } = useAccount();
  if (state.status !== "authenticated" || !state.user.mustChangePassword || pathname.replace(/\/+$/, "") === "/konto") return null;
  return (
    <div className="no-print mb-5 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
      Sie sind mit einem Startpasswort angemeldet.{" "}
      <Link href="/konto" className="font-medium underline">
        Jetzt eigenes Passwort festlegen
      </Link>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [moreOpen, setMoreOpen] = useState(false);
  const { settings } = useHcp();

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "light" || settings.theme === "dark") root.setAttribute("data-theme", settings.theme);
    else root.removeAttribute("data-theme");
  }, [settings.theme]);

  useEffect(() => {
    // Menü bei Navigation schließen
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMoreOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      {/* Desktop-Sidebar */}
      <aside className="no-print sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface lg:flex">
        <div className="px-5 py-5">
          <Brand />
        </div>
        <nav aria-label="Hauptnavigation" className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  item.href === "/admin" && "mt-3",
                )}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border px-2 py-2">
          <AccountEntry />
        </div>
        <div className="border-t border-border px-5 py-4 text-xs text-ink-3">
          <Link href="/methodik" className="flex items-center gap-2 hover:text-ink">
            <BookOpen className="h-4 w-4" aria-hidden /> Rechenregeln &amp; Methodik
          </Link>
          <p className="mt-2">Regelwerk: Deutschland / DGV · 2026</p>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Mobile-Kopfzeile */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <Brand />
          <HcpChip />
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          <PasswordReminder pathname={pathname} />
          {children}
        </main>
      </div>

      {/* Mobile-Navigation unten */}
      <nav
        aria-label="Navigation"
        className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="grid grid-cols-5">
          {NAV_ITEMS.filter((i) => MOBILE_PRIMARY.includes(i.href)).map((item) => {
            const active = isActive(item, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-brand" : "text-ink-3")}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {item.label === "Runde erfassen" ? "Erfassen" : item.label === "Meine Runden" ? "Runden" : item.label === "Scoring Record" ? "Record" : item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-ink-3"
            aria-haspopup="dialog"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
            Mehr
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Weitere Bereiche">
          <button type="button" aria-label="Schließen" className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">Weitere Bereiche</p>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Schließen" className="rounded p-1 text-ink-3">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-3 rounded-xl border border-border px-3 py-2 empty:hidden">
              <AccountEntry compact />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[...NAV_ITEMS.filter((i) => !MOBILE_PRIMARY.includes(i.href)), { href: "/methodik", label: "Methodik", icon: BookOpen }].map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-border px-2 py-3 text-center text-xs font-medium text-ink-2"
                  >
                    <Icon className="h-5 w-5 text-brand" aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
