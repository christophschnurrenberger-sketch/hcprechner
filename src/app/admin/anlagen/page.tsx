import Link from "next/link";
import { Plus } from "lucide-react";
import { requireAdminPage } from "@/server/adminAuth";
import { loadAllCourses } from "@/server/courseRepository";
import { foldText } from "@/lib/courses/normalize";
import { regionByKey } from "@/lib/courses/regions";
import { courseHasVerifiedRating } from "@/lib/courses/ratingSelection";
import { Badge, ButtonLink, Input, PageHeader } from "@/components/ui";

export default async function AdminCoursesPage(props: PageProps<"/admin/anlagen">) {
  await requireAdminPage();
  const params = await props.searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const filter = typeof params.filter === "string" ? params.filter : "";
  const all = await loadAllCourses({ includeInactive: true });
  const courses = all.filter((c) => {
    if (q && !foldText([c.name, c.officialName, c.city, c.postalCode].filter(Boolean).join(" ")).includes(foldText(q))) return false;
    if (filter === "no-rating" && courseHasVerifiedRating(c)) return false;
    if (filter === "unverified" && c.verified) return false;
    if (filter === "inactive" && c.active) return false;
    return true;
  });
  return (
    <>
      <PageHeader
        title="Anlagen"
        description={`${courses.length} von ${all.length} Einträgen`}
        actions={
          <ButtonLink href="/admin/anlagen/neu" size="sm">
            <Plus className="h-4 w-4" /> Anlage anlegen
          </ButtonLink>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <Input name="q" defaultValue={q} placeholder="Name, Ort, PLZ" className="max-w-xs" />
        <select name="filter" defaultValue={filter} className="h-10 rounded-lg border border-border-strong bg-surface px-3 text-sm">
          <option value="">alle</option>
          <option value="no-rating">ohne verifiziertes Rating</option>
          <option value="unverified">Stammdaten nicht verifiziert</option>
          <option value="inactive">inaktiv</option>
        </select>
        <button type="submit" className="h-10 rounded-lg border border-border-strong px-4 text-sm font-medium hover:bg-surface-2">
          Filtern
        </button>
      </form>
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
            {courses.map((c) => {
              const sets = c.layouts.flatMap((l) => l.ratingSets.filter((s) => s.active));
              return (
                <tr key={c.id} className="border-t border-border hover:bg-surface-2">
                  <td className="px-3 py-2">
                    <Link href={`/admin/anlagen/${c.id}`} className="font-medium text-ink hover:text-brand hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-ink-2">{[c.postalCode, c.city].filter(Boolean).join(" ")}</td>
                  <td className="px-3 py-2 text-ink-2">{regionByKey(c.region)?.label ?? "–"}</td>
                  <td className="px-3 py-2 text-xs text-ink-3">{c.facilityType}</td>
                  <td className="tabular px-3 py-2 text-right">{c.layouts.length}</td>
                  <td className="tabular px-3 py-2 text-right">
                    {sets.length} ({sets.filter((s) => s.verified).length})
                  </td>
                  <td className="space-x-1 px-3 py-2">
                    {!c.active && <Badge>inaktiv</Badge>}
                    {c.verified ? <Badge tone="good">Stammdaten geprüft</Badge> : <Badge tone="warning">ungeprüft</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {courses.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-3">Keine Anlagen.</p>}
      </div>
    </>
  );
}
