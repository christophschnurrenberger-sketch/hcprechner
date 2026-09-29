import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ExternalLink, MapPin } from "lucide-react";
import { getCourse } from "@/server/courseRepository";
import { coursePath } from "@/lib/courses/paths";
import { regionByKey } from "@/lib/courses/regions";
import { genderLabel, TEE_SWATCH } from "@/lib/courses/tees";
import type { CourseDto, RatingSetDto } from "@/lib/courses/types";
import { SOURCE_TYPE_LABELS } from "@/lib/whs/messages";
import { cn, formatDate, formatDecimal } from "@/lib/format";
import { todayIso } from "@/lib/whs/dates";
import { Alert, Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { MyCourseStats } from "./MyCourseStats";

export const dynamic = "force-dynamic";

async function load(slug: string): Promise<CourseDto | null> {
  try {
    const course = await getCourse(slug);
    return course && course.active ? course : null;
  } catch {
    return null;
  }
}

export async function generateMetadata(props: PageProps<"/golfplaetze/[region]/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const course = await load(slug);
  if (!course) return { title: "Golfplatz nicht gefunden" };
  const place = [course.city, regionByKey(course.region)?.label].filter(Boolean).join(", ");
  return {
    title: `${course.name}${place ? ` – ${place}` : ""}`,
    description: `${course.name}: Plätze, Abschläge, Course Rating, Slope und Par mit Datenquelle und Prüfdatum.`,
  };
}

function ratingLabel(s: RatingSetDto) {
  return `${s.holes}${s.nine ? (s.nine === "FRONT" ? " (Front Nine)" : " (Back Nine)") : ""}`;
}

function RatingTable({ sets }: { sets: RatingSetDto[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="tabular w-full whitespace-nowrap text-sm">
        <thead className="bg-surface-2 text-left text-xs text-ink-3">
          <tr>
            <th className="px-3 py-2 font-medium">Abschlag</th>
            <th className="px-3 py-2 font-medium">Geschlecht</th>
            <th className="px-3 py-2 font-medium">Löcher</th>
            <th className="px-3 py-2 text-right font-medium">Par</th>
            <th className="px-3 py-2 text-right font-medium">CR</th>
            <th className="px-3 py-2 text-right font-medium">Slope</th>
            <th className="px-3 py-2 text-right font-medium">Länge</th>
            <th className="px-3 py-2 font-medium">Gültig</th>
            <th className="px-3 py-2 font-medium">Quelle</th>
            <th className="px-3 py-2 font-medium">Geprüft</th>
          </tr>
        </thead>
        <tbody>
          {sets.map((s) => (
            <tr key={s.id} className={cn("border-t border-border", !s.verified && "text-ink-3")}>
              <td className="px-3 py-2">
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full border border-border-strong" style={{ background: TEE_SWATCH[s.teeColor] ?? "#ccc" }} aria-hidden />
                  {s.teeColor}
                  {s.teeName && <span className="text-ink-3">({s.teeName})</span>}
                </span>
              </td>
              <td className="px-3 py-2">{genderLabel(s.gender)}</td>
              <td className="px-3 py-2">{ratingLabel(s)}</td>
              <td className="px-3 py-2 text-right">{s.par ?? "–"}</td>
              <td className="px-3 py-2 text-right font-semibold">{formatDecimal(s.courseRating)}</td>
              <td className="px-3 py-2 text-right font-semibold">{s.slopeRating ?? "–"}</td>
              <td className="px-3 py-2 text-right">{s.yardage ? `${s.yardage} m` : "–"}</td>
              <td className="px-3 py-2 text-xs">
                {s.validFrom ? `ab ${formatDate(s.validFrom)}` : "–"}
                {s.validTo ? ` bis ${formatDate(s.validTo)}` : ""}
              </td>
              <td className="px-3 py-2 text-xs">
                {s.sourceType ? SOURCE_TYPE_LABELS[s.sourceType] ?? s.sourceType : "–"}
                {s.sourceUrl && (
                  <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center text-brand underline">
                    öffnen <ExternalLink className="ml-0.5 h-3 w-3" />
                  </a>
                )}
              </td>
              <td className="px-3 py-2 text-xs">
                {s.verified ? <Badge tone="good">verifiziert {formatDate(s.lastVerifiedAt ?? s.checkedAt)}</Badge> : <Badge tone="warning">nicht verifiziert</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function CoursePage(props: PageProps<"/golfplaetze/[region]/[slug]">) {
  const { region, slug } = await props.params;
  const course = await load(slug);
  if (!course) notFound();
  const canonical = coursePath(course);
  if (canonical !== `/golfplaetze/${region}/${slug}`) permanentRedirect(canonical);

  const today = todayIso();
  const regionLabel = regionByKey(course.region)?.label;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "GolfCourse",
    name: course.name,
    url: course.website ?? undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: course.address ?? undefined,
      postalCode: course.postalCode ?? undefined,
      addressLocality: course.city ?? undefined,
      addressRegion: regionLabel ?? "Bayern",
      addressCountry: course.country,
    },
    geo: course.latitude != null && course.longitude != null ? { "@type": "GeoCoordinates", latitude: course.latitude, longitude: course.longitude } : undefined,
  };

  return (
    <div className="space-y-5">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="text-sm text-ink-3">
        <Link href="/golfplaetze" className="hover:text-ink">
          Golfplätze
        </Link>{" "}
        /{" "}
        <Link href={`/golfplaetze/${regionByKey(course.region)?.slug ?? "bayern"}`} className="hover:text-ink">
          {regionLabel ?? "Bayern"}
        </Link>
      </nav>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{course.name}</h1>
        {course.officialName && course.officialName !== course.name && <p className="text-sm text-ink-2">{course.officialName}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
          <span className="flex items-center gap-1">
            <MapPin className="h-4 w-4" aria-hidden /> {[course.address, [course.postalCode, course.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Adresse unbekannt"}
          </span>
          {regionLabel && <span>{regionLabel}</span>}
          {course.website && (
            <a href={course.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand underline">
              Website <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {course.bayernGolfverbandUrl && (
            <a href={course.bayernGolfverbandUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand underline">
              BGV-Eintrag <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </p>
      </div>

      {course.facilityType === "DRIVING_RANGE" && <Alert tone="info">Übungsanlage / Driving Range – kein handicap-relevanter Golfplatz.</Alert>}
      {!course.verified && (
        <Alert tone="warning" title="Stammdaten nicht verifiziert">
          Die Angaben zu dieser Anlage wurden noch nicht gegen eine offizielle Quelle geprüft.
        </Alert>
      )}

      {course.layouts.filter((l) => l.active).length === 0 && course.facilityType !== "DRIVING_RANGE" && (
        <Alert tone="info">Für diese Anlage sind noch keine Plätze und Ratings hinterlegt.</Alert>
      )}

      {course.layouts
        .filter((l) => l.active)
        .map((layout) => {
          const active = layout.ratingSets.filter((s) => s.active && (!s.validTo || s.validTo >= today));
          const history = layout.ratingSets.filter((s) => s.active && s.validTo && s.validTo < today);
          return (
            <Card key={layout.id}>
              <CardHeader
                title={layout.name}
                subtitle={`${layout.holesCount} Löcher${layout.combinationName ? ` · ${layout.combinationName}` : ""}`}
              />
              <CardBody className="space-y-4">
                {active.length > 0 ? (
                  <RatingTable sets={active} />
                ) : (
                  <p className="text-sm text-warning">Für diesen Platz liegen keine WHS-Ratingdaten vor.</p>
                )}
                {active.some((s) => !s.verified) && (
                  <p className="text-xs text-ink-3">Nicht verifizierte Werte werden angezeigt, aber nicht automatisch für exakte Handicap-Berechnungen verwendet.</p>
                )}
                {history.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">Frühere Ratings ({history.length})</summary>
                    <div className="mt-3">
                      <RatingTable sets={history} />
                    </div>
                  </details>
                )}
                {layout.holes.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">Lochdaten</summary>
                    <div className="mt-3 overflow-x-auto">
                      <table className="tabular text-sm">
                        <tbody>
                          {(["holeNumber", "par", "strokeIndex"] as const).map((k) => (
                            <tr key={k} className="border-t border-border">
                              <th className="px-2 py-1 text-left text-xs font-medium text-ink-3">{k === "holeNumber" ? "Loch" : k === "par" ? "Par" : "HCP"}</th>
                              {layout.holes
                                .filter((h) => h.gender === null)
                                .map((h) => (
                                  <td key={h.id} className="px-2 py-1 text-center">
                                    {h[k] ?? "–"}
                                  </td>
                                ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </CardBody>
            </Card>
          );
        })}

      <MyCourseStats courseId={course.id} courseName={course.name} />

      <p className="text-xs text-ink-3">
        Stammdaten zuletzt geprüft: {formatDate(course.lastVerifiedAt)}. Ratingwerte stammen ausschließlich aus dokumentierten Quellen; fehlende Werte
        werden nicht geschätzt.
      </p>
    </div>
  );
}
