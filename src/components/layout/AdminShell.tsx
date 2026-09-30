"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  BookOpenCheck,
  ClipboardList,
  Copy,
  FileClock,
  FileSpreadsheet,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  Star,
  Upload,
  Users,
  UsersRound,
  X,
  ArrowLeft,
} from "lucide-react";
import type { Permission } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { cn } from "@/lib/format";
import { useSession } from "@/components/session/SessionProvider";
import { PageSkeleton } from "@/components/ui/feedback";
import { Brand } from "./Brand";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Gauge;
  permission: Permission;
  exact?: boolean;
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Übersicht", items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, permission: "admin.access", exact: true }] },
  {
    label: "Benutzer",
    items: [
      { href: "/admin/users", label: "Benutzer", icon: Users, permission: "users.read" },
      { href: "/admin/rounds", label: "Runden", icon: ClipboardList, permission: "rounds.read" },
      { href: "/admin/community", label: "Community", icon: UsersRound, permission: "community.read" },
      { href: "/admin/permissions", label: "Rollen & Rechte", icon: KeyRound, permission: "admin.access" },
    ],
  },
  {
    label: "Golfplätze",
    items: [
      { href: "/admin/courses", label: "Anlagen", icon: MapPinned, permission: "courses.read" },
      { href: "/admin/ratings", label: "Ratings", icon: Star, permission: "courses.read" },
      { href: "/admin/sources", label: "Quellen", icon: BookOpenCheck, permission: "courses.read" },
      { href: "/admin/data-quality", label: "Datenqualität", icon: ShieldAlert, permission: "courses.read" },
      { href: "/admin/duplicates", label: "Duplikate", icon: Copy, permission: "courses.read" },
      { href: "/admin/import", label: "Import", icon: Upload, permission: "import" },
      { href: "/admin/changes", label: "Änderungen", icon: FileClock, permission: "courses.read" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/rules", label: "Regeln & Engine", icon: FileSpreadsheet, permission: "rules.read" },
      { href: "/admin/system", label: "Systemstatus", icon: Activity, permission: "system.read" },
      { href: "/admin/logs", label: "Audit-Log", icon: ScrollText, permission: "logs.read" },
      { href: "/admin/settings", label: "Einstellungen", icon: Settings, permission: "settings.write" },
    ],
  },
];

function normalize(path: string | null): string {
  return (path ?? "/").replace(/\/+$/, "") || "/";
}

function Sidebar({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  const { can } = useSession();
  return (
    <nav aria-label="Admin-Navigation" className="space-y-5">
      {GROUPS.map((group) => {
        const items = group.items.filter((i) => can(i.permission));
        if (items.length === 0) return null;
        return (
          <div key={group.label}>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-white/50">{group.label}</p>
            <ul className="mt-1.5 space-y-0.5">
              {items.map((item) => {
                const active = item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors", active ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white")}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className="relative w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim().length >= 2) router.push(`/admin/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        type="search"
        aria-label="Admin-Suche"
        placeholder="Benutzer, E-Mail, Runde, Golfplatz …"
        className="h-10 w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 focus:border-brand-2 focus:outline-none focus:ring-2 focus:ring-brand-2/20"
      />
    </form>
  );
}

/**
 * Admin-Bereich: eigenes Layout mit Seitenleiste und dichter Darstellung. Einträge erscheinen nach den Rechten
 * aus der Sitzung; jede Seite erhält ihre Daten nur über die Admin-API, die die Berechtigung selbst prüft.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { status, user, can, logout } = useSession();
  const router = useRouter();
  const path = normalize(usePathname());
  const [drawer, setDrawer] = useState(false);
  const allowed = Boolean(user && can("admin.access"));

  useEffect(() => {
    if (status !== "ready") return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(path)}`);
    else if (!can("admin.access")) router.replace("/member?denied=admin");
  }, [status, user, can, path, router]);

  return (
    <div className="min-h-dvh bg-surface-2 lg:grid lg:grid-cols-[15.5rem_1fr]">
      <a href="#inhalt" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Zum Inhalt springen
      </a>
      <aside className="hidden bg-[#10301f] px-3 py-4 lg:sticky lg:top-0 lg:block lg:h-dvh lg:overflow-y-auto dark:bg-[#0c1a13]">
        <div className="mb-6 px-2">
          <Brand href="/admin" subtitle="Admin-Bereich" inverted />
        </div>
        {allowed && <Sidebar path={path} />}
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin-Navigation">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Navigation schließen" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-[#10301f] px-3 py-4 dark:bg-[#0c1a13]">
            <div className="mb-6 flex items-center justify-between px-2">
              <Brand href="/admin" subtitle="Admin-Bereich" inverted />
              <button type="button" onClick={() => setDrawer(false)} className="rounded-lg p-1.5 text-white/80 hover:bg-white/10" aria-label="Schließen">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Sidebar path={path} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-border bg-surface">
          <div className="flex h-14 items-center gap-3 px-4">
            <button type="button" onClick={() => setDrawer(true)} className="rounded-lg p-2 text-ink-2 hover:bg-surface-3 lg:hidden" aria-label="Navigation öffnen">
              <Menu className="h-5 w-5" />
            </button>
            <span className="rounded-md bg-[#10301f] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white lg:hidden">Admin</span>
            <div className="flex-1">
              <GlobalSearch />
            </div>
            <Link href="/member" className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-2 hover:bg-surface-3 hover:text-ink md:inline-flex">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Mitgliederbereich
            </Link>
            {user && (
              <div className="hidden text-right text-xs leading-tight sm:block">
                <p className="font-semibold text-ink">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-ink-3">{ROLE_LABELS[user.role]}</p>
              </div>
            )}
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.replace("/login?loggedOut=1");
              }}
              className="rounded-lg p-2 text-ink-2 hover:bg-surface-3 hover:text-ink"
              aria-label="Abmelden"
              title="Abmelden"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
        <main id="inhalt" className="px-4 py-5 sm:px-6 lg:px-8">
          {status === "ready" && allowed ? children : <PageSkeleton variant="table" />}
        </main>
      </div>
    </div>
  );
}
