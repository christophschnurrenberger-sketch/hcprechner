import type { ChangeView } from "@/lib/courses/adminViews";
import { PageHeader } from "@/components/ui";

export function ChangesView({ changes }: { changes: ChangeView[] }) {
  return (
    <>
      <PageHeader title="Änderungsprotokoll" description="Jede Änderung an Anlagen, Plätzen, Ratings und Lochdaten – aus Admin, CSV-Import und Importer." />
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs text-ink-3">
            <tr>
              <th className="px-3 py-2 font-medium">Zeitpunkt</th>
              <th className="px-3 py-2 font-medium">Objekt</th>
              <th className="px-3 py-2 font-medium">Aktion</th>
              <th className="px-3 py-2 font-medium">Quelle</th>
              <th className="px-3 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((c) => (
              <tr key={c.id} className="border-t border-border align-top">
                <td className="whitespace-nowrap px-3 py-1.5 text-xs">{new Date(c.createdAt).toLocaleString("de-DE")}</td>
                <td className="px-3 py-1.5 text-xs">
                  {c.entityType}
                  <br />
                  <code className="text-ink-3">{c.entityId?.slice(0, 8)}</code>
                </td>
                <td className="px-3 py-1.5">{c.action}</td>
                <td className="px-3 py-1.5 text-xs">{c.source}</td>
                <td className="max-w-xl px-3 py-1.5">
                  {c.changes ? <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-ink-2">{JSON.stringify(c.changes, null, 1)}</pre> : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {changes.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-3">Noch keine Änderungen.</p>}
      </div>
    </>
  );
}
