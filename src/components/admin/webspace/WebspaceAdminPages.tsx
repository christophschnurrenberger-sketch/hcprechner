"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { toAdminCourseRows, toDuplicateViews, toRatingRows, toSourceRows } from "@/lib/courses/adminViews";
import { coursesToCsv } from "@/lib/courses/csv";
import { datasetFromImport, missingSeedCourses, parseDataset, recordImportRun, type CourseDataset } from "@/lib/courses/dataset";
import { withBasePath } from "@/lib/runtime";
import { buildQualityReport } from "@/lib/courses/quality";
import { downloadText } from "@/lib/export/download";
import { todayIso } from "@/lib/whs/dates";
import { Alert, Button, ButtonLink, Card, CardBody, CardHeader } from "@/components/ui";
import { AdminCourseEditor, AdminCsvImport, AdminNewCourse } from "../AdminCourseEditor";
import { AdminCourseList } from "../AdminCourseList";
import { ChangesView } from "../ChangesView";
import { CourseExportCard, exportLinkClass } from "../CourseDataTools";
import { DuplicatesView } from "../DuplicatesView";
import { QualityView } from "../QualityView";
import { RatingsView, SourcesView } from "../RatingsView";
import { SeedCard } from "../SeedCard";
import { useAdminData } from "./WebspaceCourseAdmin";

function RestoreCard() {
  const { dataset, replaceDataset } = useAdminData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <Card>
      <CardHeader title="Datensatz einspielen" subtitle="JSON-Sicherung dieser Installation oder JSON-Export der Node-Edition. Ersetzt alle Golfplatzdaten." />
      <CardBody className="space-y-3">
        <input ref={fileRef} type="file" accept=".json,application/json" className="text-sm" aria-label="JSON-Datei" />
        <div>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              const file = fileRef.current?.files?.[0];
              if (!file) return setMessage({ ok: false, text: "Bitte eine JSON-Datei auswählen." });
              try {
                const imported = datasetFromImport(JSON.parse(await file.text()), dataset);
                if (!window.confirm(`${imported.courses.length} Anlagen einspielen und die aktuellen ${dataset.courses.length} Anlagen ersetzen?`)) return;
                await replaceDataset(recordImportRun(imported, "JSON", "RESTORED", { courses: imported.courses.length, file: file.name }, { actor: "admin" }));
                setMessage({ ok: true, text: `${imported.courses.length} Anlagen eingespielt.` });
              } catch (error) {
                setMessage({ ok: false, text: `Datei ungültig: ${(error as Error).message.slice(0, 300)}` });
              }
            }}
          >
            <Upload className="h-4 w-4" /> Einspielen
          </Button>
        </div>
        {message && <Alert tone={message.ok ? "success" : "error"}>{message.text}</Alert>}
      </CardBody>
    </Card>
  );
}

function useShippedSeed(): CourseDataset | null {
  const [seed, setSeed] = useState<CourseDataset | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(withBasePath("/golfplaetze-daten.json"), { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => !cancelled && setSeed(parseDataset(json)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return seed;
}

export function WsCourseList() {
  const { dataset, canWrite } = useAdminData();
  const seed = useShippedSeed();
  const missingSeed = useMemo(() => (seed ? missingSeedCourses(dataset, seed) : []), [seed, dataset]);
  const rows = useMemo(() => toAdminCourseRows(dataset.courses), [dataset.courses]);
  const stamp = todayIso();
  return (
    <div className="space-y-5">
      {canWrite && <SeedCard missing={missingSeed.map((c) => ({ id: c.id, name: c.name, city: c.city }))} />}
      <AdminCourseList rows={rows} />
      <div className="grid gap-5 lg:grid-cols-2">
        <CourseExportCard>
          <button type="button" className={exportLinkClass} onClick={() => downloadText(`golfplaetze-${stamp}.csv`, "﻿" + coursesToCsv(dataset.courses), "text/csv;charset=utf-8")}>
            <FileSpreadsheet className="h-4 w-4" /> CSV (Importschema)
          </button>
          <button type="button" className={exportLinkClass} onClick={() => downloadText(`golfplaetze-${stamp}.json`, JSON.stringify(dataset, null, 2), "application/json")}>
            <Download className="h-4 w-4" /> JSON (vollständig)
          </button>
          <button type="button" className={exportLinkClass} onClick={() => downloadText(`datenqualitaet-${stamp}.json`, JSON.stringify(buildQualityReport(dataset.courses, stamp), null, 2), "application/json")}>
            <Download className="h-4 w-4" /> Datenqualitätsbericht
          </button>
        </CourseExportCard>
        {canWrite && <RestoreCard />}
      </div>
    </div>
  );
}

export function WsCourseEdit() {
  const { dataset } = useAdminData();
  const id = useSearchParams().get("id") ?? "";
  const course = dataset.courses.find((c) => c.id === id);
  if (!course) {
    return (
      <Alert tone="error" title="Anlage nicht gefunden">
        <ButtonLink href="/admin/courses" size="sm" variant="secondary" className="mt-2">
          Zur Anlagenliste
        </ButtonLink>
      </Alert>
    );
  }
  return <AdminCourseEditor course={course} />;
}

export function WsNewCourse() {
  return <AdminNewCourse />;
}

export function WsImport() {
  return <AdminCsvImport />;
}

export function WsQuality() {
  const { dataset } = useAdminData();
  const report = useMemo(() => buildQualityReport(dataset.courses, todayIso()), [dataset.courses]);
  return <QualityView report={report} />;
}

export function WsDuplicates() {
  const { dataset } = useAdminData();
  const pairs = useMemo(() => toDuplicateViews(dataset.courses), [dataset.courses]);
  return <DuplicatesView pairs={pairs} />;
}

export function WsChanges() {
  const { dataset } = useAdminData();
  return <ChangesView changes={dataset.changes.slice(0, 300)} />;
}

export function WsRatings() {
  const { dataset } = useAdminData();
  const rows = useMemo(() => toRatingRows(dataset.courses), [dataset.courses]);
  return <RatingsView rows={rows} />;
}

export function WsSources() {
  const { dataset } = useAdminData();
  const rows = useMemo(() => toSourceRows(dataset.courses), [dataset.courses]);
  return <SourcesView rows={rows} />;
}
