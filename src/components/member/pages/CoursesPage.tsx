"use client";

import Link from "next/link";
import { useState } from "react";
import { Home, Loader2, MapPin, Search, Star } from "lucide-react";
import { api } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import type { MemberCourseLists } from "@/lib/api/types";
import type { CourseSummary } from "@/lib/courses/summary";
import { regionByKey } from "@/lib/courses/regions";
import { cn } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Alert, Badge, Input, PageHeader } from "@/components/ui";
import { PageSkeleton, useToast } from "@/components/ui/feedback";
import { useCourseSearch } from "@/components/courses/CoursePicker";

export function memberCourseHref(id: string): string {
  return `/member/courses/view?id=${encodeURIComponent(id)}`;
}

function CourseRow({ course, favorite, home, onToggle }: { course: CourseSummary; favorite: boolean; home?: boolean; onToggle: (c: CourseSummary, fav: boolean) => void }) {
  return (
    <li className="flex items-center gap-2 rounded-2xl border border-border bg-surface pr-2 hover:border-border-strong">
      <Link href={memberCourseHref(course.id)} className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-semibold text-ink">
            {course.name}
            {home && <Badge tone="brand">Heimatplatz</Badge>}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-3">
            <MapPin className="h-3 w-3" aria-hidden />
            {[course.postalCode, course.city].filter(Boolean).join(" ") || "Ort unbekannt"}
            {course.region && <> · {regionByKey(course.region)?.label}</>}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {course.has18 && <Badge>18 Loch</Badge>}
            {course.has9 && <Badge>9 Loch</Badge>}
            {course.verifiedRatingCount > 0 ? <Badge tone="good">{course.verifiedRatingCount} geprüfte Ratings</Badge> : <Badge tone="warning">Ratings ungeprüft</Badge>}
          </div>
        </div>
      </Link>
      <button
        type="button"
        onClick={() => onToggle(course, !favorite)}
        aria-pressed={favorite}
        aria-label={favorite ? `${course.name} aus Favoriten entfernen` : `${course.name} zu Favoriten hinzufügen`}
        className="rounded-xl p-2.5 hover:bg-surface-3"
      >
        <Star className={cn("h-5 w-5", favorite ? "fill-accent text-accent" : "text-ink-3")} aria-hidden />
      </button>
    </li>
  );
}

export function CoursesPage() {
  const [query, setQuery] = useState("");
  const toast = useToast();
  const lists = useApi(() => api.member.courseLists(), "course-lists");
  const search = useCourseSearch(query);
  const favorites = new Set(lists.data?.favorites.map((c) => c.id) ?? []);
  const homeId = lists.data?.home?.id ?? null;

  async function toggle(course: CourseSummary, favorite: boolean) {
    try {
      await api.member.setFavorite(course.id, favorite);
      const current: MemberCourseLists = lists.data ?? { favorites: [], recent: [], home: null };
      lists.setData({ ...current, favorites: favorite ? [...current.favorites, course] : current.favorites.filter((c) => c.id !== course.id) });
      toast(favorite ? `${course.name} ist jetzt ein Favorit.` : `${course.name} aus den Favoriten entfernt.`);
    } catch (e) {
      toast(userMessage(e), "error");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Golfplätze" description="Finde Plätze mit Course und Slope Rating, merke dir Favoriten und lege deinen Heimatplatz fest." />
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Golfclub, Ort oder PLZ suchen …" className="h-12 pl-11 text-base" aria-label="Golfplatz suchen" />
      </div>

      {query.trim() ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-2">Suchergebnisse</h2>
          {search.error && <Alert tone="error">{search.error}</Alert>}
          {search.loading && search.results.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-ink-3">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Suche …
            </p>
          ) : search.results.length === 0 ? (
            <p className="text-sm text-ink-3">Keine Anlage gefunden.</p>
          ) : (
            <ul className="space-y-2">
              {search.results.map((c) => (
                <CourseRow key={c.id} course={c} favorite={favorites.has(c.id)} home={c.id === homeId} onToggle={toggle} />
              ))}
            </ul>
          )}
        </section>
      ) : !lists.data ? (
        <PageSkeleton variant="list" />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-2">
              <Home className="h-4 w-4" aria-hidden /> Heimatplatz
            </h2>
            {lists.data.home ? (
              <ul>
                <CourseRow course={lists.data.home} favorite={favorites.has(lists.data.home.id)} home onToggle={toggle} />
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed border-border-strong bg-surface px-4 py-4 text-sm text-ink-3">Noch kein Heimatplatz. Öffne einen Platz und wähle „Als Heimatplatz festlegen“.</p>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-2">
              <Star className="h-4 w-4" aria-hidden /> Favoriten
            </h2>
            {lists.data.favorites.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border-strong bg-surface px-4 py-4 text-sm text-ink-3">Tippe bei einem Platz auf den Stern, um ihn hier zu speichern.</p>
            ) : (
              <ul className="space-y-2">
                {lists.data.favorites.map((c) => (
                  <CourseRow key={c.id} course={c} favorite home={c.id === homeId} onToggle={toggle} />
                ))}
              </ul>
            )}
          </section>
          {lists.data.recent.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-ink-2">Zuletzt gespielt</h2>
              <ul className="space-y-2">
                {lists.data.recent.map((c) => (
                  <CourseRow key={c.id} course={c} favorite={favorites.has(c.id)} home={c.id === homeId} onToggle={toggle} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
