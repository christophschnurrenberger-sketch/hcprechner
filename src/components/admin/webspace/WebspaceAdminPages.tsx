"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, KeyRound, Upload } from "lucide-react";
import { adminApi } from "@/lib/courses/adminApi";
import { toAdminCourseRows, toDuplicateViews } from "@/lib/courses/adminViews";
import { coursesToCsv } from "@/lib/courses/csv";
import { datasetFromImport, missingSeedCourses, parseDataset, recordImportRun, type CourseDataset } from "@/lib/courses/dataset";
import { withBasePath } from "@/lib/runtime";
import { buildQualityReport } from "@/lib/courses/quality";
import { downloadText } from "@/lib/export/download";
import { todayIso } from "@/lib/whs/dates";
import { Alert, Button, ButtonLink, Card, CardBody, CardHeader, Field, Input } from "@/components/ui";
import { AdminCourseEditor, AdminCsvImport, AdminNewCourse } from "../AdminCourseEditor";
import { AdminCourseList } from "../AdminCourseList";
import { AdminDashboardView, exportLinkClass } from "../AdminDashboardView";
import { ChangesView } from "../ChangesView";
import { DuplicatesView } from "../DuplicatesView";
import { QualityView } from "../QualityView";
import { UsersView } from "../UsersView";
import { SeedCard } from "../SeedCard";
import { useAdminData } from "./WebspaceAdminShell";

function PasswordCard() {
  const { csrf } = useAdminData();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <Card>
      <CardHeader title="Admin-Passwort ändern" />
      <CardBody>
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const next = String(fd.get("next") ?? "");
            if (next !== String(fd.get("repeat") ?? "")) return setMessage({ ok: false, text: "Die neuen Passwörter stimmen nicht überein." });
            setPending(true);
            try {
              await adminApi.changePassword(csrf, String(fd.get("current") ?? ""), next);
              form.reset();
              setMessage({ ok: true, text: "Passwort geändert." });
            } catch (error) {
              setMessage({ ok: false, text: (error as Error).message });
            } finally {
              setPending(false);
            }
          }}
        >
          <Field label="Aktuelles Passwort" htmlFor="pw-cur">
            <Input id="pw-cur" name="current" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="Neues Passwort" htmlFor="pw-new" hint="mindestens 8 Zeichen">
            <Input id="pw-new" name="next" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Wiederholen" htmlFor="pw-rep">
            <Input id="pw-rep" name="repeat" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" variant="secondary" disabled={pending}>
              <KeyRound className="h-4 w-4" /> Passwort ändern
            </Button>
            {message && <span className={message.ok ? "text-sm text-good" : "text-sm text-critical"}>{message.text}</span>}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function RestoreCard() {
  const { dataset, replaceDataset } = useAdminData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <Card>
      <CardHeader
        title="Datensatz einspielen"
        subtitle="JSON-Export dieser Installation (Sicherung) oder JSON-Export der Node-Edition. Ersetzt alle Golfplatzdaten."
      />
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

export function WsDashboard() {
  const { dataset, role } = useAdminData();
  const seed = useShippedSeed();
  const missingSeed = useMemo(() => (seed ? missingSeedCourses(dataset, seed) : []), [seed, dataset]);
  const report = useMemo(() => buildQualityReport(dataset.courses, todayIso()), [dataset.courses]);
  const stamp = todayIso();
  return (
    <div className="space-y-5">
      <SeedCard missing={missingSeed.map((c) => ({ id: c.id, name: c.name, city: c.city }))} />
      <AdminDashboardView
        report={report}
        runs={dataset.importRuns.slice(0, 5)}
        changes={dataset.changes.slice(0, 8)}
        storage={`JSON-Datei auf dem Webspace · Version ${dataset.revision}${dataset.updatedAt ? `, ${new Date(dataset.updatedAt).toLocaleString("de-DE")}` : ""}`}
        emptyHint={
          <>
            Legen Sie Anlagen über „Anlage anlegen“ an oder importieren Sie verifizierte Ratingdaten per CSV-Import (Vorlage im Import-Bereich). Ein
            JSON-Export der Node-Edition kann unten eingespielt werden. CR- und Slope-Werte nur aus offiziellen Quellen übernehmen – nie schätzen.
          </>
        }
        exportSlot={
          <>
            <button type="button" className={exportLinkClass} onClick={() => downloadText(`golfplaetze-${stamp}.csv`, "﻿" + coursesToCsv(dataset.courses), "text/csv;charset=utf-8")}>
              <FileSpreadsheet className="h-4 w-4" /> CSV (Importschema)
            </button>
            <button type="button" className={exportLinkClass} onClick={() => downloadText(`golfplaetze-${stamp}.json`, JSON.stringify(dataset, null, 2), "application/json")}>
              <Download className="h-4 w-4" /> JSON (vollständig)
            </button>
            <button type="button" className={exportLinkClass} onClick={() => downloadText(`datenqualitaet-${stamp}.json`, JSON.stringify(report, null, 2), "application/json")}>
              <Download className="h-4 w-4" /> Datenqualitätsbericht
            </button>
          </>
        }
      />
      {role === "owner" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <RestoreCard />
          <PasswordCard />
        </div>
      )}
    </div>
  );
}

export function WsCourseList() {
  const { dataset } = useAdminData();
  const rows = useMemo(() => toAdminCourseRows(dataset.courses), [dataset.courses]);
  return <AdminCourseList rows={rows} />;
}

export function WsCourseEdit() {
  const { dataset } = useAdminData();
  const id = useSearchParams().get("id") ?? "";
  const course = dataset.courses.find((c) => c.id === id);
  if (!course) {
    return (
      <Alert tone="error" title="Anlage nicht gefunden">
        <ButtonLink href="/admin/anlagen" size="sm" variant="secondary" className="mt-2">
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

export function WsUsers() {
  const { users, role, reloadUsers } = useAdminData();
  useEffect(() => {
    void reloadUsers();
  }, [reloadUsers]);
  if (role !== "owner") {
    return <Alert tone="warning">Die Benutzerverwaltung ist nur mit dem Haupt-Passwort des Admin-Bereichs möglich.</Alert>;
  }
  return <UsersView users={users} />;
}
