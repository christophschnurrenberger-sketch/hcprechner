import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadAllCourses } from "@/server/courseRepository";
import { coursePath } from "@/lib/courses/paths";
import { regionBySlug } from "@/lib/courses/regions";
import { courseCapabilities } from "@/lib/courses/search";
import { Alert, Badge, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ region: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { region } = await props.params;
  const r = regionBySlug(region);
  return { title: r ? `Golfplätze ${r.label}` : "Golfplätze Bayern" };
}

export default async function RegionPage(props: Props) {
  const { region } = await props.params;
  const r = regionBySlug(region);
  if (!r && region !== "bayern") notFound();
  let courses: Awaited<ReturnType<typeof loadAllCourses>> = [];
  let error = false;
  try {
    courses = (await loadAllCourses()).filter((c) => c.facilityType !== "DRIVING_RANGE" && (r ? c.region === r.key : !c.region));
  } catch {
    error = true;
  }
  return (
    <>
      <PageHeader
        title={r ? `Golfplätze in ${r.label}` : "Golfplätze in Bayern (ohne Regionszuordnung)"}
        description="Anlagen mit Plätzen, Abschlägen und – soweit verifiziert – Course Rating und Slope."
      />
      {error && <Alert tone="error">Die Golfplatzdatenbank ist nicht erreichbar.</Alert>}
      {!error && courses.length === 0 && <Alert tone="info">In dieser Region sind noch keine Anlagen erfasst.</Alert>}
      <ul className="grid gap-3 md:grid-cols-2">
        {courses.map((c) => {
          const caps = courseCapabilities(c);
          return (
            <li key={c.id}>
              <Link href={coursePath(c)} className="block rounded-xl border border-border bg-surface p-4 hover:border-border-strong">
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-ink-3">{[c.postalCode, c.city].filter(Boolean).join(" ")}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {caps.has18 && <Badge>18 Loch</Badge>}
                  {caps.has9 && <Badge>9 Loch</Badge>}
                  {caps.verifiedRatingCount > 0 ? <Badge tone="good">{caps.verifiedRatingCount} verifizierte Ratings</Badge> : <Badge tone="warning">keine verifizierten Ratings</Badge>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
