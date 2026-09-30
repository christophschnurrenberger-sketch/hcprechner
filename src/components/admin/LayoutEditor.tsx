"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, LocateFixed, Pencil, Plus } from "lucide-react";
import { coverageLabel, greenCoverage } from "@/lib/courses/geo";
import { genderLabel, TEE_SWATCH } from "@/lib/courses/tees";
import type { CourseDto, LayoutDto, RatingSetDto } from "@/lib/courses/types";
import { SOURCE_TYPE_LABELS } from "@/lib/whs/messages";
import { cn, formatDate, formatDecimal } from "@/lib/format";
import { Badge, Button, Card, CardBody, CardHeader } from "@/components/ui";
import { HolesForm, LayoutForm, RatingSetForm } from "./AdminForms";
import { GreensForm } from "./GreensForm";
import { useAdminBackend } from "./AdminBackend";

const LAYOUT_TYPE_LABELS: Record<string, string> = {
  "9_HOLE": "9-Loch-Platz",
  "18_HOLE": "18-Loch-Platz",
  "27_HOLE": "27-Loch-Anlage",
  "36_HOLE": "36-Loch-Anlage",
  SHORT_COURSE: "Kurzplatz",
};

function RatingRow({ layout, rating }: { layout: LayoutDto; rating: RatingSetDto }) {
  const { toggleRatingActive, verifyRating } = useAdminBackend();
  const [editing, setEditing] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <tr className={cn("border-t border-border", !rating.active && "text-ink-3 line-through")}>
        <td className="px-2 py-1.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border border-border-strong" style={{ background: TEE_SWATCH[rating.teeColor] ?? "#ccc" }} aria-hidden />
            {rating.teeColor}
          </span>
        </td>
        <td className="px-2 py-1.5">{genderLabel(rating.gender)}</td>
        <td className="px-2 py-1.5">
          {rating.holes}
          {rating.nine ? (rating.nine === "FRONT" ? " F" : " B") : ""}
        </td>
        <td className="tabular px-2 py-1.5 text-right">{rating.par ?? "–"}</td>
        <td className="tabular px-2 py-1.5 text-right">{formatDecimal(rating.courseRating)}</td>
        <td className="tabular px-2 py-1.5 text-right">{rating.slopeRating ?? "–"}</td>
        <td className="px-2 py-1.5 text-xs">
          {rating.validFrom ? formatDate(rating.validFrom) : "–"} – {rating.validTo ? formatDate(rating.validTo) : "offen"}
        </td>
        <td className="px-2 py-1.5 text-xs">
          {rating.sourceType ? SOURCE_TYPE_LABELS[rating.sourceType] : <span className="text-warning">keine Quelle</span>}
          {rating.sourceUrl && (
            <a href={rating.sourceUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex text-brand" title="Quelle öffnen">
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </td>
        <td className="px-2 py-1.5 text-xs">{formatDate(rating.checkedAt)}</td>
        <td className="px-2 py-1.5">{rating.verified ? <Badge tone="good">verifiziert</Badge> : <Badge tone="warning">offen</Badge>}</td>
        <td className="px-2 py-1.5">
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} title="Bearbeiten">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <form action={verifyRating}>
              <input type="hidden" name="id" value={rating.id} />
              <input type="hidden" name="verified" value={rating.verified ? "false" : "true"} />
              <input type="hidden" name="checkedAt" value={today} />
              <Button size="sm" variant="ghost" type="submit" title={rating.verified ? "Verifizierung entfernen" : "Als verifiziert markieren (Prüfdatum heute)"}>
                <CheckCircle2 className={cn("h-3.5 w-3.5", rating.verified && "text-good")} />
              </Button>
            </form>
            <form action={toggleRatingActive}>
              <input type="hidden" name="id" value={rating.id} />
              <input type="hidden" name="active" value={rating.active ? "false" : "true"} />
              <Button size="sm" variant="ghost" type="submit">
                {rating.active ? "deaktivieren" : "aktivieren"}
              </Button>
            </form>
          </div>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={11} className="p-2">
            <RatingSetForm layout={layout} rating={rating} onDone={() => setEditing(false)} />
          </td>
        </tr>
      )}
    </>
  );
}

function LayoutCard({ course, layout }: { course: CourseDto; layout: LayoutDto }) {
  const [edit, setEdit] = useState(false);
  const [addRating, setAddRating] = useState(false);
  const [holes, setHoles] = useState(false);
  const [greens, setGreens] = useState(false);
  const gps = greenCoverage(layout);
  return (
    <Card>
      <CardHeader
        title={`${layout.name}${layout.active ? "" : " (inaktiv)"}`}
        subtitle={`${LAYOUT_TYPE_LABELS[layout.type] ?? layout.type} · ${layout.holesCount} Löcher${layout.combinationName ? ` · ${layout.combinationName}` : ""} · ${layout.holes.length} Lochdaten · Green GPS ${coverageLabel(gps)}`}
        action={
          <>
            <Button size="sm" variant="ghost" onClick={() => setEdit((v) => !v)}>
              Platz bearbeiten
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setHoles((v) => !v)}>
              Lochdaten
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setGreens((v) => !v)} aria-expanded={greens}>
              <LocateFixed className="h-4 w-4" /> GPS-Daten
            </Button>
            <Button size="sm" variant="subtle" onClick={() => setAddRating((v) => !v)}>
              <Plus className="h-4 w-4" /> Rating
            </Button>
          </>
        }
      />
      <CardBody className="space-y-3">
        {edit && <LayoutForm courseId={course.id} layout={layout} onDone={() => setEdit(false)} />}
        {holes && <HolesForm layout={layout} />}
        {greens && <GreensForm course={course} layout={layout} />}
        {addRating && <RatingSetForm layout={layout} onDone={() => setAddRating(false)} />}
        {layout.ratingSets.length === 0 ? (
          <p className="text-sm text-ink-3">Noch keine Rating-Sets. Werte nur aus offiziellen Quellen übernehmen – nie schätzen.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="text-left text-xs text-ink-3">
                <tr>
                  <th className="px-2 py-1 font-medium">Abschlag</th>
                  <th className="px-2 py-1 font-medium">Geschlecht</th>
                  <th className="px-2 py-1 font-medium">Löcher</th>
                  <th className="px-2 py-1 text-right font-medium">Par</th>
                  <th className="px-2 py-1 text-right font-medium">CR</th>
                  <th className="px-2 py-1 text-right font-medium">Slope</th>
                  <th className="px-2 py-1 font-medium">Gültigkeit</th>
                  <th className="px-2 py-1 font-medium">Quelle</th>
                  <th className="px-2 py-1 font-medium">Geprüft</th>
                  <th className="px-2 py-1 font-medium">Status</th>
                  <th className="px-2 py-1 font-medium">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {layout.ratingSets.map((r) => (
                  <RatingRow key={r.id} layout={layout} rating={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function LayoutEditor({ course }: { course: CourseDto }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Plätze / Layouts</h2>
        <Button size="sm" variant="secondary" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4" /> Platz anlegen
        </Button>
      </div>
      {adding && (
        <Card>
          <CardBody>
            <LayoutForm courseId={course.id} onDone={() => setAdding(false)} />
          </CardBody>
        </Card>
      )}
      {course.layouts.length === 0 && !adding && <p className="text-sm text-ink-3">Noch keine Plätze angelegt.</p>}
      {course.layouts.map((l) => (
        <LayoutCard key={l.id} course={course} layout={l} />
      ))}
    </div>
  );
}
