import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireAdminPage } from "@/server/adminAuth";
import { getCourse } from "@/server/courseRepository";
import { coursePath } from "@/lib/courses/paths";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { CourseForm } from "../../AdminForms";
import { LayoutEditor } from "./LayoutEditor";

export default async function EditCoursePage(props: PageProps<"/admin/anlagen/[id]">) {
  await requireAdminPage();
  const { id } = await props.params;
  const course = await getCourse(id);
  if (!course) notFound();
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
            <CourseForm course={course} />
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
