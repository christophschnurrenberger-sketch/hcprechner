import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getCourse } from "@/server/courseRepository";
import { coursePath } from "@/lib/courses/paths";
import { regionByKey } from "@/lib/courses/regions";
import type { CourseDto } from "@/lib/courses/types";
import { CourseDetailView, courseJsonLd } from "@/components/courses/CourseDetailView";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ region: string; slug: string }> };

async function load(slug: string): Promise<CourseDto | null> {
  try {
    const course = await getCourse(slug);
    return course && course.active ? course : null;
  } catch {
    return null;
  }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params;
  const course = await load(slug);
  if (!course) return { title: "Golfplatz nicht gefunden" };
  const place = [course.city, regionByKey(course.region)?.label].filter(Boolean).join(", ");
  return {
    title: `${course.name}${place ? ` – ${place}` : ""}`,
    description: `${course.name}: Plätze, Abschläge, Course Rating, Slope und Par mit Datenquelle und Prüfdatum.`,
  };
}

/** SEO-Seite einer Anlage (nur Node-Edition, serverseitig gerendert). */
export default async function CoursePage(props: Props) {
  const { region, slug } = await props.params;
  const course = await load(slug);
  if (!course) notFound();
  const canonical = coursePath(course);
  if (canonical !== `/golfplaetze/${region}/${slug}`) permanentRedirect(canonical);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(courseJsonLd(course)).replace(/</g, "\\u003c") }} />
      <CourseDetailView course={course} />
    </>
  );
}
