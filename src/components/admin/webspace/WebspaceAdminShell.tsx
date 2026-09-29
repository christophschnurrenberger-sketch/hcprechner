"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Loader2, LogOut } from "lucide-react";
import { planCsvImport } from "@/lib/courses/csv";
import {
  actionFailure,
  actionOk,
  csvTextFromForm,
  formToObject,
  initialActionState,
  parseHolesForm,
  type ActionState,
} from "@/lib/courses/adminForm";
import { AdminApiError, adminApi } from "@/lib/courses/adminApi";
import { invalidateCourseDataset } from "@/lib/courses/client";
import {
  applyCsvPlan,
  createCourse,
  createLayout,
  createRatingSet,
  mergeCourses,
  replaceHoles,
  setRatingSetActive,
  setRatingSetVerified,
  updateCourse,
  updateLayout,
  updateRatingSet,
  type CourseDataset,
  type OperationContext,
} from "@/lib/courses/dataset";
import { adminCoursePath } from "@/lib/courses/paths";
import { Alert, Button, Card, CardBody, CardHeader, Field, Input } from "@/components/ui";
import { LoadingState } from "@/components/dashboard/DashboardView";
import { AdminBackendProvider, type AdminBackend } from "../AdminBackend";
import { AdminNav } from "../AdminNav";

type Phase = { kind: "loading" } | { kind: "login"; message?: string } | { kind: "ready" } | { kind: "error"; message: string };

interface AdminData {
  dataset: CourseDataset;
  saving: boolean;
  csrf: string | null;
  /** Ersetzt den kompletten Datensatz (Import/Wiederherstellung) und veröffentlicht ihn. */
  replaceDataset: (next: CourseDataset) => Promise<void>;
}

const AdminDataContext = createContext<AdminData | null>(null);

export function useAdminData(): AdminData {
  const ctx = useContext(AdminDataContext);
  if (!ctx) throw new Error("useAdminData außerhalb von WebspaceAdminShell");
  return ctx;
}

const OPS: OperationContext = { actor: "admin" };

type Commit = <T>(mutate: (ds: CourseDataset) => { dataset: CourseDataset; value: T }) => Promise<T>;


function createBackend(commit: Commit, current: () => CourseDataset, notify: (text: string) => void): AdminBackend {
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
          await commit((ds) => ({ dataset: updateCourse(ds, id, data, OPS), value: null }));
          return actionOk("Anlage gespeichert.");
        }
        const newId = await commit((ds) => {
          const r = createCourse(ds, data, OPS);
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
        await commit((ds) => ({ dataset: id ? updateLayout(ds, id, data, OPS) : createLayout(ds, data, OPS).dataset, value: null }));
        return actionOk(id ? "Platz gespeichert." : "Platz angelegt.");
      } catch (error) {
        return actionFailure(error);
      }
    },
    async saveRatingSet(_prev, fd) {
      try {
        const id = fd.get("id") as string | null;
        const data = formToObject(fd);
        await commit((ds) => ({ dataset: id ? updateRatingSet(ds, id, data, OPS) : createRatingSet(ds, data, OPS).dataset, value: null }));
        return actionOk(id ? "Rating gespeichert." : "Rating angelegt.");
      } catch (error) {
        return actionFailure(error);
      }
    },
    async saveHoles(_prev, fd) {
      try {
        const { layoutId, holes } = parseHolesForm(fd);
        await commit((ds) => ({ dataset: replaceHoles(ds, layoutId, holes, OPS), value: null }));
        return actionOk(`${holes.length} Löcher gespeichert.`);
      } catch (error) {
        return actionFailure(error);
      }
    },
    toggleRatingActive: voidAction((fd) =>
      commit((ds) => ({ dataset: setRatingSetActive(ds, String(fd.get("id")), fd.get("active") === "true", OPS), value: null })),
    ),
    verifyRating: voidAction((fd) =>
      commit((ds) => ({
        dataset: setRatingSetVerified(ds, String(fd.get("id")), fd.get("verified") === "true", (fd.get("checkedAt") as string) || null, OPS),
        value: null,
      })),
    ),
    mergeCourses: voidAction((fd) =>
      commit((ds) => ({ dataset: mergeCourses(ds, String(fd.get("targetId")), String(fd.get("sourceId")), OPS), value: null })),
    ),
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
        // Plan mit dem aktuellen Datenstand neu berechnen (wie in der Node-Edition)
        const { plan, result } = await commit((ds) => {
          const p = planCsvImport(text, ds.courses);
          const r = applyCsvPlan(ds, p, OPS);
          return { dataset: r.dataset, value: { plan: p, result: r.result } };
        });
        return { plan, result, error: null, text: "" };
      } catch (error) {
        return { plan: null, result: null, error: error instanceof Error ? error.message : "Fehler", text: "" };
      }
    },
  };
}

function LoginCard({ message, onLoggedIn }: { message?: string; onLoggedIn: (csrf: string) => Promise<void> }) {
  const [state, setState] = useState<ActionState>(initialActionState);
  const [pending, setPending] = useState(false);
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader title="Admin-Anmeldung" subtitle="Pflege der Golfplatzdatenbank" />
      <CardBody>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const password = String(new FormData(e.currentTarget).get("password") ?? "");
            setPending(true);
            try {
              const res = await adminApi.login(password);
              await onLoggedIn(res.csrf);
            } catch (error) {
              setState({ ok: false, message: (error as Error).message });
            } finally {
              setPending(false);
            }
          }}
        >
          {message && !state.message && <Alert tone="info">{message}</Alert>}
          <Field label="Admin-Passwort" htmlFor="pw" hint="Das Passwort wurde bei der Installation (install.php) festgelegt.">
            <Input id="pw" name="password" type="password" autoComplete="current-password" required />
          </Field>
          {state.message && <Alert tone="error">{state.message}</Alert>}
          <Button type="submit" disabled={pending}>
            {pending ? "Anmelden …" : "Anmelden"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

interface SessionState {
  dataset: CourseDataset | null;
  csrf: string | null;
  saving: boolean;
  notice: string | null;
}

/**
 * Sitzung des Browser-Admins: hält den geladenen Datensatz, wendet Änderungen nacheinander an
 * und speichert jede Änderung sofort (mit Revisionsprüfung gegen gleichzeitige Änderungen).
 */
class AdminSession {
  private state: SessionState = { dataset: null, csrf: null, saving: false, notice: null };
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private onUnauthorized: ((message: string) => void) | null = null;
  readonly backend: AdminBackend;

  constructor() {
    this.backend = createBackend(
      (mutate) => this.commit(mutate),
      () => this.state.dataset!,
      (notice) => this.set({ notice }),
    );
  }

  /** Rückmeldung, wenn die PHP-Session abgelaufen ist. Liefert die Abmeldefunktion. */
  handleUnauthorized(handler: (message: string) => void) {
    this.onUnauthorized = handler;
    return () => {
      if (this.onUnauthorized === handler) this.onUnauthorized = null;
    };
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

  async load(csrf: string | null) {
    const dataset = await adminApi.load(csrf);
    this.set({ dataset, csrf, notice: null });
  }

  async logout() {
    try {
      await adminApi.logout(this.state.csrf);
    } finally {
      this.set({ dataset: null, csrf: null });
    }
  }

  private async persist(base: CourseDataset, next: CourseDataset) {
    this.set({ saving: true });
    try {
      const res = await adminApi.save(this.state.csrf, base.revision, next);
      const saved = { ...next, revision: res.revision, updatedAt: res.updatedAt };
      this.set({ dataset: saved });
      invalidateCourseDataset(saved);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        this.onUnauthorized?.("Die Sitzung ist abgelaufen – bitte erneut anmelden. Die letzte Änderung wurde nicht gespeichert.");
      } else if (error instanceof AdminApiError && error.status === 409) {
        throw new Error("Die Golfplatzdaten wurden zwischenzeitlich an anderer Stelle geändert. Bitte die Seite neu laden und die Änderung wiederholen.");
      }
      throw error;
    } finally {
      this.set({ saving: false });
    }
  }

  /** Änderungen nacheinander anwenden und speichern (keine überlappenden Speichervorgänge). */
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
 * Admin-Bereich der Webspace-Edition: Anmeldung über api/admin.php, Bearbeitung des
 * Golfplatz-Datensatzes im Browser. Jede Änderung wird sofort auf dem Webspace gespeichert.
 */
export function WebspaceAdminShell({ children }: { children: ReactNode }) {
  const [session] = useState(() => new AdminSession());
  const { dataset, saving, notice, csrf } = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  const loadDataset = useCallback(
    async (token: string | null) => {
      await session.load(token);
      setPhase({ kind: "ready" });
    },
    [session],
  );

  useEffect(() => {
    const release = session.handleUnauthorized((message) => setPhase({ kind: "login", message }));
    let cancelled = false;
    (async () => {
      try {
        const status = await adminApi.status();
        if (cancelled) return;
        if (!status.installed) {
          setPhase({ kind: "error", message: "Die Anwendung ist noch nicht installiert. Bitte zuerst install.php aufrufen." });
        } else if (!status.loggedIn) {
          setPhase({ kind: "login" });
        } else {
          await loadDataset(status.csrf);
        }
      } catch (error) {
        if (!cancelled) setPhase({ kind: "error", message: (error as Error).message });
      }
    })();
    return () => {
      cancelled = true;
      release();
    };
  }, [session, loadDataset]);

  const replaceDataset = useCallback((next: CourseDataset) => session.commit(() => ({ dataset: next, value: undefined })), [session]);

  if (phase.kind === "loading") return <LoadingState />;
  if (phase.kind === "error") {
    return (
      <Alert tone="error" title="Admin-Bereich nicht verfügbar">
        {phase.message}
      </Alert>
    );
  }
  if (phase.kind === "login" || !dataset) {
    return <LoginCard message={phase.kind === "login" ? phase.message : undefined} onLoggedIn={loadDataset} />;
  }

  return (
    <AdminDataContext.Provider value={{ dataset, saving, csrf, replaceDataset }}>
      <AdminBackendProvider backend={session.backend}>
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <AdminNav />
            <div className="flex items-center gap-3 text-sm text-ink-3">
              {saving ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-4 w-4 animate-spin" /> speichert …
                </span>
              ) : (
                <span title={dataset.updatedAt ?? undefined}>Stand: Version {dataset.revision}</span>
              )}
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-ink"
                onClick={async () => {
                  try {
                    await session.logout();
                  } finally {
                    setPhase({ kind: "login" });
                  }
                }}
              >
                <LogOut className="h-4 w-4" /> Abmelden
              </button>
            </div>
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
    </AdminDataContext.Provider>
  );
}
