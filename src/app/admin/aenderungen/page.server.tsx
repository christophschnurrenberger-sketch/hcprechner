import { requireAdminPage } from "@/server/adminAuth";
import { recentChanges } from "@/server/courseRepository";
import { ChangesView } from "@/components/admin/ChangesView";

export default async function ChangesPage() {
  await requireAdminPage();
  const changes = await recentChanges(300);
  return (
    <ChangesView
      changes={changes.map((c) => ({
        id: String(c.id),
        entityType: c.entityType,
        entityId: c.entityId,
        action: c.action,
        source: c.source,
        changes: c.changes,
        createdAt: c.createdAt.toISOString(),
      }))}
    />
  );
}
