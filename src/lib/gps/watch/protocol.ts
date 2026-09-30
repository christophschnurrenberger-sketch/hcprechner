/**
 * Apple-Watch-Protokoll (Version 1): was das iPhone an die Watch sendet – und wie die Watch es anzeigt.
 *
 * Datenfluss: Standort → DistanceEngine → WatchState → nur Änderungen (Patch) → WatchConnectivity → Watch.
 * Die Watch bekommt ausschließlich Loch, Par, Entfernung, Ziel, GPS-Status und Zeitstempel – keine Scorecard,
 * kein Konto, keine Golfplatzdatenbank. Dieselben Regeln sind in native/apple (HCPGolfKit, Swift) umgesetzt und
 * werden mit denselben Testwerten geprüft (tests/fixtures/gps-vectors.json → watch).
 */
import { GPS_CONFIG } from "../config";
import type { DistanceViewState } from "../distanceView";
import { formatAge } from "../format";
import { gpsText, type GpsLocale } from "../messages";

export const WATCH_PROTOCOL_VERSION = 1;

export type WatchGpsStatus = "ok" | "poor" | "acquiring" | "no_signal" | "off";
export type WatchTarget = "green_center" | "green_front" | "green_back";

/** Vollständiger Zustand, wie ihn die Watch hält (Felder aus Master-Prompt §30 plus Status). */
export interface WatchState {
  v: typeof WATCH_PROTOCOL_VERSION;
  roundActive: boolean;
  hole: number | null;
  par: number | null;
  /** gerundete Entfernung in `unit` – null statt 0, wenn keine Entfernung vorliegt */
  distance: number | null;
  approx: boolean;
  unit: "m" | "yd";
  target: WatchTarget;
  /** Front/Mitte/Back, sofern Front oder Back hinterlegt sind (sonst null – dann gilt nur `distance`) */
  front: number | null;
  center: number | null;
  back: number | null;
  /** GPS-Genauigkeit in Metern (gerundet) */
  gpsAccuracy: number | null;
  status: WatchGpsStatus;
  noGreen: boolean;
  /** Zeitpunkt der Messung, Unix-Sekunden (Uhr des iPhones) */
  timestamp: number | null;
}

type WatchData = Omit<WatchState, "v">;

/** Nachricht iPhone → Watch. `state` = vollständig (erste Nachricht, nach Verbindungsaufbau), `patch` = nur Änderungen. */
export interface WatchMessage {
  v: typeof WATCH_PROTOCOL_VERSION;
  type: "state" | "patch" | "heartbeat";
  /** Kennung des Senders (neu nach Neustart von App bzw. Seite) – ein neuer Sender beginnt mit `state` */
  epoch: string;
  /** fortlaufend je Sender – ältere oder doppelte Nachrichten verwirft die Watch */
  seq: number;
  /** Sendezeitpunkt, Unix-Sekunden (iPhone-Uhr) – zusammen mit `timestamp` ergibt sich das Alter ohne Uhrenvergleich */
  sentAt: number;
  data?: Partial<WatchData>;
}

/** Befehle Watch → iPhone (minimal: Loch wechseln, Ziel wechseln). Ändern nur die Entfernungsansicht, nie die Scorecard. */
export type WatchCommand = { type: "hole"; delta: -1 | 1 } | { type: "target"; target: WatchTarget };

const unix = (ms: number) => Math.round(ms / 1000);

/** Watch-Zustand aus der Entfernungsansicht der laufenden Runde. */
export function watchStateFromView(view: DistanceViewState, ctx: { roundActive: boolean; par: number | null }): WatchState {
  const status: WatchGpsStatus =
    view.gps.kind === "ACTIVE"
      ? view.gps.quality === "poor"
        ? "poor"
        : "ok"
      : view.gps.kind === "ACQUIRING"
        ? "acquiring"
        : view.gps.kind === "NO_SIGNAL"
          ? "no_signal"
          : "off";
  const shownValue = view.updating ? null : view.display.rounded;
  const rowValue = (target: WatchTarget) => {
    const row = view.targets.find((t) => t.target === target);
    return row && !view.updating ? row.display.rounded : null;
  };
  const hasRows = view.targets.length > 1;
  const target: WatchTarget = view.target === "pin" ? "green_center" : view.target;
  return {
    v: WATCH_PROTOCOL_VERSION,
    roundActive: ctx.roundActive,
    hole: view.hole,
    par: ctx.par,
    distance: shownValue,
    approx: view.display.approx,
    unit: view.display.unit,
    target,
    front: hasRows ? rowValue("green_front") : null,
    center: hasRows ? rowValue("green_center") : null,
    back: hasRows ? rowValue("green_back") : null,
    gpsAccuracy: view.result.accuracy !== null ? Math.max(1, Math.round(view.result.accuracy)) : null,
    status,
    noGreen: view.noGreen,
    timestamp: view.result.timestamp && shownValue !== null ? unix(Date.parse(view.result.timestamp)) : null,
  };
}

const KEYS: (keyof WatchData)[] = ["roundActive", "hole", "par", "distance", "approx", "unit", "target", "front", "center", "back", "gpsAccuracy", "status", "noGreen", "timestamp"];

/** Nur die geänderten Felder (§107). `null`, wenn sich nichts geändert hat. */
export function diffWatchState(prev: WatchState | null, next: WatchState): Partial<WatchData> | null {
  if (!prev) {
    const { v: _v, ...all } = next;
    void _v;
    return all;
  }
  const out: Partial<WatchData> = {};
  for (const k of KEYS) if (prev[k] !== next[k]) (out as Record<string, unknown>)[k] = next[k];
  // Lochwechsel: alte Entfernung nie mit neuem Loch – Entfernung und Zeitpunkt immer mitsenden
  if ("hole" in out) {
    out.distance = next.distance;
    out.timestamp = next.timestamp;
    out.front = next.front;
    out.center = next.center;
    out.back = next.back;
  }
  return Object.keys(out).length ? out : null;
}

// ---------------------------------------------------------------------------
// Senden (iPhone bzw. Web-App in der iPhone-Hülle)
// ---------------------------------------------------------------------------

export interface WatchTransport {
  send(message: WatchMessage): void;
}

/**
 * Sendet nur Änderungen und in Ruhe einen Herzschlag, damit die Watch einen Verbindungsverlust erkennt.
 * Nach `reset()` (z. B. Watch neu verbunden) geht wieder ein vollständiger Zustand hinaus.
 */
export class WatchSync {
  private last: WatchState | null = null;
  private seq = 0;
  private lastSentAt = 0;
  readonly epoch: string;

  constructor(
    private readonly transport: WatchTransport,
    private readonly now: () => number = () => Date.now(),
    epoch?: string,
  ) {
    this.epoch = epoch ?? Math.random().toString(36).slice(2, 10);
  }

  update(state: WatchState): WatchMessage | null {
    const diff = diffWatchState(this.last, state);
    if (!diff) return null;
    const message: WatchMessage = { v: WATCH_PROTOCOL_VERSION, type: this.last ? "patch" : "state", epoch: this.epoch, seq: ++this.seq, sentAt: unix(this.now()), data: diff };
    this.last = state;
    this.lastSentAt = this.now();
    this.transport.send(message);
    return message;
  }

  /** Regelmäßig aufrufen: sendet einen Herzschlag, wenn länger nichts gesendet wurde. */
  heartbeat(): WatchMessage | null {
    if (!this.last || this.now() - this.lastSentAt < GPS_CONFIG.watchHeartbeatMs) return null;
    const message: WatchMessage = { v: WATCH_PROTOCOL_VERSION, type: "heartbeat", epoch: this.epoch, seq: ++this.seq, sentAt: unix(this.now()) };
    this.lastSentAt = this.now();
    this.transport.send(message);
    return message;
  }

  reset(): void {
    this.last = null;
  }
}

// ---------------------------------------------------------------------------
// Empfangen und Anzeigen (Watch bzw. Vorschau im Browser)
// ---------------------------------------------------------------------------

export interface WatchReceiverState {
  state: WatchState | null;
  epoch: string | null;
  seq: number;
  /** Empfangszeit der letzten Nachricht jeder Art (Uhr der Watch, ms) – für „Verbindung verloren“ */
  receivedAt: number | null;
  /** Sendezeit dieser Nachricht (Uhr des iPhones, s) – mit `state.timestamp` ergibt sich das Alter ohne Uhrenvergleich */
  sentAt: number | null;
}

export const EMPTY_RECEIVER: WatchReceiverState = { state: null, epoch: null, seq: 0, receivedAt: null, sentAt: null };

/** Alter der angezeigten Messung (ms): (sentAt − timestamp) auf dem iPhone + Zeit seit dem Empfang auf der Watch. */
export function watchFixAge(r: WatchReceiverState, nowMs: number): number | null {
  const ts = r.state?.timestamp ?? null;
  if (ts === null || r.sentAt === null || r.receivedAt === null) return null;
  return Math.max(0, (r.sentAt - ts) * 1000) + Math.max(0, nowMs - r.receivedAt);
}

/** Nachricht übernehmen (veraltete/doppelte Nachrichten werden verworfen; Patch ohne Grundzustand wird ignoriert). */
export function receiveWatchMessage(r: WatchReceiverState, msg: WatchMessage, nowMs: number): WatchReceiverState {
  if (msg.v !== WATCH_PROTOCOL_VERSION) return r;
  if (msg.epoch !== r.epoch) {
    // neuer Sender (App bzw. Seite neu gestartet): nur mit vollständigem Zustand übernehmen
    if (msg.type !== "state") return r;
    r = { ...EMPTY_RECEIVER, epoch: msg.epoch };
  } else if (msg.seq <= r.seq) return r;
  if (msg.type === "heartbeat") return r.state ? { ...r, seq: msg.seq, receivedAt: nowMs, sentAt: msg.sentAt } : r;
  if (msg.type === "patch" && !r.state) return r; // auf vollständigen Zustand warten
  const base: WatchState = r.state ?? { v: WATCH_PROTOCOL_VERSION, roundActive: false, hole: null, par: null, distance: null, approx: false, unit: "m", target: "green_center", front: null, center: null, back: null, gpsAccuracy: null, status: "off", noGreen: false, timestamp: null };
  const state: WatchState = { ...base, ...(msg.data ?? {}), v: WATCH_PROTOCOL_VERSION };
  return { state, epoch: msg.epoch, seq: msg.seq, receivedAt: nowMs, sentAt: msg.sentAt };
}

export type WatchDisplayKind = "NO_ROUND" | "CONNECTION_LOST" | "ACQUIRING" | "NO_GPS" | "NO_GREEN" | "DISTANCE";

export interface WatchDisplay {
  kind: WatchDisplayKind;
  /** „LOCH 7“ */
  hole: string | null;
  /** „PAR 4“ */
  par: string | null;
  /** Zahl ohne Einheit („151“) oder null – nie „0“ */
  distance: string | null;
  approx: boolean;
  unit: "m" | "yd";
  /** „MITTE“ / „FRONT“ / „BACK“ */
  target: string;
  /** Front/Center/Back, wenn vorhanden (Mitte hervorgehoben) */
  rows: { label: string; value: string | null; primary: boolean }[];
  /** „GPS ●“ + „±5 m“ bzw. Statuszeile */
  gps: string;
  /** Farbe der GPS-Zeile zusätzlich zum Text: gut, ungenau, ohne Messung */
  tone: "good" | "poor" | "none";
  /** „vor 1:02 min“ */
  age: string | null;
  /** Hinweis: „GPS-Daten veraltet“ / „nicht aktuell“ / „Verbindung verloren“ / „iPhone prüfen“ */
  notice: string | null;
  /** Zahl abgeblendet darstellen */
  dim: boolean;
  /** Vorlesetext */
  spoken: string;
}

const TARGET_SHORT: Record<WatchTarget, "target.short.green_center" | "target.short.green_front" | "target.short.green_back"> = {
  green_center: "target.short.green_center",
  green_front: "target.short.green_front",
  green_back: "target.short.green_back",
};

/** Was die Watch zeigt – abhängig von Zustand, Verbindung und Alter der Messung. */
export function watchDisplay(r: WatchReceiverState, nowMs: number, locale: GpsLocale = "de"): WatchDisplay {
  const s = r.state;
  const base: WatchDisplay = {
    kind: "NO_ROUND",
    hole: null,
    par: null,
    distance: null,
    approx: false,
    unit: s?.unit ?? "m",
    target: gpsText(TARGET_SHORT[s?.target ?? "green_center"], {}, locale).toUpperCase(),
    rows: [],
    gps: "",
    tone: "none",
    age: null,
    notice: null,
    dim: false,
    spoken: gpsText("watch.noRound", {}, locale),
  };
  if (!s || !s.roundActive || r.receivedAt === null) return { ...base, gps: gpsText("watch.noRound", {}, locale) };

  const hole = s.hole !== null ? gpsText("hole", { n: s.hole }, locale).toUpperCase() : null;
  const par = s.par !== null ? gpsText("par", { par: s.par }, locale).toUpperCase() : null;
  const sinceReceipt = Math.max(0, nowMs - r.receivedAt);
  const lost = sinceReceipt > GPS_CONFIG.watchConnectionLostMs;
  const fixAge = watchFixAge(r, nowMs);
  const value = s.distance !== null && s.distance > 0 ? String(s.distance) : null;
  const shown = (n: number | null) => (n !== null && n > 0 ? String(n) : null);
  const rows =
    s.front !== null || s.back !== null
      ? [
          { label: gpsText("target.short.green_front", {}, locale).toUpperCase(), value: shown(s.front), primary: s.target === "green_front" },
          { label: gpsText("target.short.green_center", {}, locale).toUpperCase(), value: shown(s.center), primary: s.target === "green_center" },
          { label: gpsText("target.short.green_back", {}, locale).toUpperCase(), value: shown(s.back), primary: s.target === "green_back" },
        ]
      : [];
  const gps =
    s.status === "ok" || s.status === "poor"
      ? `${s.status === "poor" ? gpsText("gps.poor", {}, locale) : gpsText("gps.label", {}, locale)} ●${s.gpsAccuracy !== null ? ` ${gpsText("gps.accuracy", { accuracy: s.gpsAccuracy }, locale)}` : ""}`
      : s.status === "acquiring"
        ? gpsText("watch.acquiring", {}, locale)
        : gpsText("watch.noData", {}, locale);
  const ageText = fixAge !== null && (lost || fixAge > GPS_CONFIG.watchShowAgeAfterMs) ? gpsText("watch.age", { age: formatAge(fixAge) }, locale) : null;
  const unitSpoken = gpsText(`unit.spoken.${s.unit}`, {}, locale);
  const targetSpoken = gpsText(`target.spoken.${s.target}`, {}, locale);
  const tone: WatchDisplay["tone"] = s.status === "ok" ? "good" : s.status === "poor" ? "poor" : "none";
  const common = { ...base, hole, par, rows, gps, tone, unit: s.unit };

  if (lost) {
    return {
      ...common,
      kind: "CONNECTION_LOST",
      tone: "none",
      distance: value,
      approx: s.approx,
      age: value ? ageText : null,
      notice: gpsText("watch.connectionLost", {}, locale),
      dim: true,
      spoken: `${gpsText("watch.connectionLost", {}, locale)}${value ? `, ${value} ${unitSpoken}, ${gpsText("watch.notCurrent", {}, locale)}` : ""}`,
    };
  }
  if (s.noGreen) return { ...common, kind: "NO_GREEN", notice: gpsText("watch.noGreen", {}, locale), spoken: gpsText("watch.noGreen", {}, locale) };
  if (value === null) {
    const acquiring = s.status === "acquiring" || s.status === "ok" || s.status === "poor";
    return {
      ...common,
      kind: acquiring ? "ACQUIRING" : "NO_GPS",
      notice: acquiring ? null : gpsText("watch.checkPhone", {}, locale),
      spoken: acquiring ? gpsText("watch.acquiring", {}, locale) : `${gpsText("watch.noData", {}, locale)}, ${gpsText("watch.checkPhone", {}, locale)}`,
    };
  }
  const stale = fixAge !== null && fixAge > GPS_CONFIG.watchStaleAfterMs;
  return {
    ...common,
    kind: "DISTANCE",
    distance: value,
    approx: s.approx,
    age: ageText,
    notice: stale ? gpsText("watch.stale", {}, locale) : null,
    dim: stale,
    tone: stale ? "none" : tone,
    spoken: `${hole ?? ""} ${gpsText(s.approx ? "spoken.approx" : "spoken.distance", { distance: value, unit: unitSpoken, target: targetSpoken }, locale)}${stale ? `, ${gpsText("watch.notCurrent", {}, locale)}` : ""}`.trim(),
  };
}
