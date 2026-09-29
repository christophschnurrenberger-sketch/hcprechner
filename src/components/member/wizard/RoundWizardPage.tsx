"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import type { RoundInput } from "@/lib/api/types";
import { fetchCourse } from "@/lib/courses/client";
import type { CourseDto } from "@/lib/courses/types";
import { todayIso } from "@/lib/whs/dates";
import { useApi } from "@/lib/useApi";
import { Alert, ButtonLink } from "@/components/ui";
import { ErrorState, PageSkeleton } from "@/components/ui/feedback";
import { roundHref } from "@/components/member/RoundList";
import { RoundWizard } from "./RoundWizard";
import { initialState, restoreState, type WizardState } from "./wizardState";

interface Loaded {
  state: WizardState;
  course: CourseDto | null;
  unsupported?: string;
}

/** Gespeicherte Eingabe → Wizard (zum Bearbeiten). */
function fromInput(input: RoundInput, base: WizardState): { state: WizardState; unsupported?: string } {
  const s: WizardState = { ...base, step: "review", date: input.date, category: input.category, holes: input.holes, nine: input.nine ?? null, pcc: input.pcc ?? 0, notes: input.notes ?? "" };
  const c = input.course;
  if (c?.kind === "DB") Object.assign(s, { courseKind: "DB", courseId: c.courseId, layoutId: c.layoutId, teeColor: c.teeColor, gender: c.gender });
  else if (c?.kind === "MANUAL")
    Object.assign(s, {
      courseKind: "MANUAL",
      gender: c.gender,
      manual: { courseName: c.courseName, city: c.city ?? "", teeColor: c.teeColor ?? "", par: String(c.par), courseRating: String(c.courseRating).replace(".", ","), slopeRating: String(c.slopeRating) },
    });
  const sc = input.score;
  if (sc.mode === "GBE") Object.assign(s, { scoreMode: "GBE", gbe: String(sc.adjustedGrossScore) });
  else if (sc.mode === "HOLES") Object.assign(s, { scoreMode: "HOLES", strokes: sc.strokes });
  else if (sc.mode === "STABLEFORD_TOTAL") Object.assign(s, { scoreMode: "STABLEFORD_TOTAL", stableford: String(sc.points) });
  else return { state: s, unsupported: "Diese Runde wurde importiert (Score Differential bzw. Stableford je Loch) und kann hier nicht bearbeitet werden. Bei Bedarf bitte löschen und neu erfassen." };
  if (!c) return { state: s, unsupported: "Diese Runde hat keine Platzangabe und kann hier nicht bearbeitet werden." };
  return { state: s };
}

export function RoundWizardPage() {
  const params = useSearchParams();
  const editId = params.get("edit");
  const draftParam = params.get("draft");
  const courseParam = params.get("course");
  const [draftId] = useState(() => draftParam ?? crypto.randomUUID());
  const lists = useApi(() => api.member.courseLists(), "lists");

  const loaded = useApi<Loaded>(async () => {
    const profile = await api.member.profile();
    const base = initialState(todayIso(), profile.profile.gender ?? "M");
    if (editId) {
      const detail = await api.member.round(editId);
      const { state, unsupported } = fromInput(detail.input, base);
      const course = state.courseKind === "DB" && state.courseId ? await fetchCourse(state.courseId).catch(() => null) : null;
      if (course) state.courseName = course.name;
      return { state, course, unsupported };
    }
    if (draftParam) {
      const drafts = await api.member.drafts();
      const draft = drafts.find((d) => d.id === draftParam);
      if (draft) {
        const state = restoreState(draft.input.wizard, base);
        const course = state.courseKind === "DB" && state.courseId ? await fetchCourse(state.courseId).catch(() => null) : null;
        return { state, course };
      }
    }
    const homeOrParam = courseParam ?? profile.preferences.homeCourseId;
    if (homeOrParam && courseParam) {
      const course = await fetchCourse(homeOrParam).catch(() => null);
      if (course) {
        const layouts = course.layouts.filter((l) => l.active);
        return { state: { ...base, courseId: course.id, courseName: course.name, layoutId: layouts.length === 1 ? layouts[0].id : null }, course };
      }
    }
    return { state: base, course: null };
  }, `${editId}|${draftParam}|${courseParam}`);

  if (loaded.error) return <ErrorState error={loaded.error} onRetry={loaded.reload} />;
  if (!loaded.data) return <PageSkeleton variant="detail" />;
  if (loaded.data.unsupported) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Alert tone="info">{loaded.data.unsupported}</Alert>
        {editId && <ButtonLink href={roundHref(editId)} variant="secondary">Zurück zur Runde</ButtonLink>}
      </div>
    );
  }
  return <RoundWizard initial={loaded.data.state} initialCourse={loaded.data.course} editId={editId} draftId={draftId} lists={lists.data} />;
}
