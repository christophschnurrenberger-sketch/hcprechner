"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, ChevronDown, ClipboardList, Gauge, Home, LogOut, MapPinned, Plus, ShieldCheck, UserCircle, UsersRound, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/format";
import { useSession } from "@/components/session/SessionProvider";
import { PageSkeleton } from "@/components/ui/feedback";
import { Brand } from "./Brand";
import { RoundSyncAgent } from "@/components/member/mobile/RoundSyncAgent";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

/** Fünf Punkte: Community ersetzt „Golfplätze“, solange der Betreiber sie eingeschaltet hat. */
function navFor(communityEnabled: boolean): NavItem[] {
  return [
    { href: "/member", label: "Home", icon: Home, exact: true },
    { href: "/member/hcp", label: "HCP", icon: Gauge },
    { href: "/member/rounds", label: "Runden", icon: ClipboardList },
    communityEnabled ? { href: "/member/community", label: "Community", icon: UsersRound } : { href: "/member/courses", label: "Golfplätze", icon: MapPinned },
    { href: "/member/profile", label: "Profil", icon: UserCircle },
  ];
}

function normalize(path: string | null): string {
  return (path ?? "/").replace(/\/+$/, "") || "/";
}

function isActive(item: NavItem, path: string): boolean {
  return item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
}

function UserMenu() {
  const { user, can, logout, settings } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  if (!user) return null;
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() || "?";
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" className="flex items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-surface-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{initials}</span>
        <span className="hidden max-w-[10rem] truncate text-sm font-medium text-ink lg:block">{user.firstName}</span>
        <ChevronDown className="hidden h-4 w-4 text-ink-3 lg:block" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-50 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-lg">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-xs text-ink-3">{user.email ?? user.username}</p>
          </div>
          <Link role="menuitem" href="/member/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
            <UserCircle className="h-4 w-4" aria-hidden /> Profil & Konto
          </Link>
          <Link role="menuitem" href="/member/stats" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
            <BarChart3 className="h-4 w-4" aria-hidden /> Statistik
          </Link>
          {settings.community.communityEnabled && (
            <Link role="menuitem" href="/member/courses" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
              <MapPinned className="h-4 w-4" aria-hidden /> Golfplätze
            </Link>
          )}
          <Link role="menuitem" href="/member/tools" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
            <Wrench className="h-4 w-4" aria-hidden /> Werkzeuge
          </Link>
          {can("admin.access") && (
            <Link role="menuitem" href="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
              <ShieldCheck className="h-4 w-4" aria-hidden /> Admin-Bereich
            </Link>
          )}
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              setOpen(false);
              await logout();
              router.replace("/login?loggedOut=1");
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Abmelden
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Mitgliederbereich: klare Navigation mit höchstens fünf Punkten, „+ Runde erfassen“ immer erreichbar,
 * auf dem Smartphone als Leiste am unteren Rand. Die Anzeige hängt von der Sitzung ab; die Daten liefert
 * ausschließlich die API nach serverseitiger Prüfung.
 */
export function MemberShell({ children }: { children: ReactNode }) {
  const { status, user, settings } = useSession();
  const router = useRouter();
  const path = normalize(usePathname());
  const NAV = navFor(settings.community.communityEnabled);
  const needsPassword = Boolean(user?.mustChangePassword) && path !== "/member/password";
  const needsOnboarding = Boolean(user && !user.mustChangePassword && !user.onboarded) && path !== "/member/welcome";

  useEffect(() => {
    if (status !== "ready") return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(path)}`);
    else if (needsPassword) router.replace("/member/password");
    else if (needsOnboarding) router.replace("/member/welcome");
  }, [status, user, needsPassword, needsOnboarding, path, router]);

  const focusMode = path === "/member/rounds/new" || path === "/member/rounds/stats" || path === "/member/welcome" || path === "/member/password";
  const ready = status === "ready" && user && !needsPassword && !needsOnboarding;

  return (
    <div className="min-h-dvh bg-surface-2 pb-24 sm:pb-10">
      <a href="#inhalt" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Zum Inhalt springen
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <Brand href="/member" />
          {!focusMode && (
            <nav aria-label="Mitgliederbereich" className="hidden items-center gap-1 sm:flex">
              {NAV.map((item) => {
                const active = isActive(item, path);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn("rounded-lg px-3 py-2 text-sm font-medium transition-colors", active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-3 hover:text-ink")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
          <div className="flex items-center gap-2">
            {!focusMode && (
              <Link href="/member/rounds/new" className="hidden items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-hover md:inline-flex dark:text-[#0d1510]">
                <Plus className="h-4 w-4" aria-hidden /> Runde erfassen
              </Link>
            )}
            <UserMenu />
          </div>
        </div>
      </header>

      <main id="inhalt" className="mx-auto max-w-5xl px-4 py-5 sm:py-8">
        {ready ? children : <PageSkeleton />}
      </main>
      {ready && <RoundSyncAgent />}

      {!focusMode && ready && (
        <>
          <Link
            href="/member/rounds/new"
            aria-label="Runde erfassen"
            className="fixed bottom-[5.25rem] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg hover:bg-brand-hover sm:hidden dark:text-[#0d1510]"
          >
            <Plus className="h-7 w-7" aria-hidden />
          </Link>
          <nav aria-label="Mitgliederbereich" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden">
            <ul className="grid grid-cols-5">
              {NAV.map((item) => {
                const active = isActive(item, path);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-brand" : "text-ink-3")}>
                      <Icon className="h-5 w-5" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </>
      )}
    </div>
  );
}
