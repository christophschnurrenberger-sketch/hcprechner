"use client";

import type { ReactNode } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui";

export const exportLinkClass = "inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-2";

/** Export der Golfplatzdaten (CSV im Importschema, JSON vollständig, Qualitätsbericht). */
export function CourseExportCard({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardHeader title="Export" subtitle="Sicherung und Weitergabe der Golfplatzdaten." />
      <CardBody className="flex flex-wrap gap-2">{children}</CardBody>
    </Card>
  );
}
