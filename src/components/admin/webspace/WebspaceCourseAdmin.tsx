"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { planCsvImport } from "@/lib/courses/csv";
import { planGreenCsvImport } from "@/lib/courses/greenCsv";
import { actionFailure, actionOk, csvTextFromForm, formToObject, parseGreensForm, parseHolesForm } from "@/lib/courses/adminForm";
import { courseAdminApi } from "@/lib/courses/adminApi";
import { invalidateCourseDataset } from "@/lib/courses/client";
import {
  applyCsvPlan,
  applyGreenCsvPlan,
  createCourse,
  createLayout,
  createRatingSet,
  mergeCourses,
  mergeSeedCourses,
  parseDataset,
  replaceHoles,
  setGreenCoordinates,
  setRatingSetActive,
  setRatingSetVerified,
  updateCourse,
  updateLayout,
  updateRatingSet,
  type CourseDataset,
  type OperationContext,
} from "@/lib/courses/dataset";
import { adminCoursePath } from "@/lib/courses/paths";
import { ApiError, userMessage } from "@/lib/api/errors";
import { withBasePath } from "@/lib/runtime";
import { Alert } from "@/components/ui";
import { ErrorState, PageSkeleton } from "@/components/ui/feedback";
import { useSession } from "@/components/session/SessionProvider";
import { AdminBackendProvider, type AdminBackend } from "../AdminBackend";

interface CourseAdminData {
  dataset: CourseDataset;
  saving: boolean;
  /** Darf der angemeldete Benutzer Golfplätze bearbeiten? (Anzeige; geprüft wird in api/admin.php) */
  canWrite: boolean;
  /** Ersetzt den kompletten Datensatz (Wiederherstellung) und veröffentlicht ihn. */
  replaceDataset: (next: CourseDataset) => Promise<void>;
}

const CourseAdminContext = createContext<CourseAdminData | null>(null);

export function useAdminData(): CourseAdminData {
  const ctx = useContext(CourseAdminContext);
  if (!ctx) throw new Error("useAdminData außerhalb von WebspaceCourseAdmin");
  return ctx;
}

type Commit = <T>(mutate: (ds: CourseDataset) => { dataset: CourseDataset; value: T }) => Promise<T>;

function createBackend(commit: Commit, current: () => CourseDataset, notify: (text: string) => void, actor: string): AdminBackend {
  const ops: OperationContext = { actor };
  const voidAction = (fn: (fd: FormData) => Promise<unknown>) => async (fd: FormData) => {
    try {
      await fn(fd);
    } catch (error) {
      notify(actionFailure(error).message ?? "Fehler");
    }
  };
  return {
    async saveCourse(_prev, fd) {
      try {
        const id = fd.get("id") as string | null;
        const data = formToObject(fd);
        if (id) {
          await commit((ds) => ({ dataset: updateCourse(ds, id, data, ops), value: null }));
          return actionOk("Anlage gespeichert.");
        }
        const newId = await commit((ds) => {
          const r = createCourse(ds, data, ops);
          return { dataset: r.dataset, value: r.course.id };
        });
        return actionOk("Anlage angelegt.", { redirectTo: adminCoursePath(newId) });
      } catch (error) {
        return actionFailure(error);
      }
    },
    async saveLayout(_prev, fd) {
      try {
        const id = fd.get("id") as string | null;
        const data = formToObject(fd);
        await commit((ds) => ({ dataset: id ? updateLayout(ds, id, data, ops) : createLayout(ds, data, ops).dataset, value: null }));
        return actionOk(id ? "Platz gespeichert." : "Platz angelegt.");
      } catch (error) {
        return actionFailure(error);
      }
    },
    async saveRatingSet(_prev, fd) {
      try {
        const id = fd.get("id") as string | null;
        const data = formToObject(fd);
        await commit((ds) => ({ dataset: id ? updateRatingSet(ds, id, data, ops) : createRatingSet(ds, data, ops).dataset, value: null }));
        return actionOk(id ? "Rating gespeichert." : "Rating angelegt.");
      } catch (error) {
        return actionFailure(error);
      }
    },
    async saveHoles(_prev, fd) {
      try {
        const { layoutId, holes } = parseHolesForm(fd);
        await commit((ds) => ({ dataset: replaceHoles(ds, layoutId, holes, ops), value: null }));
        return actionOk(`${holes.length} Löcher gespeichert.`);
      } catch (error) {
        return actionFailure(error);
      }
    },
    async saveGreens(_prev, fd) {
      try {
        const { layoutId, greens } = parseGreensForm(fd);
        // unverändert → nichts veröffentlichen
        if (setGreenCoordinates(current(), layoutId, greens, ops) === current()) return actionOk("Keine Änderungen.");
        await commit((ds) => ({ dataset: setGreenCoordinates(ds, layoutId, greens, ops), value: null }));
        const withCenter = greens.filter((g) => g.center).length;
        return actionOk(`GPS-Daten gespeichert (${withCenter}/${greens.length} Löcher mit Grünmitte).`);
      } catch (error) {
        return actionFailure(error);
      }
    },
    toggleRatingActive: voidAction((fd) => commit((ds) => ({ dataset: setRatingSetActive(ds, String(fd.get("id")), fd.get("active") === "true", ops), value: null }))),
    verifyRating: voidAction((fd) =>
      commit((ds) => ({ dataset: setRatingSetVerified(ds, String(fd.get("id")), fd.get("verified") === "true", (fd.get("checkedAt") as string) || null, ops), value: null })),
    ),
    mergeCourses: voidAction((fd) => commit((ds) => ({ dataset: mergeCourses(ds, String(fd.get("targetId")), String(fd.get("sourceId")), ops), value: null }))),
    async previewCsv(_prev, fd) {
      try {
        const text = await csvTextFromForm(fd);
        return { plan: planCsvImport(text, current().courses), result: null, error: null, text };
      } catch (error) {
        return { plan: null, result: null, error: error instanceof Error ? error.message : "Fehler", text: "" };
      }
    },
    async applyCsv(_prev, fd) {
      try {
        const text = String(fd.get("text") ?? "");
        const { plan, result } = await commit((ds) => {
          const p = planCsvImport(text, ds.courses);
          const r = applyCsvPlan(ds, p, { ...ops, source: "CSV_IMPORT" });
          return { dataset: r.dataset, value: { plan: p, result: r.result } };
        });
        return { plan, result, error: null, text: "" };
      } catch (error) {
        return { plan: null, result: null, error: error instanceof Error ? error.message : "Fehler", text: "" };
      }
    },
    async previewGreenCsv(_prev, fd) {
      try {
        const text = await csvTextFromForm(fd);
        return { plan: planGreenCsvImport(text, current().courses), result: null, error: null, text };
      } catch (error) {
        return { plan: null, result: null, error: error instanceof Error ? error.message : "Fehler", text: "" };
      }
    },
    async applyGreenCsv(_prev, fd) {
      try {
        const text = String(fd.get("text") ?? "");
        const { plan, result } = await commit((ds) => {
          const p = planGreenCsvImport(text, ds.courses);
          const r = applyGreenCsvPlan(ds, p, { ...ops, source: "CSV_IMPORT" });
          return { dataset: r.dataset, value: { plan: p, result: r.result } };
        });
        return { plan, result, error: null, text: "" };
      } catch (error) {
        return { plan: null, result: null, error: error instanceof Error ? error.message : "Fehler", text: "" };
      }
    },
    async importSeed() {
      try {
        const res = await fetch(withBasePath("/golfplaetze-daten.json"), { cache: "no-store" });
        const seed = parseDataset(await res.json());
        const added = await commit((ds) => {
          const r = mergeSeedCourses(ds, seed, ops);
          return { dataset: r.dataset, value: r.added };
        });
        return actionOk(added.length ? `Übernommen: ${added.join(", ")}.` : "Alle mitgelieferten Anlagen sind bereits vorhanden.");
      } catch (error) {
        return actionFailure(error);
      }
    },
  };
}

interface SessionState {
  dataset: CourseDataset | null;
  saving: boolean;
  notice: string | null;
}

/** Hält den geladenen Datensatz und speichert Änderungen nacheinander (mit Revisionsprüfung). */
class CourseAdminSession {
  private state: SessionState = { dataset: null, saving: false, notice: null };
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  readonly backend: AdminBackend;

  constructor(actor: string) {
    this.backend = createBackend(
      (mutate) => this.commit(mutate),
      () => this.state.dataset!,
      (notice) => this.set({ notice }),
      actor,
    );
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  async load() {
    this.set({ dataset: await courseAdminApi.load(), notice: null });
  }

  private async persist(base: CourseDataset, next: CourseDataset) {
    this.set({ saving: true });
    try {
      const res = await courseAdminApi.save(base.revision, next);
      const saved = { ...next, revision: res.revision, updatedAt: res.updatedAt };
      this.set({ dataset: saved });
      invalidateCourseDataset(saved);
    } catch (error) {
      if (error instanceof ApiError && error.code === "CONFLICT") {
        throw new Error("Die Golfplatzdaten wurden zwischenzeitlich an anderer Stelle geändert. Bitte die Seite neu laden und die Änderung wiederholen.");
      }
      throw new Error(userMessage(error));
    } finally {
      this.set({ saving: false });
    }
  }

  commit<T>(mutate: (ds: CourseDataset) => { dataset: CourseDataset; value: T }): Promise<T> {
    const run = async () => {
      const base = this.state.dataset;
      if (!base) throw new Error("Daten nicht geladen");
      const { dataset: next, value } = mutate(base);
      await this.persist(base, next);
      return value;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }
}

/**
 * Golfplatzpflege der Webspace-Edition. Die Sitzung stellt die Admin-Oberfläche (AdminShell) bereit;
 * hier wird nur der Datensatz geladen und jede Änderung sofort auf dem Webspace gespeichert.
 */
export function WebspaceCourseAdmin({ children }: { children: ReactNode }) {
  const { user, can } = useSession();
  const [session] = useState(() => new CourseAdminSession(user ? `${user.firstName} ${user.lastName}`.trim() : "admin"));
  const { dataset, saving, notice } = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    session.load().catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [session, attempt]);

  if (error && !dataset) {
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          setError(null);
          setAttempt((a) => a + 1);
        }}
      />
    );
  }
  if (!dataset) return <PageSkeleton variant="table" />;

  return (
    <CourseAdminContext.Provider value={{ dataset, saving, canWrite: can("courses.write"), replaceDataset: (next) => session.commit(() => ({ dataset: next, value: undefined })) }}>
      <AdminBackendProvider backend={session.backend}>
        <div className="space-y-4">
          <div className="flex justify-end text-xs text-ink-3">
            {saving ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> speichert …
              </span>
            ) : (
              <span title={dataset.updatedAt ?? undefined}>Golfplatzdaten · Version {dataset.revision}</span>
            )}
          </div>
          {notice && (
            <Alert tone="error">
              <div className="flex items-start justify-between gap-3">
                <span>{notice}</span>
                <button type="button" className="text-xs underline" onClick={() => session.set({ notice: null })}>
                  schließen
                </button>
              </div>
            </Alert>
          )}
          {children}
        </div>
      </AdminBackendProvider>
    </CourseAdminContext.Provider>
  );
}
