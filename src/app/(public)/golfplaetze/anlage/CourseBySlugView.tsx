"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchCourse } from "@/lib/courses/client";
import type { CourseDto } from "@/lib/courses/types";
import { Alert, ButtonLink } from "@/components/ui";
import { PageSkeleton } from "@/components/ui/feedback";
import { CourseDetailView } from "@/components/courses/CourseDetailView";

/** Webspace-Edition: Anlage über ?slug= aus dem veröffentlichten Datensatz laden. */
export function CourseBySlugView() {
  const slug = useSearchParams().get("slug") ?? "";
  const [state, setState] = useState<{ slug: string; course: CourseDto | null; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCourse(slug)
      .then((course) => !cancelled && setState({ slug, course: course.active ? course : null, error: course.active ? null : "Anlage nicht gefunden" }))
      .catch((e: Error) => !cancelled && setState({ slug, course: null, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (state?.course) document.title = `${state.course.name} · Golf HCP Rechner`;
  }, [state]);

  if (!state || state.slug !== slug) return <PageSkeleton variant="detail" />;
  if (!state.course) {
    return (
      <Alert tone="error" title="Golfplatz nicht gefunden">
        <p>{state.error}</p>
        <ButtonLink href="/golfplaetze" size="sm" variant="secondary" className="mt-3">
          Zur Golfplatzsuche
        </ButtonLink>
      </Alert>
    );
  }
  return <CourseDetailView course={state.course} />;
}
