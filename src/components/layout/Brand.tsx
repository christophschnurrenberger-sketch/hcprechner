import Link from "next/link";
import { Flag } from "lucide-react";
import { cn } from "@/lib/format";

export function Brand({ href = "/", subtitle = "WHS 2026", className, inverted = false }: { href?: string; subtitle?: string; className?: string; inverted?: boolean }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)}>
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", inverted ? "bg-white/15 text-white" : "bg-brand text-white dark:text-[#0d1510]")}>
        <Flag className="h-5 w-5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className={cn("block text-[15px] font-semibold", inverted ? "text-white" : "text-ink")}>Golf HCP Rechner</span>
        <span className={cn("block text-[11px] font-medium uppercase tracking-wider", inverted ? "text-white/70" : "text-ink-3")}>{subtitle}</span>
      </span>
    </Link>
  );
}
