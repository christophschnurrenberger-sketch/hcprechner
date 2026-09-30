"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ActionState, CsvPreviewState, GreenCsvPreviewState } from "@/lib/courses/adminForm";

/**
 * Schreibende Operationen der Golfplatzpflege. Node-Edition: Server Actions (src/app/admin/actions.ts).
 * Webspace-Edition: Operationen auf dem JSON-Datensatz + Veröffentlichung über api/admin.php (courses-save).
 * Berechtigt ist nur, wer serverseitig die Rechte courses.write bzw. import besitzt.
 * Alle Formulare des Admin-Bereichs nutzen ausschließlich diese Schnittstelle.
 */
export interface AdminBackend {
  saveCourse: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  saveLayout: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  saveRatingSet: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  saveHoles: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  /** GPS-Grünkoordinaten eines Platzes (Front/Mitte/Back je Loch) */
  saveGreens: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  toggleRatingActive: (fd: FormData) => Promise<void>;
  verifyRating: (fd: FormData) => Promise<void>;
  mergeCourses: (fd: FormData) => Promise<void>;
  previewCsv: (prev: CsvPreviewState, fd: FormData) => Promise<CsvPreviewState>;
  applyCsv: (prev: CsvPreviewState, fd: FormData) => Promise<CsvPreviewState>;
  /** GPS-CSV: Vorschau und Übernahme (nur Grünkoordinaten) */
  previewGreenCsv: (prev: GreenCsvPreviewState, fd: FormData) => Promise<GreenCsvPreviewState>;
  applyGreenCsv: (prev: GreenCsvPreviewState, fd: FormData) => Promise<GreenCsvPreviewState>;
  /** Mitgelieferte Golfplatz-Startdaten übernehmen (nur fehlende Anlagen). */
  importSeed: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}

const AdminBackendContext = createContext<AdminBackend | null>(null);

export function AdminBackendProvider({ backend, children }: { backend: AdminBackend; children: ReactNode }) {
  return <AdminBackendContext.Provider value={backend}>{children}</AdminBackendContext.Provider>;
}

export function useAdminBackend(): AdminBackend {
  const ctx = useContext(AdminBackendContext);
  if (!ctx) throw new Error("useAdminBackend außerhalb von AdminBackendProvider");
  return ctx;
}
