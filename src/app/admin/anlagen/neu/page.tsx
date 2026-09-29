import { requireAdminPage } from "@/server/adminAuth";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { CourseForm } from "../../AdminForms";

export default async function NewCoursePage() {
  await requireAdminPage();
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
