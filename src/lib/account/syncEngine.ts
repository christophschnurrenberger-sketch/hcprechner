/**
 * Speichert die Daten eines angemeldeten Benutzers auf dem Server: verzögert (mehrere schnelle
 * Änderungen → ein Speichervorgang), strikt nacheinander und mit Revisionsprüfung. Wurde das Konto
 * zwischenzeitlich auf einem anderen Gerät geändert (HTTP 409), werden beide Stände zusammengeführt
 * und erneut gespeichert. Ohne Verbindung wird automatisch später erneut versucht.
 */
import type { StoredData } from "@/lib/store/schema";
import { AccountApiError } from "./client";
import { fromUserPayload, mergeUserData, toUserPayload, type UserDataPayload } from "./userData";

export type AccountSyncState = { state: "loading" | "saving" | "saved" | "error"; message?: string; lastSavedAt?: string | null };

export interface SyncEngineOptions {
  revision: number;
  getData: () => StoredData;
  apply: (data: StoredData) => void;
  save: (baseRevision: number, data: UserDataPayload) => Promise<{ revision: number; updatedAt: string }>;
  setDirty: (dirty: boolean) => void;
  onStatus: (status: AccountSyncState) => void;
  onUnauthorized: () => void;
  delayMs?: number;
  retryMs?: number;
}

export class UserDataSyncEngine {
  private revision: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private disposed = false;
  private lastSavedAt: string | null = null;

  constructor(private readonly o: SyncEngineOptions) {
    this.revision = o.revision;
  }

  /** Nach jeder Änderung aufrufen. */
  schedule(delay = this.o.delayMs ?? 800) {
    if (this.disposed) return;
    this.o.setDirty(true);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.push();
    }, delay);
  }

  /** Ausstehende Änderungen sofort speichern (z. B. vor dem Abmelden). */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      await this.push();
    } else if (this.running) {
      await this.running;
    }
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async push(): Promise<void> {
    if (this.running) await this.running;
    if (this.disposed) return;
    const p = this.run().finally(() => {
      this.running = null;
    });
    this.running = p;
    return p;
  }

  private async run() {
    this.o.onStatus({ state: "saving", lastSavedAt: this.lastSavedAt });
    try {
      let res: { revision: number; updatedAt: string };
      try {
        res = await this.o.save(this.revision, toUserPayload(this.o.getData()));
      } catch (error) {
        if (!(error instanceof AccountApiError) || error.status !== 409) throw error;
        const body = error.body as { data?: UserDataPayload | null; revision?: number } | null;
        this.revision = body?.revision ?? this.revision;
        if (body?.data && !this.disposed) this.o.apply(mergeUserData(this.o.getData(), fromUserPayload(body.data)));
        res = await this.o.save(this.revision, toUserPayload(this.o.getData()));
      }
      if (this.disposed) return;
      this.revision = res.revision;
      this.lastSavedAt = res.updatedAt;
      if (!this.timer) this.o.setDirty(false);
      this.o.onStatus({ state: "saved", lastSavedAt: res.updatedAt });
    } catch (error) {
      if (this.disposed) return;
      if (error instanceof AccountApiError && error.status === 401) {
        this.o.onStatus({ state: "error", message: "Sitzung abgelaufen – bitte neu anmelden. Die Änderungen bleiben auf diesem Gerät erhalten." });
        this.o.onUnauthorized();
        return;
      }
      this.o.onStatus({ state: "error", message: `Nicht gespeichert: ${(error as Error).message}. Neuer Versuch folgt automatisch.`, lastSavedAt: this.lastSavedAt });
      this.schedule(this.o.retryMs ?? 15000);
    }
  }
}
