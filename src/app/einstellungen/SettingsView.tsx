"use client";

import { useMemo, useRef, useState } from "react";
import { Cloud, Download, FileJson, FileSpreadsheet, FileText, Trash2, Upload } from "lucide-react";
import { listRuleSets } from "@/rules/whs/registry";
import { calculateScoringRecord } from "@/lib/whs/scoringRecord";
import { issueText } from "@/lib/whs/messages";
import { formatDate, formatDecimal, formatHcp } from "@/lib/format";
import { newId, parseImport, toExport } from "@/lib/store/localStore";
import { parseRoundsCsv, roundsCsvTemplate, roundsToCsv, type RoundCsvRow } from "@/lib/export/roundsCsv";
import { downloadText } from "@/lib/export/download";
import { parseDecimal } from "@/lib/courses/csv";
import { useHcp } from "@/components/providers/HcpStoreProvider";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, Dialog, Field, Input, PageHeader, Segmented, Select } from "@/components/ui";
import { syncCreate, syncDelete, syncPull, syncPush } from "@/lib/sync/client";
import { LoadingState } from "@/components/dashboard/DashboardView";

function ProfileSection() {
  const { profile, updateProfile, result } = useHcp();
  const [start, setStart] = useState(String(profile.startHandicapIndex).replace(".", ","));
  const parsed = parseDecimal(start);
  const valid = parsed !== null && !Number.isNaN(parsed) && parsed >= -10 && parsed <= 54;
  return (
    <Card>
      <CardHeader title="Spielerprofil" subtitle="Nur lokal gespeichert. Es werden keine personenbezogenen Daten benötigt." />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <Field label="Anzeigename (optional)" htmlFor="p-name" hint="Erscheint nur im PDF-Export.">
          <Input id="p-name" value={profile.displayName ?? ""} onChange={(e) => updateProfile({ displayName: e.target.value || undefined })} />
        </Field>
        <Field label="Geschlecht (Standard für Ratings)">
          <Segmented
            name="Geschlecht"
            value={profile.gender}
            onChange={(g) => updateProfile({ gender: g })}
            options={[
              { value: "M", label: "Herren" },
              { value: "F", label: "Damen" },
            ]}
          />
        </Field>
        <Field
          label="Start-HCPI"
          htmlFor="p-start"
          error={!valid ? "Wert zwischen +10 (−10) und 54,0" : undefined}
          hint="Handicap Index vor der ersten erfassten Runde (Neugolfer: 54,0). Gilt, solange weniger als 3 Ergebnisse vorliegen."
          info="Der Start-HCPI ist Ausgangspunkt der chronologischen Rekonstruktion: Er bestimmt Course Handicap, Netto-Doppelbogey, das erwartete 9-Loch-Differential und die ESR-Prüfung der ersten Runden."
        >
          <div className="flex gap-2">
            <Input id="p-start" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} className="max-w-32" />
            <Button variant="secondary" disabled={!valid || parsed === profile.startHandicapIndex} onClick={() => valid && updateProfile({ startHandicapIndex: parsed! })}>
              Übernehmen
            </Button>
          </div>
        </Field>
        <Field label="Start-HCPI gültig ab (optional)" htmlFor="p-startdate" hint="Wichtig für den Low Handicap Index (365-Tage-Zeitraum).">
          <Input id="p-startdate" type="date" value={profile.startDate ?? ""} onChange={(e) => updateProfile({ startDate: e.target.value || null })} />
        </Field>
        <div className="sm:col-span-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2">
          Aktueller HCPI laut Berechnung: <strong className="tabular">{formatHcp(result.status.currentHandicapIndex)}</strong>
        </div>
      </CardBody>
    </Card>
  );
}

function BrakeSection() {
  const { profile, updateProfile } = useHcp();
  const lifted = Boolean(profile.brake265LiftedAt);
  return (
    <Card>
      <CardHeader title="26,5-Bremse" subtitle="Deutsche Besonderheit im Bereich 54,0 bis 26,5" />
      <CardBody className="space-y-3">
        <p className="text-sm text-ink-2">
          Zwischen HCPI 54,0 und 26,5 werden nur Verbesserungen automatisch wirksam. Liegt der HCPI darunter, erfolgt eine Heraufsetzung
          höchstens bis 26,5. Auf Antrag kann die Bremse dauerhaft aufgehoben werden – dann gilt der kalkulierte HCPI (nach Cap-Verfahren).
        </p>
        <Checkbox
          checked={lifted}
          onChange={(v) => updateProfile({ brake265LiftedAt: v ? new Date().toISOString().slice(0, 10) : null })}
          label="Die 26,5-Bremse wurde für mich dauerhaft aufgehoben"
        />
        {lifted && (
          <Field label="Aufgehoben ab" htmlFor="p-brake" hint="Ab diesem Tag gilt der kalkulierte HCPI; frühere Runden werden weiter mit Bremse berechnet.">
            <Input id="p-brake" type="date" className="max-w-48" value={profile.brake265LiftedAt ?? ""} onChange={(e) => updateProfile({ brake265LiftedAt: e.target.value || null })} />
          </Field>
        )}
        <Badge tone={lifted ? "neutral" : "brand"}>{lifted ? "26,5-Bremse nicht aktiv" : "26,5-Bremse aktiv"}</Badge>
      </CardBody>
    </Card>
  );
}

function RulesSection() {
  const { profile, updateProfile, settings, updateSettings } = useHcp();
  const sets = listRuleSets();
  return (
    <Card>
      <CardHeader title="Regelwerk & Darstellung" />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <Field label="Handicap-Regelwerk" hint="Neue Regelversionen (2027 …) werden als eigene Regelsets ergänzt.">
          <Select
            value={`${profile.ruleSet.country}-${profile.ruleSet.version}`}
            onChange={(e) => {
              const [country, version] = e.target.value.split("-");
              updateProfile({ ruleSet: { country, version } });
            }}
          >
            {sets.map((s) => (
              <option key={s.id} value={`${s.country}-${s.version}`}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Farbschema">
          <Segmented
            name="Farbschema"
            value={settings.theme}
            onChange={(t) => updateSettings({ theme: t })}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Hell" },
              { value: "dark", label: "Dunkel" },
            ]}
          />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox
            checked={settings.debugMode}
            onChange={(v) => updateSettings({ debugMode: v })}
            label="Debug-Modus"
            description="Zeigt in jeder Runde das technische Debug-Objekt (Start-HCPI, CR, Slope, PCC, GBE, SD, ESR, Low HCPI, Cap-/Bremsen-Anpassungen)."
          />
        </div>
      </CardBody>
    </Card>
  );
}

function DataSection() {
  const { data, profile, rounds, result, replaceAll, resetAll, loadExampleData, removeExampleData, hasExampleData } = useHcp();
  const jsonRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [csvRows, setCsvRows] = useState<{ rows: RoundCsvRow[]; missing: string[] } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const stamp = new Date().toISOString().slice(0, 10);

  const csvPreview = useMemo(() => {
    if (!csvRows) return null;
    const imported = csvRows.rows.map((r) => r.round).filter((r): r is NonNullable<typeof r> => r !== null);
    const preview = calculateScoringRecord(profile, [...rounds, ...imported]);
    return { imported, byId: new Map(preview.rounds.map((r) => [r.roundId, r])) };
  }, [csvRows, profile, rounds]);

  return (
    <Card>
      <CardHeader title="Daten exportieren & importieren" subtitle="Ihre Daten gehören Ihnen – als CSV, JSON oder PDF." />
      <CardBody className="space-y-5">
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => downloadText(`hcp-runden-${stamp}.csv`, roundsToCsv(rounds, result), "text/csv;charset=utf-8")}>
            <FileSpreadsheet className="h-4 w-4" /> CSV
          </Button>
          <Button variant="secondary" onClick={() => downloadText(`hcp-daten-${stamp}.json`, JSON.stringify(toExport(data), null, 2), "application/json")}>
            <FileJson className="h-4 w-4" /> JSON
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              const { exportPdf } = await import("@/lib/export/pdf");
              exportPdf(profile, rounds, result);
            }}
          >
            <FileText className="h-4 w-4" /> PDF
          </Button>
        </div>

        <div className="grid gap-4 border-t border-border pt-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-semibold">JSON-Sicherung wiederherstellen</p>
            <p className="text-xs text-ink-3">Ersetzt Profil und alle Runden durch den Inhalt der Datei.</p>
            <input
              ref={jsonRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const parsed = parseImport(await file.text());
                if (parsed.ok) {
                  replaceAll(parsed.data);
                  setMessage({ tone: "success", text: `${parsed.data.rounds.length} Runden importiert.` });
                } else setMessage({ tone: "error", text: parsed.error });
                e.target.value = "";
              }}
            />
            <Button variant="secondary" size="sm" onClick={() => jsonRef.current?.click()}>
              <Upload className="h-4 w-4" /> JSON importieren
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Bestehende Runden aus CSV importieren</p>
            <p className="text-xs text-ink-3">Spalten: Datum, Turnier, Golfplatz, Tee, Löcher, GBE, CR, Slope, PCC (optional: Par, Geschlecht, Rundentyp, Score Differential).</p>
            <input
              ref={csvRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setCsvRows(parseRoundsCsv(await file.text(), newId, profile.gender));
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => csvRef.current?.click()}>
                <Upload className="h-4 w-4" /> CSV auswählen
              </Button>
              <Button variant="ghost" size="sm" onClick={() => downloadText("runden-import-vorlage.csv", roundsCsvTemplate(), "text/csv;charset=utf-8")}>
                <Download className="h-4 w-4" /> Vorlage
              </Button>
            </div>
          </div>
        </div>

        {csvRows && csvPreview && (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <p className="text-sm font-semibold">Vorschau: {csvRows.rows.length} Zeilen</p>
            {csvRows.missing.length > 0 && <Alert tone="error">Fehlende Spalten: {csvRows.missing.join(", ")}</Alert>}
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="tabular w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 text-left text-ink-3">
                  <tr>
                    <th className="px-2 py-1.5">Zeile</th>
                    <th className="px-2 py-1.5">Datum</th>
                    <th className="px-2 py-1.5">Runde</th>
                    <th className="px-2 py-1.5">Golfplatz</th>
                    <th className="px-2 py-1.5 text-right">SD</th>
                    <th className="px-2 py-1.5 text-right">HCPI danach</th>
                    <th className="px-2 py-1.5">Hinweise</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.rows.map((row) => {
                    const r = row.round ? csvPreview.byId.get(row.round.id) : null;
                    const notes = [...row.errors, ...row.warnings, ...(r?.issues.map(issueText) ?? [])];
                    return (
                      <tr key={row.rowNumber} className="border-t border-border align-top">
                        <td className="px-2 py-1.5">{row.rowNumber}</td>
                        <td className="px-2 py-1.5">{row.round ? formatDate(row.round.date) : "–"}</td>
                        <td className="px-2 py-1.5">{row.round?.title ?? "–"}</td>
                        <td className="px-2 py-1.5">{row.round?.course.courseName ?? "–"}</td>
                        <td className="px-2 py-1.5 text-right">{formatDecimal(r?.scoreDifferential?.value)}</td>
                        <td className="px-2 py-1.5 text-right">{formatHcp(r?.revision?.currentHandicapIndex)}</td>
                        <td className={row.errors.length ? "px-2 py-1.5 text-critical" : "px-2 py-1.5 text-ink-3"}>{notes.join(" · ") || "ok"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button
                disabled={csvPreview.imported.length === 0}
                onClick={() => {
                  replaceAll({ ...data, rounds: [...rounds, ...csvPreview.imported] });
                  setMessage({ tone: "success", text: `${csvPreview.imported.length} Runden importiert. SD und HCPI wurden berechnet.` });
                  setCsvRows(null);
                }}
              >
                {csvPreview.imported.length} gültige Runden importieren
              </Button>
              <Button variant="secondary" onClick={() => setCsvRows(null)}>
                Abbrechen
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {hasExampleData ? (
            <Button variant="secondary" size="sm" onClick={removeExampleData}>
              Beispieldaten entfernen
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={loadExampleData}>
              Beispieldaten laden
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-critical" onClick={() => setConfirmReset(true)}>
            <Trash2 className="h-4 w-4" /> Alle lokalen Daten löschen
          </Button>
        </div>
        <Dialog
          open={confirmReset}
          onClose={() => setConfirmReset(false)}
          title="Alle Daten löschen?"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmReset(false)}>
                Abbrechen
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  resetAll();
                  setConfirmReset(false);
                }}
              >
                Endgültig löschen
              </Button>
            </>
          }
        >
          Profil und alle {rounds.length} Runden werden aus diesem Browser entfernt. Erstellen Sie vorher einen JSON-Export.
        </Dialog>
      </CardBody>
    </Card>
  );
}

function SyncSection() {
  const { data, settings, updateSettings, replaceAll } = useHcp();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [connectId, setConnectId] = useState("");
  const [connectKey, setConnectKey] = useState("");
  const sync = settings.sync;

  const call = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const payload = () => ({ profile: data.profile, rounds: data.rounds });

  return (
    <Card>
      <CardHeader title="Synchronisation (optional)" subtitle="Anonymes Profil auf dem Server – nur mit Ihrem geheimen Schlüssel erreichbar." />
      <CardBody className="space-y-3">
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        {!sync ? (
          <>
            <p className="text-sm text-ink-2">
              Standardmäßig bleiben alle Daten im Browser (Local Mode). Mit der Synchronisation können Sie Ihre Runden auf einem weiteren Gerät
              nutzen. Es werden weder E-Mail noch Name benötigt.
            </p>
            <Button
              disabled={busy}
              onClick={() =>
                call(async () => {
                  const created = await syncCreate(payload());
                  updateSettings({ sync: { profileId: created.profileId, key: created.key, lastSyncAt: new Date().toISOString() } });
                  setMessage({ tone: "success", text: "Synchronisation eingerichtet. Notieren Sie Profil-ID und Schlüssel für weitere Geräte." });
                })
              }
            >
              <Cloud className="h-4 w-4" /> Synchronisation einrichten
            </Button>
            <details className="rounded-lg border border-border p-3 text-sm">
              <summary className="cursor-pointer font-medium">Mit bestehendem Profil verbinden</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Profil-ID" htmlFor="s-id">
                  <Input id="s-id" value={connectId} onChange={(e) => setConnectId(e.target.value.trim())} />
                </Field>
                <Field label="Schlüssel" htmlFor="s-key">
                  <Input id="s-key" value={connectKey} onChange={(e) => setConnectKey(e.target.value.trim())} />
                </Field>
              </div>
              <Button
                className="mt-3"
                variant="secondary"
                disabled={busy || !connectId || !connectKey}
                onClick={() =>
                  call(async () => {
                    const json = await syncPull({ profileId: connectId, key: connectKey });
                    replaceAll({ ...data, profile: json.profile, rounds: json.rounds, settings: { ...data.settings, sync: { profileId: connectId, key: connectKey, lastSyncAt: new Date().toISOString() } } });
                    setMessage({ tone: "success", text: `${json.rounds.length} Runden vom Server geladen.` });
                  })
                }
              >
                Verbinden und Daten laden
              </Button>
            </details>
          </>
        ) : (
          <>
            <div className="rounded-lg bg-surface-2 p-3 text-xs">
              <p>
                Profil-ID: <code className="break-all">{sync.profileId}</code>
              </p>
              <p className="mt-1">
                Schlüssel: <code className="break-all">{sync.key}</code>
              </p>
              <p className="mt-1 text-ink-3">Letzte Synchronisation: {sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleString("de-DE") : "–"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                onClick={() =>
                  call(async () => {
                    await syncPush(sync, payload());
                    updateSettings({ sync: { ...sync, lastSyncAt: new Date().toISOString() } });
                    setMessage({ tone: "success", text: "Daten hochgeladen." });
                  })
                }
              >
                Hochladen
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  call(async () => {
                    const json = await syncPull(sync);
                    replaceAll({ ...data, profile: json.profile, rounds: json.rounds, settings: { ...data.settings, sync: { ...sync, lastSyncAt: new Date().toISOString() } } });
                    setMessage({ tone: "success", text: `${json.rounds.length} Runden vom Server geladen (lokale Daten ersetzt).` });
                  })
                }
              >
                Vom Server laden
              </Button>
              <Button variant="ghost" onClick={() => updateSettings({ sync: null })}>
                Trennen (lokal)
              </Button>
              <Button
                variant="ghost"
                className="text-critical"
                disabled={busy}
                onClick={() =>
                  call(async () => {
                    await syncDelete(sync);
                    updateSettings({ sync: null });
                    setMessage({ tone: "info", text: "Serverprofil gelöscht." });
                  })
                }
              >
                Serverprofil löschen
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

export function SettingsView() {
  const { ready, storageOk } = useHcp();
  if (!ready) return <LoadingState />;
  return (
    <>
      <PageHeader title="Einstellungen" description="Profil, Regelwerk, 26,5-Bremse, Export und optionale Synchronisation." />
      {!storageOk && (
        <Alert tone="error" className="mb-4" title="Speichern im Browser nicht möglich">
          Der Browser-Speicher ist blockiert oder voll (z. B. privater Modus). Bitte Daten exportieren.
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ProfileSection />
        <BrakeSection />
        <RulesSection />
        <SyncSection />
        <div className="lg:col-span-2">
          <DataSection />
        </div>
      </div>
    </>
  );
}
