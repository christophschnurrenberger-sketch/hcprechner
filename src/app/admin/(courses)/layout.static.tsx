import type { ReactNode } from "react";
import { WebspaceCourseAdmin } from "@/components/admin/webspace/WebspaceCourseAdmin";

/** Webspace-Edition: Golfplatz-Datensatz laden, im Browser bearbeiten, über api/admin.php speichern. */
export default function CourseAdminLayout({ children }: { children: ReactNode }) {
  return <WebspaceCourseAdmin>{children}</WebspaceCourseAdmin>;
}
