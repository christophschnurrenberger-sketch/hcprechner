"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { AdminCourseRow } from "@/lib/courses/adminViews";
import { foldText } from "@/lib/courses/normalize";
import { adminCoursePath } from "@/lib/courses/paths";
import { regionByKey } from "@/lib/courses/regions";
import { Badge, ButtonLink, Input, PageHeader, Select } from "@/components/ui";

type Filter = "" | "no-rating" | "unverified" | "inactive";

export function AdminCourseList({ rows }: { rows: AdminCourseRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("");
  const courses = useMemo(
    () =>
      rows.filter((c) => {
        if (q && !foldText([c.name, c.officialName, c.city, c.postalCode].filter(Boolean).join(" ")).includes(foldText(q))) return false;
        if (filter === "no-rating" && c.hasVerifiedRating) return false;
        if (filter === "unverified" && c.verified) return false;
        if (filter === "inactive" && c.active) return false;
        return true;
      }),
    [rows, q, filter],
  );
  return (
    <>
      <PageHeader
        title="Anlagen"
        description={`${courses.length} von ${rows.length} Einträgen`}
        actions={
          <ButtonLink href="/admin/anlagen/neu" size="sm">
            <Plus className="h-4 w-4" /> Anlage anlegen
          </ButtonLink>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, Ort, PLZ" className="max-w-xs" aria-label="Suche" />
        <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="w-auto" aria-label="Filter">
          <option value="">alle</option>
          <option value="no-rating">ohne verifiziertes Rating</option>
          <option value="unverified">Stammdaten nicht verifiziert</option>
          <option value="inactive">inaktiv</option>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-surface-2 text-left text-xs text-ink-3">
            <tr>
              <th className="px-3 py-2 font-medium">Anlage</th>
              <th className="px-3 py-2 font-medium">Ort</th>
              <th className="px-3 py-2 font-medium">Region</th>
              <th className="px-3 py-2 font-medium">Typ</th>
              <th className="px-3 py-2 text-right font-medium">Plätze</th>
              <th className="px-3 py-2 text-right font-medium">Ratings (verif.)</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className="border-t border-border hover:bg-surface-2">
                <td className="px-3 py-2">
                  <Link href={adminCoursePath(c.id)} className="font-medium text-ink hover:text-brand hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-ink-2">{[c.postalCode, c.city].filter(Boolean).join(" ")}</td>
                <td className="px-3 py-2 text-ink-2">{regionByKey(c.region)?.label ?? "–"}</td>
                <td className="px-3 py-2 text-xs text-ink-3">{c.facilityType}</td>
                <td className="tabular px-3 py-2 text-right">{c.layouts}</td>
                <td className="tabular px-3 py-2 text-right">
                  {c.ratings} ({c.verifiedRatings})
                </td>
                <td className="space-x-1 px-3 py-2">
                  {!c.active && <Badge>inaktiv</Badge>}
                  {c.verified ? <Badge tone="good">Stammdaten geprüft</Badge> : <Badge tone="warning">ungeprüft</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {courses.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-3">Keine Anlagen.</p>}
      </div>
    </>
  );
}
