import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { coursePath } from "@/lib/courses/paths";
import type { CourseDto } from "@/lib/courses/types";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { CourseForm } from "./AdminForms";
import { CsvImporter } from "./CsvImporter";
import { LayoutEditor } from "./LayoutEditor";

/** Bearbeitung einer Anlage: Stammdaten, Plätze, Rating-Sets und Lochdaten. */
export function AdminCourseEditor({ course }: { course: CourseDto }) {
  return (
    <>
      <PageHeader
        title={course.name}
        description="Stammdaten, Plätze, Rating-Sets (je Abschlag, Geschlecht, 9/18 Loch und Gültigkeit) und Lochdaten"
        actions={
          <Link href={coursePath(course)} className="inline-flex items-center gap-1 text-sm text-brand underline" target="_blank">
            Öffentliche Seite <ExternalLink className="h-3 w-3" />
          </Link>
        }
      />
      <div className="space-y-5">
        <Card>
          <CardHeader title="Stammdaten" />
          <CardBody>
            <CourseForm key={course.id} course={course} />
          </CardBody>
        </Card>
        {course.facilityType === "DRIVING_RANGE" ? (
          <Card>
            <CardBody>
              <p className="text-sm text-ink-3">Driving Range / Übungsanlage – es können keine handicap-relevanten Plätze angelegt werden.</p>
            </CardBody>
          </Card>
        ) : (
          <LayoutEditor course={course} />
        )}
      </div>
    </>
  );
}

export function AdminNewCourse() {
  return (
    <>
      <PageHeader title="Anlage anlegen" description="Eine Anlage kann mehrere Plätze (Layouts) haben – diese werden nach dem Anlegen ergänzt." />
      <Card>
        <CardBody>
          <CourseForm />
        </CardBody>
      </Card>
    </>
  );
}

export function AdminCsvImport() {
  return (
    <>
      <PageHeader
        title="CSV-Import"
        description="Validieren → Duplikate erkennen → Vorschau mit markierten Änderungen → erst nach Bestätigung importieren. Werte ohne Quelle werden nie als verifiziert übernommen."
      />
      <CsvImporter />
    </>
  );
}
