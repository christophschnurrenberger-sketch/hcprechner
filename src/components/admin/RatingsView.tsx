"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { AdminRatingRow, AdminSourceRow } from "@/lib/courses/adminViews";
import { foldText } from "@/lib/courses/normalize";
import { adminCoursePath } from "@/lib/courses/paths";
import { genderLabel } from "@/lib/courses/tees";
import { SOURCE_TYPE_LABELS } from "@/lib/whs/messages";
import { formatDate, formatDecimal } from "@/lib/format";
import { Badge, Input, PageHeader, Select } from "@/components/ui";

const PAGE = 100;

/** Alle Ratings mit Prüfstatus, Quelle und Gültigkeit (Versionen je Abschlag bleiben erhalten). */
export function RatingsView({ rows }: { rows: AdminRatingRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | "verified" | "unverified" | "incomplete" | "inactive">("");
  const [holes, setHoles] = useState<"" | "9" | "18">("");
  const [limit, setLimit] = useState(PAGE);
  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (q && !foldText(`${r.courseName} ${r.layoutName} ${r.teeColor} ${r.teeName ?? ""}`).includes(foldText(q))) return false;
        if (holes && String(r.holes) !== holes) return false;
        if (status === "verified" && !(r.verified && r.active)) return false;
        if (status === "unverified" && (r.verified || !r.active)) return false;
        if (status === "incomplete" && r.complete) return false;
        if (status === "inactive" && r.active) return false;
        return true;
      }),
    [rows, q, status, holes],
  );
  const verified = rows.filter((r) => r.active && r.verified).length;
  const active = rows.filter((r) => r.active).length;
  return (
    <div className="space-y-4">
      <PageHeader title="Ratings" description={`${active} aktive Ratings, davon ${verified} geprüft (${active ? Math.round((verified * 100) / active) : 0} %). Ungeprüfte Werte werden Mitgliedern nicht zur Berechnung angeboten.`} />
      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Anlage, Platz, Abschlag" className="max-w-xs" aria-label="Suche" />
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="max-w-[12rem]" aria-label="Status">
          <option value="">Alle Status</option>
          <option value="verified">geprüft</option>
          <option value="unverified">nicht geprüft</option>
          <option value="incomplete">unvollständig</option>
          <option value="inactive">inaktiv</option>
        </Select>
        <Select value={holes} onChange={(e) => setHoles(e.target.value as typeof holes)} className="max-w-[9rem]" aria-label="Löcher">
          <option value="">9 und 18</option>
          <option value="18">18 Loch</option>
          <option value="9">9 Loch</option>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-ink-3">
            <tr>
              <th className="px-3 py-2 font-medium">Anlage / Platz</th>
              <th className="px-3 py-2 font-medium">Abschlag</th>
              <th className="px-3 py-2 font-medium">Löcher</th>
              <th className="px-3 py-2 text-right font-medium">Par</th>
              <th className="px-3 py-2 text-right font-medium">CR</th>
              <th className="px-3 py-2 text-right font-medium">Slope</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Quelle</th>
              <th className="px-3 py-2 font-medium">gültig</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.slice(0, limit).map((r) => (
              <tr key={r.id} className={!r.active ? "opacity-60" : undefined}>
                <td className="px-3 py-2">
                  <Link href={adminCoursePath(r.courseId)} className="font-medium text-ink hover:text-brand hover:underline">
                    {r.courseName}
                  </Link>
                  <span className="block text-xs text-ink-3">{r.layoutName}</span>
                </td>
                <td className="px-3 py-2">
                  {r.teeName ?? r.teeColor} <span className="text-xs text-ink-3">· {genderLabel(r.gender)}</span>
                </td>
                <td className="px-3 py-2">
                  {r.holes}
                  {r.nine ? <span className="text-xs text-ink-3"> ({r.nine === "FRONT" ? "1–9" : "10–18"})</span> : null}
                </td>
                <td className="tabular px-3 py-2 text-right">{r.par ?? "–"}</td>
                <td className="tabular px-3 py-2 text-right">{formatDecimal(r.courseRating)}</td>
                <td className="tabular px-3 py-2 text-right">{r.slopeRating ?? "–"}</td>
                <td className="px-3 py-2">
                  {!r.active ? <Badge>inaktiv</Badge> : !r.complete ? <Badge tone="critical">unvollständig</Badge> : r.verified ? <Badge tone="good">geprüft</Badge> : <Badge tone="warning">ungeprüft</Badge>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.sourceType ? SOURCE_TYPE_LABELS[r.sourceType] ?? r.sourceType : "–"}
                  {r.sourceUrl && (
                    <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex text-brand" aria-label="Quelle öffnen">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {r.checkedAt && <span className="block text-ink-3">geprüft {formatDate(r.checkedAt)}</span>}
                </td>
                <td className="px-3 py-2 text-xs text-ink-3">
                  {r.validFrom || r.validTo ? `${r.validFrom ? formatDate(r.validFrom) : "…"} – ${r.validTo ? formatDate(r.validTo) : "…"}` : "unbegrenzt"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-3">Keine Ratings für diese Auswahl.</p>}
      </div>
      {filtered.length > limit && (
        <button type="button" className="text-sm font-medium text-brand hover:underline" onClick={() => setLimit((l) => l + PAGE)}>
          Weitere {Math.min(PAGE, filtered.length - limit)} anzeigen ({filtered.length - limit} verbleibend)
        </button>
      )}
    </div>
  );
}

export function SourcesView({ rows }: { rows: AdminSourceRow[] }) {
  return (
    <div className="space-y-4">
      <PageHeader title="Quellen" description="Woher die Ratingdaten stammen. Nur Werte aus offiziellen Quellen (DGV, BGV, Club, Scorekarte) sollten als geprüft markiert werden." />
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-ink-3">
            <tr>
              <th className="px-3 py-2 font-medium">Quellentyp</th>
              <th className="px-3 py-2 font-medium">Website</th>
              <th className="px-3 py-2 text-right font-medium">Anlagen</th>
              <th className="px-3 py-2 text-right font-medium">Ratings</th>
              <th className="px-3 py-2 text-right font-medium">geprüft</th>
              <th className="px-3 py-2 font-medium">zuletzt geprüft</th>
              <th className="px-3 py-2 font-medium">Beispiele</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="px-3 py-2 font-medium">{r.sourceType ? SOURCE_TYPE_LABELS[r.sourceType] ?? r.sourceType : "ohne Angabe"}</td>
                <td className="px-3 py-2 text-ink-2">{r.host ?? "–"}</td>
                <td className="tabular px-3 py-2 text-right">{r.courses}</td>
                <td className="tabular px-3 py-2 text-right">{r.ratings}</td>
                <td className="tabular px-3 py-2 text-right">
                  {r.verified} <span className="text-xs text-ink-3">({Math.round((r.verified * 100) / r.ratings)} %)</span>
                </td>
                <td className="px-3 py-2 text-ink-2">{formatDate(r.lastChecked)}</td>
                <td className="px-3 py-2 text-xs text-ink-3">{r.examples.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-3">Noch keine Ratings vorhanden.</p>}
      </div>
    </div>
  );
}
