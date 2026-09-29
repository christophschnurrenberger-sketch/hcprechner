"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { regionByKey } from "@/lib/courses/regions";
import type { CourseDto } from "@/lib/courses/types";
import { cn } from "@/lib/format";
import { Alert, Badge, Input } from "@/components/ui";

export interface CourseSummary {
  id: string;
  slug: string;
  name: string;
  officialName: string | null;
  city: string | null;
  postalCode: string | null;
  region: string | null;
  facilityType: string;
  verified: boolean;
  has9: boolean;
  has18: boolean;
  teeColors: string[];
  verifiedRatingCount: number;
  distanceKm: number | null;
}

export function useCourseSearch(query: string, extra = "") {
  const [state, setState] = useState<{ loading: boolean; error: string | null; results: CourseSummary[]; totalCourses: number | null }>({
    loading: true,
    error: null,
    results: [],
    totalCourses: null,
  });
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const res = await fetch(`/api/courses?q=${encodeURIComponent(query)}${extra}`, { signal: controller.signal });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Fehler");
        setState({ loading: false, error: null, results: json.results, totalCourses: json.totalCourses });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setState({ loading: false, error: (error as Error).message, results: [], totalCourses: null });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, extra]);
  return state;
}

export async function fetchCourse(id: string): Promise<CourseDto> {
  const res = await fetch(`/api/courses/${encodeURIComponent(id)}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Anlage konnte nicht geladen werden");
  return json as CourseDto;
}

export function CoursePicker({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (course: CourseDto) => void;
}) {
  const [query, setQuery] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const search = useCourseSearch(query);

  async function pick(id: string) {
    setLoadingId(id);
    setError(null);
    try {
      onSelect(await fetchCourse(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Golfclub, Ort oder PLZ suchen …"
          className="pl-9"
          aria-label="Golfplatz suchen"
          autoFocus
        />
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {search.error && <Alert tone="error" title="Golfplatzdatenbank nicht erreichbar">{search.error}</Alert>}
      {!search.error && search.totalCourses === 0 && (
        <Alert tone="info" title="Die Golfplatzdatenbank ist noch leer">
          Es sind noch keine Anlagen importiert. Nutzen Sie „Manuell / Ausland“ und übernehmen Sie Course Rating, Slope und Par von der
          offiziellen Scorekarte – oder befüllen Sie die Datenbank im Admin-Bereich (CSV-Import bzw. Bayern-Importer).
        </Alert>
      )}
      <ul className="max-h-[22rem] divide-y divide-border overflow-y-auto rounded-xl border border-border bg-surface">
        {search.loading && search.results.length === 0 && (
          <li className="flex items-center gap-2 px-4 py-3 text-sm text-ink-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Suche …
          </li>
        )}
        {!search.loading && search.results.length === 0 && (search.totalCourses ?? 0) > 0 && (
          <li className="px-4 py-3 text-sm text-ink-3">Keine Anlage gefunden.</li>
        )}
        {search.results.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => pick(c.id)}
              className={cn(
                "flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2",
                selectedId === c.id && "bg-brand-soft",
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{c.name}</span>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-3">
                  <MapPin className="h-3 w-3" aria-hidden />
                  {[c.postalCode, c.city].filter(Boolean).join(" ") || "Ort unbekannt"}
                  {c.region && <> · {regionByKey(c.region)?.label}</>}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="flex gap-1">
                  {c.has18 && <Badge>18</Badge>}
                  {c.has9 && <Badge>9</Badge>}
                </span>
                {c.verifiedRatingCount > 0 ? (
                  <Badge tone="good">{c.verifiedRatingCount} Ratings geprüft</Badge>
                ) : (
                  <Badge tone="warning">keine geprüften Ratings</Badge>
                )}
                {loadingId === c.id && <Loader2 className="h-4 w-4 animate-spin text-ink-3" />}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
