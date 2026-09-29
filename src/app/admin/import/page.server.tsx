import { requireAdminPage } from "@/server/adminAuth";
import { AdminCsvImport } from "@/components/admin/AdminCourseEditor";

export default async function AdminImportPage() {
  await requireAdminPage();
  return <AdminCsvImport />;
}
