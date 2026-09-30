/**
 * GPS während der Runde: koppelt den LocationService an den Rundenstatus.
 *
 *   ACTIVE    → Standort an (sofern Berechtigung bzw. Zustimmung vorhanden und der Platz Grün-Koordinaten hat)
 *   PAUSED    → aus (Runde verlassen; im Hintergrund pausiert der LocationService selbst)
 *   COMPLETED → aus, letzte Position verworfen
 *
 * GPS ist ein Zusatz: Kein Zustand hier kann die Scorecard blockieren oder das Loch der Scorecard ändern.
 */
import type { GreenGeo } from "@/lib/courses/types";
import { GPS_CONFIG } from "./config";
import type { GreenTarget, LocationFix } from "./distanceEngine";
import { buildDistanceView, type DistanceViewState } from "./distanceView";
import { PositionFilter } from "./filter";
import type { LocationService } from "./locationService";
import type { GpsLocale } from "./messages";
import type { DistanceUnit, GpsStateKind, RoundStatus } from "./types";

export interface RoundGpsContext {
  round: RoundStatus;
  courseId: string | null;
  /** Loch, für das die Entfernung angezeigt wird */
  holeNumber: number | null;
  green: GreenGeo | null;
  /** Platz hat überhaupt Grün-Koordinaten (sonst bleibt GPS aus) */
  hasGreens: boolean;
  target: GreenTarget;
  unit: DistanceUnit;
}

/** Merkt sich (nur auf diesem Gerät), dass der Spieler GPS für Runden aktiviert hat. */
export interface OptInStore {
  get(): boolean;
  set(value: boolean): void;
}

export interface RoundGpsDeps {
  now: () => number;
  optIn: OptInStore;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  locale?: GpsLocale;
}

const IDLE_CONTEXT: RoundGpsContext = { round: "NOT_STARTED", courseId: null, holeNumber: null, green: null, hasGreens: false, target: "green_center", unit: "M" };

/** Soll der Standort laufen? (ohne Nutzeraktion) */
export function shouldTrack(ctx: RoundGpsContext, permission: LocationService["permission"], optedIn: boolean): boolean {
  if (ctx.round !== "ACTIVE" || !ctx.hasGreens) return false;
  return permission === "AUTHORIZED" || (permission === "UNKNOWN" && optedIn);
}

export class RoundGpsController {
  private ctx: RoundGpsContext = IDLE_CONTEXT;
  private readonly filter = new PositionFilter();
  private fix: LocationFix | null = null;
  private holeChangedAt: number | null = null;
  private running = false;
  private tick: unknown = null;
  private pending: unknown = null;
  private lastEmit = 0;
  private view: DistanceViewState;
  private readonly listeners = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;
  private attached = false;

  /** Ohne Nebenwirkungen – der Standortdienst wird erst mit `attach()` verbunden. */
  constructor(
    private readonly service: LocationService,
    private readonly deps: RoundGpsDeps,
  ) {
    this.view = this.build();
  }

  /** Mit dem Standortdienst verbinden (Runde auf dem Bildschirm). */
  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.unsubscribe = this.service.subscribe((event) => {
      if (!this.attached) return;
      if (event.type === "fix") {
        if (!this.running) return; // Messungen außerhalb einer aktiven Runde werden nicht verarbeitet
        const r = this.filter.push(event.fix);
        if (r.fix) this.fix = r.fix;
        this.recompute(false);
        return;
      }
      this.sync();
      this.recompute(true);
    });
    void this.service.refreshPermission().then(() => {
      if (!this.attached) return;
      this.sync();
      this.recompute(true);
    });
    this.sync();
    this.recompute(true);
  }

  /** Aktueller Kontext der Runde (bei jeder Änderung von Loch, Ziel, Einheit oder Status aufrufen). */
  update(next: RoundGpsContext): void {
    const prev = this.ctx;
    this.ctx = next;
    if (prev !== IDLE_CONTEXT && (prev.holeNumber !== next.holeNumber || prev.courseId !== next.courseId)) this.holeChangedAt = this.deps.now();
    if (this.attached) this.sync();
    this.recompute(true);
  }

  /** Nutzeraktion „Standort aktivieren“ / „Erneut versuchen“: löst die Systemabfrage aus. */
  activate(): void {
    if (!this.attached || this.ctx.round !== "ACTIVE") return;
    this.deps.optIn.set(true);
    this.startService();
    this.recompute(true);
  }

  getView = (): DistanceViewState => this.view;

  /** Läuft die Standortbestimmung gerade? */
  isTracking(): boolean {
    return this.running;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Runde verlassen / Seite geschlossen: Standort aus, Position verwerfen. Erneutes `attach()` ist möglich. */
  detach(): void {
    if (!this.attached) return;
    // zuerst abmelden: die Statusmeldung des Stopps darf keinen Neustart auslösen
    this.attached = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stopService();
    if (this.pending !== null) this.deps.clearTimeout(this.pending);
    this.pending = null;
  }

  /** Endgültig beenden (Tests, Aufräumen). */
  dispose(): void {
    this.detach();
    this.listeners.clear();
  }

  // -------------------------------------------------------------------------

  private sync() {
    const want = shouldTrack(this.ctx, this.service.permission, this.deps.optIn.get());
    if (want && !this.running) this.startService();
    else if (this.running && (this.ctx.round !== "ACTIVE" || !this.ctx.hasGreens || this.service.permission === "DENIED" || this.service.permission === "RESTRICTED" || this.service.permission === "UNAVAILABLE")) this.stopService();
  }

  private startService() {
    if (this.running) {
      this.service.start(); // erneuter Versuch
      return;
    }
    this.running = true;
    this.filter.reset();
    this.fix = null;
    this.service.start();
    // Zeitabhängige Anzeige (veraltet, kein Signal) auch ohne neue Messung aktualisieren
    this.tick = this.deps.setInterval(() => this.recompute(false), 1_000);
  }

  private stopService() {
    if (!this.running) return;
    this.running = false;
    this.service.stop();
    this.filter.reset();
    this.fix = null;
    if (this.tick !== null) this.deps.clearInterval(this.tick);
    this.tick = null;
  }

  private gpsKind(): GpsStateKind {
    const c = this.ctx;
    if (c.round !== "ACTIVE" || !c.hasGreens) return "OFF";
    const p = this.service.permission;
    if (this.running) {
      const s = this.service.status;
      if (s === "ACTIVE") return "ACTIVE";
      if (s === "NO_SIGNAL") return "NO_SIGNAL";
      if (s === "ACQUIRING" || s === "OFF") return "ACQUIRING";
    }
    if (p === "DENIED") return "DENIED";
    if (p === "RESTRICTED") return "RESTRICTED";
    if (p === "UNAVAILABLE") return "UNAVAILABLE";
    return "PERMISSION_REQUIRED";
  }

  private build(): DistanceViewState {
    return buildDistanceView({
      courseId: this.ctx.courseId,
      holeNumber: this.ctx.holeNumber,
      green: this.ctx.green,
      preferredTarget: this.ctx.target,
      unit: this.ctx.unit,
      gpsKind: this.gpsKind(),
      fix: this.fix,
      holeChangedAt: this.holeChangedAt,
      now: this.deps.now(),
      locale: this.deps.locale,
    });
  }

  /** Neu berechnen; nur bei sichtbarer Änderung melden – Positionsupdates höchstens alle minRenderIntervalMs. */
  private recompute(immediate: boolean) {
    const next = this.build();
    // unveränderte Anzeige: kein neues Objekt (useSyncExternalStore erwartet eine stabile Momentaufnahme)
    if (next.signature === this.view.signature) return;
    const now = this.deps.now();
    const wait = GPS_CONFIG.minRenderIntervalMs - (now - this.lastEmit);
    if (immediate || wait <= 0 || majorChange(this.view, next)) {
      this.emit(next);
      return;
    }
    if (this.pending === null) {
      this.pending = this.deps.setTimeout(() => {
        this.pending = null;
        this.emit(this.build());
      }, wait);
    }
  }

  private emit(view: DistanceViewState) {
    if (this.pending !== null) {
      this.deps.clearTimeout(this.pending);
      this.pending = null;
    }
    this.view = view;
    this.lastEmit = this.deps.now();
    for (const l of [...this.listeners]) l();
  }
}

/**
 * Sofort anzeigen (nicht drosseln): Statuswechsel, erste bzw. wegfallende Entfernung, anderes Loch/Ziel.
 * Gedrosselt werden nur Zahlenänderungen einer bereits angezeigten Entfernung.
 */
function majorChange(prev: DistanceViewState, next: DistanceViewState): boolean {
  return (
    prev.hole !== next.hole ||
    prev.target !== next.target ||
    prev.updating !== next.updating ||
    prev.stale !== next.stale ||
    prev.gps.label !== next.gps.label ||
    (prev.display.value === null) !== (next.display.value === null)
  );
}

/** Zustimmung im localStorage des Geräts (kein Standort, nur „GPS für Runden aktiviert“). */
export const localOptIn: OptInStore = {
  get() {
    try {
      return localStorage.getItem("hcp.gps.optIn") === "1";
    } catch {
      return false;
    }
  },
  set(value) {
    try {
      if (value) localStorage.setItem("hcp.gps.optIn", "1");
      else localStorage.removeItem("hcp.gps.optIn");
    } catch {
      /* privater Modus */
    }
  },
};
