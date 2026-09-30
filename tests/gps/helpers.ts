/** Test-Umgebung für den LocationService: steuerbare Uhr, Geolocation und Berechtigung (keine echten Standorte). */
import type { GeolocationLike, LocationEnv, PermissionStatusLike, PositionErrorLike, PositionLike } from "@/lib/gps/locationService";

export class FakeClock {
  t = Date.parse("2026-09-30T12:00:00Z");
  private timers: { id: number; at: number; every: number | null; fn: () => void }[] = [];
  private seq = 0;
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => this.add(fn, ms, null);
  setInterval = (fn: () => void, ms: number) => this.add(fn, ms, ms);
  clear = (id: unknown) => {
    this.timers = this.timers.filter((x) => x.id !== id);
  };
  private add(fn: () => void, ms: number, every: number | null) {
    const id = ++this.seq;
    this.timers.push({ id, at: this.t + ms, every, fn });
    return id;
  }
  /** Zeit vorstellen und fällige Timer ausführen. */
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const next = this.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.t = next.at;
      if (next.every) next.at += next.every;
      else this.timers = this.timers.filter((x) => x !== next);
      next.fn();
    }
    this.t = end;
  }
  get activeTimers() {
    return this.timers.length;
  }
}

export class FakeGeolocation implements GeolocationLike {
  watchers = new Map<number, { ok: (p: PositionLike) => void; err: (e: PositionErrorLike) => void }>();
  cleared: number[] = [];
  singleRequests: { ok: (p: PositionLike) => void; err: (e: PositionErrorLike) => void }[] = [];
  private seq = 0;
  /** Verhalten bei der Systemabfrage: erlauben, ablehnen oder offen lassen */
  decision: "allow" | "deny" | "pending" = "allow";
  granted = false;

  watchPosition(ok: (p: PositionLike) => void, err: (e: PositionErrorLike) => void): number {
    const id = ++this.seq;
    this.watchers.set(id, { ok, err });
    if (!this.granted && this.decision === "deny") queueMicrotask(() => err({ code: 1, message: "denied" }));
    if (this.decision === "allow") this.granted = true;
    return id;
  }
  clearWatch(id: number) {
    this.watchers.delete(id);
    this.cleared.push(id);
  }
  getCurrentPosition(ok: (p: PositionLike) => void, err: (e: PositionErrorLike) => void) {
    this.singleRequests.push({ ok, err });
  }
  get active() {
    return this.watchers.size;
  }
  /** Messung an alle laufenden Abfragen senden. */
  emit(latitude: number, longitude: number, accuracy: number, timestamp: number) {
    for (const w of [...this.watchers.values()]) w.ok({ coords: { latitude, longitude, accuracy }, timestamp });
  }
  fail(code: number) {
    for (const w of [...this.watchers.values()]) w.err({ code, message: "test" });
  }
}

export function fakeEnv(opts: { clock: FakeClock; geo?: FakeGeolocation | null; permission?: "granted" | "denied" | "prompt" | null; secure?: boolean }) {
  let visible = true;
  const visibilityListeners = new Set<(v: boolean) => void>();
  const permissionStatus: PermissionStatusLike | null = opts.permission ? { state: opts.permission, onchange: null } : null;
  const env: LocationEnv = {
    geolocation: opts.geo === undefined ? new FakeGeolocation() : opts.geo,
    queryPermission: permissionStatus ? async () => permissionStatus : null,
    secure: opts.secure ?? true,
    policyAllows: true,
    now: opts.clock.now,
    setInterval: opts.clock.setInterval,
    clearInterval: opts.clock.clear,
    onVisibilityChange(listener) {
      visibilityListeners.add(listener);
      return () => visibilityListeners.delete(listener);
    },
    isVisible: () => visible,
  };
  return {
    env,
    setVisible(v: boolean) {
      visible = v;
      for (const l of [...visibilityListeners]) l(v);
    },
    /** Berechtigung in den Einstellungen ändern (Permissions-API meldet onchange) */
    changePermission(state: "granted" | "denied" | "prompt") {
      if (!permissionStatus) return;
      permissionStatus.state = state;
      permissionStatus.onchange?.call(permissionStatus, {});
    },
  };
}

/** Wartet auf ausstehende Promises/Microtasks. */
export const flush = () => new Promise<void>((r) => setTimeout(r, 0));
