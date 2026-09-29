import { Suspense } from "react";
import { WsCourseEdit } from "@/components/admin/webspace/WebspaceAdminPages";

/** Bearbeitungsseite einer Anlage (/admin/anlage?id=…) – Webspace-Edition. */
export default function EditCoursePage() {
  return (
    <Suspense>
      <WsCourseEdit />
    </Suspense>
  );
}
