"use client";

import { useActionState } from "react";
import { PackagePlus } from "lucide-react";
import { initialActionState } from "@/lib/courses/adminForm";
import { Alert, Button, Card, CardBody, CardHeader } from "@/components/ui";
import { useAdminBackend } from "./AdminBackend";

export interface SeedCourseInfo {
  id: string;
  name: string;
  city: string | null;
}

/** Mitgelieferte Golfplatzdaten übernehmen (nur fehlende Anlagen; Bearbeitetes bleibt unverändert). */
export function SeedCard({ missing }: { missing: SeedCourseInfo[] }) {
  const { importSeed } = useAdminBackend();
  const [state, action, pending] = useActionState(importSeed, initialActionState);
  if (missing.length === 0 && !state.message) return null;
  return (
    <Card>
      <CardHeader title="Mitgelieferte Golfplatzdaten" subtitle="Mit dieser Version ausgelieferte Anlagen, die in Ihrer Datenbank noch fehlen." />
      <CardBody className="space-y-3 text-sm">
        {missing.length > 0 && (
          <>
            <ul className="list-disc pl-5 text-ink-2">
              {missing.map((c) => (
                <li key={c.id}>
                  {c.name}
                  {c.city ? ` (${c.city})` : ""}
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-3">
              Ratings aus den Startdaten sind als „nicht verifiziert“ markiert, sofern sie nicht direkt gegen die offizielle Quelle geprüft
              wurden. Bitte nach der Übernahme mit der Scorekarte abgleichen und verifizieren.
            </p>
            <form action={action}>
              <Button type="submit" size="sm" disabled={pending}>
                <PackagePlus className="h-4 w-4" /> {missing.length === 1 ? "Anlage übernehmen" : `${missing.length} Anlagen übernehmen`}
              </Button>
            </form>
          </>
        )}
        {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      </CardBody>
    </Card>
  );
}
