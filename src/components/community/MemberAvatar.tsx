"use client";

import { useState } from "react";
import { BASE_PATH, withBasePath } from "@/lib/runtime";
import { cn } from "@/lib/format";

const SIZES = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-16 w-16 text-lg", xl: "h-20 w-20 text-2xl" } as const;

/** Bild-URL aus der API (Node: ohne Basispfad, PHP: mit Basispfad). */
export function assetUrl(url: string): string {
  return BASE_PATH && !url.startsWith(`${BASE_PATH}/`) ? withBasePath(url) : url;
}

/** Profilbild oder Initialen – nie E-Mail oder interne Kennungen. */
export function MemberAvatar({ member, size = "md", className }: { member: { displayName: string; initials: string; avatarUrl: string | null }; size?: keyof typeof SIZES; className?: string }) {
  const [broken, setBroken] = useState(false);
  const base = cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft font-semibold text-brand", SIZES[size], className);
  if (member.avatarUrl && !broken) {
    // eslint-disable-next-line @next/next/no-img-element -- Profilbilder kommen über die geschützte API (kein Bild-Optimizer im statischen Export)
    return <img src={assetUrl(member.avatarUrl)} alt="" className={cn(base, "object-cover")} onError={() => setBroken(true)} loading="lazy" />;
  }
  return (
    <span className={base} aria-hidden>
      {member.initials}
    </span>
  );
}
