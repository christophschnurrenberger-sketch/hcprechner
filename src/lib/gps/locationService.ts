/**
 * LocationService: die einzige Stelle, die den Standort des Geräts abfragt.
 *
 * Kein Baustein ruft `navigator.geolocation` selbst auf. Die Browser-Anbindung ist austauschbar (Umgebung `env`),
 * damit dieselbe Logik später in einer nativen iOS-Hülle bzw. mit einer anderen Quelle laufen kann und testbar ist.
 *
 * Datenschutz: Es wird nur die jeweils letzte Messung im Arbeitsspeicher gehalten und beim Stoppen verworfen –
 * kein Bewegungsverlauf, keine Speicherung, keine Übertragung an einen Server.
 */
import { GPS_CONFIG } from "./config";
import type { LocationFix } from "./distanceEngine";
import type { LocationPermission, LocationStatus } from "./types";

export type LocationErrorKind = "PERMISSION_DENIED" | "POSITION_UNAVAILABLE" | "TIMEOUT" | "UNSUPPORTED" | "INSECURE";

export class LocationError extends Error {
  constructor(
    readonly kind: LocationErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "LocationError";
  }
}

export type LocationEvent =
  | { type: "fix"; fix: LocationFix }
  | { type: "state"; status: LocationStatus; permission: LocationPermission; error: LocationErrorKind | null };

export interface LocationService {
  readonly status: LocationStatus;
  readonly permission: LocationPermission;
  readonly lastError: LocationErrorKind | null;
  /** Fortlaufende Standortbestimmung starten (löst beim ersten Mal die Systemabfrage aus). */
  start(): void;
  /** Beenden und die letzte Messung verwerfen. */
  stop(): void;
  /** Einzelne Position (z. B. Admin „GPS-Position verwenden“); nutzt eine frische laufende Messung, falls vorhanden. */
  getCurrentPosition(options?: { maxAgeMs?: number; timeoutMs?: number }): Promise<LocationFix>;
  getLastPosition(): LocationFix | null;
  getAccuracy(): number | null;
  hasPermission(): boolean;
  /** Berechtigung ohne Rückfrage ermitteln (Permissions-API, sofern vorhanden). */
  refreshPermission(): Promise<LocationPermission>;
  subscribe(listener: (event: LocationEvent) => void): () => void;
}

// ---------------------------------------------------------------------------
// Umgebung (Browser-APIs, für Tests und native Adapter austauschbar)
// ---------------------------------------------------------------------------

export interface PositionLike {
  coords: { latitude: number; longitude: number; accuracy: number };
  timestamp: number;
}

export interface PositionErrorLike {
  code: number;
  message?: string;
}

export interface GeolocationLike {
  watchPosition(success: (p: PositionLike) => void, error: (e: PositionErrorLike) => void, options?: PositionOptions): number;
  clearWatch(id: number): void;
  getCurrentPosition(success: (p: PositionLike) => void, error: (e: PositionErrorLike) => void, options?: PositionOptions): void;
}

export interface PermissionStatusLike {
  state: string;
  onchange: ((this: PermissionStatusLike, ev: unknown) => unknown) | null;
}

export interface LocationEnv {
  geolocation: GeolocationLike | null;
  /** Permissions-API (fehlt in älteren Browsern → Berechtigung bleibt UNKNOWN, bis eine Abfrage gelingt oder scheitert) */
  queryPermission: (() => Promise<PermissionStatusLike>) | null;
  /** HTTPS bzw. localhost – sonst liefern Browser keinen Standort */
  secure: boolean;
  /** Permissions-Policy der Seite erlaubt Geolocation */
  policyAllows: boolean;
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
  /** Sichtbarkeit der Seite (im Hintergrund wird die Messung pausiert – spart Akku) */
  onVisibilityChange(listener: (visible: boolean) => void): () => void;
  isVisible(): boolean;
}

const PERMISSION_MAP: Record<string, LocationPermission> = { granted: "AUTHORIZED", denied: "DENIED", prompt: "UNKNOWN" };

export function createLocationService(env: LocationEnv): LocationService {
  let status: LocationStatus = "OFF";
  let permission: LocationPermission = !env.geolocation ? "UNAVAILABLE" : !env.secure || !env.policyAllows ? "RESTRICTED" : "UNKNOWN";
  let lastError: LocationErrorKind | null = null;
  let lastFix: LocationFix | null = null;
  let wanted = false;
  let watchId: number | null = null;
  let timer: unknown = null;
  let startedAt = 0;
  let stopVisibility: (() => void) | null = null;
  let permissionWatch: PermissionStatusLike | null = null;
  const listeners = new Set<(e: LocationEvent) => void>();

  const emit = (e: LocationEvent) => {
    for (const l of [...listeners]) {
      try {
        l(e);
      } catch (error) {
        console.error("Standort-Listener fehlgeschlagen", error);
      }
    }
  };
  const setState = (next: Partial<{ status: LocationStatus; permission: LocationPermission; error: LocationErrorKind | null }>) => {
    const changed =
      (next.status !== undefined && next.status !== status) ||
      (next.permission !== undefined && next.permission !== permission) ||
      (next.error !== undefined && next.error !== lastError);
    if (next.status !== undefined) status = next.status;
    if (next.permission !== undefined) permission = next.permission;
    if (next.error !== undefined) lastError = next.error;
    if (changed) emit({ type: "state", status, permission, error: lastError });
  };

  const toFix = (p: PositionLike): LocationFix => ({
    latitude: p.coords.latitude,
    longitude: p.coords.longitude,
    accuracy: p.coords.accuracy,
    timestamp: Number.isFinite(p.timestamp) && p.timestamp > 0 ? p.timestamp : env.now(),
  });

  const unsupported = (): LocationError | null => {
    if (!env.geolocation) return new LocationError("UNSUPPORTED", "Standort wird von diesem Gerät nicht unterstützt");
    if (!env.secure || !env.policyAllows) return new LocationError("INSECURE", "Standortabfrage auf dieser Seite nicht erlaubt");
    return null;
  };

  function onPosition(p: PositionLike) {
    if (watchId === null) return; // nach stop() eintreffende Meldungen verwerfen
    const fix = toFix(p);
    lastFix = fix;
    setState({ status: "ACTIVE", permission: "AUTHORIZED", error: null });
    emit({ type: "fix", fix });
  }

  function onError(e: PositionErrorLike) {
    if (watchId === null) return;
    if (e.code === 1) {
      endWatch();
      setState({ status: "ERROR", permission: "DENIED", error: "PERMISSION_DENIED" });
      return;
    }
    const fresh = lastFix && env.now() - lastFix.timestamp <= GPS_CONFIG.positionStaleMs;
    if (e.code === 3) {
      // Zeitüberschreitung: Abfrage neu starten, damit Messungen weiterlaufen
      restartWatch();
      setState({ status: fresh ? status : "NO_SIGNAL", error: "TIMEOUT" });
      return;
    }
    setState({ status: fresh ? status : "NO_SIGNAL", error: "POSITION_UNAVAILABLE" });
  }

  function checkSignal() {
    const now = env.now();
    if (status === "ACTIVE" && lastFix && now - lastFix.timestamp > GPS_CONFIG.noSignalAfterMs) setState({ status: "NO_SIGNAL" });
    if (status === "ACQUIRING" && now - startedAt > GPS_CONFIG.noSignalAfterMs) setState({ status: "NO_SIGNAL" });
  }

  function beginWatch() {
    const blocked = unsupported();
    if (blocked) {
      setState({ status: "ERROR", permission: blocked.kind === "UNSUPPORTED" ? "UNAVAILABLE" : "RESTRICTED", error: blocked.kind });
      return;
    }
    if (watchId !== null) return;
    startedAt = env.now();
    watchId = env.geolocation!.watchPosition(onPosition, onError, GPS_CONFIG.watch);
    if (timer === null) timer = env.setInterval(checkSignal, 2_000);
    const fresh = lastFix && env.now() - lastFix.timestamp <= GPS_CONFIG.positionStaleMs;
    setState({ status: fresh ? "ACTIVE" : "ACQUIRING" });
  }

  function endWatch() {
    if (watchId !== null) env.geolocation?.clearWatch(watchId);
    watchId = null;
    if (timer !== null) env.clearInterval(timer);
    timer = null;
  }

  function restartWatch() {
    if (watchId === null || !env.geolocation) return;
    env.geolocation.clearWatch(watchId);
    watchId = env.geolocation.watchPosition(onPosition, onError, GPS_CONFIG.watch);
  }

  const service: LocationService = {
    get status() {
      return status;
    },
    get permission() {
      return permission;
    },
    get lastError() {
      return lastError;
    },
    start() {
      wanted = true;
      if (!stopVisibility) {
        stopVisibility = env.onVisibilityChange((visible) => {
          if (!wanted) return;
          if (visible) beginWatch();
          else {
            // im Hintergrund pausieren (Akku); die nächste Messung beim Zurückkehren ersetzt die alte
            endWatch();
            setState({ status: "ACQUIRING" });
          }
        });
      }
      if (env.isVisible()) beginWatch();
      else setState({ status: "ACQUIRING" });
    },
    stop() {
      wanted = false;
      endWatch();
      stopVisibility?.();
      stopVisibility = null;
      lastFix = null;
      setState({ status: "OFF", error: null });
    },
    getCurrentPosition(options = {}) {
      const maxAge = options.maxAgeMs ?? 5_000;
      if (lastFix && env.now() - lastFix.timestamp <= maxAge) return Promise.resolve(lastFix);
      const blocked = unsupported();
      if (blocked) return Promise.reject(blocked);
      return new Promise<LocationFix>((resolve, reject) => {
        env.geolocation!.getCurrentPosition(
          (p) => {
            if (permission !== "AUTHORIZED") setState({ permission: "AUTHORIZED" });
            resolve(toFix(p));
          },
          (e) => {
            if (e.code === 1) {
              setState({ permission: "DENIED", error: "PERMISSION_DENIED" });
              reject(new LocationError("PERMISSION_DENIED", "Standortzugriff verweigert"));
            } else reject(new LocationError(e.code === 3 ? "TIMEOUT" : "POSITION_UNAVAILABLE", e.message || "Keine Position verfügbar"));
          },
          { ...GPS_CONFIG.single, timeout: options.timeoutMs ?? GPS_CONFIG.single.timeout },
        );
      });
    },
    getLastPosition: () => lastFix,
    getAccuracy: () => lastFix?.accuracy ?? null,
    hasPermission: () => permission === "AUTHORIZED",
    async refreshPermission() {
      const blocked = unsupported();
      if (blocked) {
        setState({ permission: blocked.kind === "UNSUPPORTED" ? "UNAVAILABLE" : "RESTRICTED" });
        return permission;
      }
      if (!env.queryPermission) return permission;
      try {
        const st = await env.queryPermission();
        setState({ permission: PERMISSION_MAP[st.state] ?? "UNKNOWN" });
        if (permissionWatch !== st) {
          permissionWatch = st;
          // Änderung in den Einstellungen (z. B. nachträglich erlaubt) sofort übernehmen
          st.onchange = () => setState({ permission: PERMISSION_MAP[st.state] ?? "UNKNOWN" });
        }
      } catch {
        // Permissions-API vorhanden, aber nicht für Geolocation (ältere Browser) – Zustand bleibt
      }
      return permission;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return service;
}

/** Umgebung im Browser. */
export function browserLocationEnv(): LocationEnv {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const doc = typeof document !== "undefined" ? document : null;
  const policy = (doc as (Document & { featurePolicy?: { allowsFeature(f: string): boolean } }) | null)?.featurePolicy;
  return {
    geolocation: (nav?.geolocation as GeolocationLike | undefined) ?? null,
    queryPermission: nav?.permissions?.query ? () => nav.permissions.query({ name: "geolocation" as PermissionName }) as unknown as Promise<PermissionStatusLike> : null,
    secure: typeof window !== "undefined" ? window.isSecureContext !== false : false,
    policyAllows: policy ? policy.allowsFeature("geolocation") : true,
    now: () => Date.now(),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
    onVisibilityChange(listener) {
      if (!doc) return () => undefined;
      const handler = () => listener(doc.visibilityState !== "hidden");
      doc.addEventListener("visibilitychange", handler);
      return () => doc.removeEventListener("visibilitychange", handler);
    },
    isVisible: () => !doc || doc.visibilityState !== "hidden",
  };
}

let browserService: LocationService | null = null;

/** Gemeinsamer Standortdienst der Seite (Runde, Admin, Platzsuche). */
export function getLocationService(): LocationService {
  if (!browserService) browserService = createLocationService(browserLocationEnv());
  return browserService;
}
