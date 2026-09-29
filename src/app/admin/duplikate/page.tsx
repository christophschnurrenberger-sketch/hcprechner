import Link from "next/link";
import { requireAdminPage } from "@/server/adminAuth";
import { loadAllCourses } from "@/server/courseRepository";
import { findDuplicates, type DuplicateReason } from "@/lib/courses/duplicates";
import { Badge, Card, CardBody, PageHeader } from "@/components/ui";
import { mergeCoursesAction } from "../actions";

const REASONS: Record<DuplicateReason, string> = {
  SAME_CLUB_ID: "gleiche Club-ID",
  SAME_WEBSITE: "gleiche Website",
  SAME_NORMALIZED_NAME: "gleicher normalisierter Name",
  SIMILAR_NAME: "ähnlicher Name",
  SAME_CITY: "gleicher Ort",
  SAME_POSTAL_CODE: "gleiche PLZ",
  SAME_ADDRESS: "gleiche Adresse",
  NEARBY: "Koordinaten < 1 km",
};

export default async function DuplicatesPage() {
  await requireAdminPage();
  const courses = (await loadAllCourses()).filter((c) => c.active);
  const byId = new Map(courses.map((c) => [c.id, c]));
  const pairs = findDuplicates(courses.map((c) => ({ ...c })));
  return (
    <>
      <PageHeader
        title="Duplikate"
        description="Verdachtsfälle aus Namensnormalisierung, Ort, Adresse, Koordinaten, Website und Club-ID. Echte Mehrplatz-Anlagen (z. B. Platz A/B/C) sind eine Anlage mit mehreren Layouts – beim Zusammenführen werden die Plätze übernommen."
      />
      {pairs.length === 0 ? (
        <p className="text-sm text-ink-3">Keine Duplikat-Verdachtsfälle.</p>
      ) : (
        <div className="space-y-3">
          {pairs.map((p) => {
            const a = byId.get(p.a)!;
            const b = byId.get(p.b)!;
            return (
              <Card key={`${p.a}-${p.b}`}>
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1 text-sm">
                    <p>
                      <Link href={`/admin/anlagen/${a.id}`} className="font-semibold text-brand hover:underline">
                        {a.name}
                      </Link>{" "}
                      <span className="text-ink-3">({a.city ?? "–"}, {a.layouts.length} Plätze)</span>
                    </p>
                    <p>
                      <Link href={`/admin/anlagen/${b.id}`} className="font-semibold text-brand hover:underline">
                        {b.name}
                      </Link>{" "}
                      <span className="text-ink-3">({b.city ?? "–"}, {b.layouts.length} Plätze)</span>
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone="warning">{Math.round(p.score * 100)} %</Badge>
                      {p.reasons.map((r) => (
                        <Badge key={r}>{REASONS[r]}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <form action={mergeCoursesAction}>
                      <input type="hidden" name="targetId" value={a.id} />
                      <input type="hidden" name="sourceId" value={b.id} />
                      <button type="submit" className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium hover:bg-surface-2">
                        „{b.name}“ in „{a.name}“ überführen
                      </button>
                    </form>
                    <form action={mergeCoursesAction}>
                      <input type="hidden" name="targetId" value={b.id} />
                      <input type="hidden" name="sourceId" value={a.id} />
                      <button type="submit" className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium hover:bg-surface-2">
                        „{a.name}“ in „{b.name}“ überführen
                      </button>
                    </form>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
