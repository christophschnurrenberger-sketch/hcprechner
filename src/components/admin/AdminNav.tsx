"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";

const ITEMS = [
  { href: "/admin", label: "Übersicht" },
  { href: "/admin/anlagen", label: "Anlagen" },
  { href: "/admin/import", label: "CSV-Import" },
  { href: "/admin/qualitaet", label: "Datenqualität" },
  { href: "/admin/duplikate", label: "Duplikate" },
  { href: "/admin/aenderungen", label: "Änderungen" },
  { href: "/admin/benutzer", label: "Benutzer" },
];

/** `showUsers`: Benutzerverwaltung nur für den Inhaber (Haupt-Passwort), nicht für Co-Admins. */
export function AdminNav({ showUsers = false }: { showUsers?: boolean }) {
  const path = (usePathname() ?? "").replace(/\/+$/, "") || "/";
  return (
    <nav aria-label="Admin" className="flex flex-wrap gap-1 rounded-lg bg-surface-3 p-1">
      {ITEMS.filter((i) => showUsers || i.href !== "/admin/benutzer").map((i) => {
        // /admin/anlage?id=… ist die Bearbeitungsseite der Webspace-Edition
        const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href) || (i.href === "/admin/anlagen" && path === "/admin/anlage");
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium", active ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
