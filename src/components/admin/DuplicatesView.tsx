"use client";

import Link from "next/link";
import type { DuplicateReason } from "@/lib/courses/duplicates";
import type { DuplicateView } from "@/lib/courses/adminViews";
import { adminCoursePath } from "@/lib/courses/paths";
import { Badge, Card, CardBody, PageHeader } from "@/components/ui";
import { useAdminBackend } from "./AdminBackend";

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

export function DuplicatesView({ pairs }: { pairs: DuplicateView[] }) {
  const { mergeCourses } = useAdminBackend();
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
          {pairs.map(({ a, b, score, reasons }) => (
            <Card key={`${a.id}-${b.id}`}>
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1 text-sm">
                  {[a, b].map((c) => (
                    <p key={c.id}>
                      <Link href={adminCoursePath(c.id)} className="font-semibold text-brand hover:underline">
                        {c.name}
                      </Link>{" "}
                      <span className="text-ink-3">
                        ({c.city ?? "–"}, {c.layouts} Plätze)
                      </span>
                    </p>
                  ))}
                  <div className="flex flex-wrap gap-1">
                    <Badge tone="warning">{Math.round(score * 100)} %</Badge>
                    {reasons.map((r) => (
                      <Badge key={r}>{REASONS[r]}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {[
                    [a, b],
                    [b, a],
                  ].map(([target, source]) => (
                    <form key={target.id} action={mergeCourses}>
                      <input type="hidden" name="targetId" value={target.id} />
                      <input type="hidden" name="sourceId" value={source.id} />
                      <button type="submit" className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium hover:bg-surface-2">
                        „{source.name}“ in „{target.name}“ überführen
                      </button>
                    </form>
                  ))}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
