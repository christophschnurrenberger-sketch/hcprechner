"use client";

import { useSearchParams } from "next/navigation";
import { Home, Plus, Star } from "lucide-react";
import { api } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import { fetchCourse } from "@/lib/courses/client";
import { cn } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Button, ButtonLink } from "@/components/ui";
import { ErrorState, PageSkeleton, useToast } from "@/components/ui/feedback";
import { CourseDetailView } from "@/components/courses/CourseDetailView";

export function CourseDetailPage() {
  const id = useSearchParams().get("id") ?? "";
  const toast = useToast();
  const course = useApi(() => fetchCourse(id), `course-${id}`);
  const prefs = useApi(() => api.member.profile().then((p) => p.preferences), "prefs");

  if (course.error && !course.data) return <ErrorState error={course.error} onRetry={course.reload} title="Golfplatz nicht gefunden" />;
  if (!course.data) return <PageSkeleton variant="detail" />;
  const c = course.data;
  const favorite = Boolean(prefs.data?.favorites.includes(c.id));
  const isHome = prefs.data?.homeCourseId === c.id;

  return (
    <CourseDetailView
      course={c}
      basePath="/member/courses"
      actions={
        <>
          <ButtonLink href={`/member/rounds/new?course=${encodeURIComponent(c.id)}`}>
            <Plus className="h-4 w-4" aria-hidden /> Runde hier erfassen
          </ButtonLink>
          <Button
            variant="secondary"
            aria-pressed={favorite}
            onClick={async () => {
              try {
                prefs.setData(await api.member.setFavorite(c.id, !favorite));
                toast(favorite ? "Aus den Favoriten entfernt." : "Zu den Favoriten hinzugefügt.");
              } catch (e) {
                toast(userMessage(e), "error");
              }
            }}
          >
            <Star className={cn("h-4 w-4", favorite && "fill-accent text-accent")} aria-hidden /> {favorite ? "Favorit" : "Merken"}
          </Button>
          <Button
            variant="secondary"
            aria-pressed={isHome}
            onClick={async () => {
              try {
                prefs.setData(await api.member.setHomeCourse(isHome ? null : c.id));
                toast(isHome ? "Heimatplatz entfernt." : `${c.name} ist jetzt dein Heimatplatz.`);
              } catch (e) {
                toast(userMessage(e), "error");
              }
            }}
          >
            <Home className={cn("h-4 w-4", isHome && "text-brand")} aria-hidden /> {isHome ? "Heimatplatz" : "Als Heimatplatz festlegen"}
          </Button>
        </>
      }
    />
  );
}
