/**
 * Verbindung zur Apple Watch aus der Web-App heraus.
 *
 * - In der iPhone-App (native/apple, WKWebView): Nachrichten an den nativen Teil (`webkit.messageHandlers.hcpWatch`),
 *   der sie per WatchConnectivity an die Watch weitergibt und bei gesperrtem iPhone selbst weiterrechnet
 *   (dafür erhält er den Rundenkontext: Löcher mit Grün-Koordinaten – nie Konto- oder Scorecard-Daten).
 * - Im Browser gibt es keine Watch-Verbindung. Zum Testen zeigt /member/watch/ eine Vorschau der Watch-Anzeige,
 *   die dieselben Nachrichten über einen BroadcastChannel (nur gleicher Browser) empfängt.
 */
import type { GeoPoint } from "@/lib/courses/types";
import type { WatchCommand, WatchMessage, WatchTarget, WatchTransport } from "./protocol";

export const SIMULATOR_CHANNEL = "hcp-watch-sim-v1";
/** Vorschau gilt als verbunden, solange sie sich in diesem Abstand meldet (ms). */
export const SIMULATOR_PRESENCE_MS = 12_000;

/** Rundenkontext für die iPhone-App (native Entfernungsberechnung bei gesperrtem Bildschirm). */
export interface RoundContext {
  v: 1;
  roundActive: boolean;
  courseId: string | null;
  unit: "m" | "yd";
  target: WatchTarget;
  /** Loch der Entfernungsansicht */
  hole: number | null;
  holes: { number: number; par: number | null; green: { front: GeoPoint | null; center: GeoPoint | null; back: GeoPoint | null } | null }[];
}

export type SimulatorMessage = { kind: "hello" } | { kind: "bye" } | { kind: "command"; command: WatchCommand } | { kind: "watch"; message: WatchMessage };

interface NativeHandler {
  postMessage(message: unknown): void;
}

function nativeHandler(): NativeHandler | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { webkit?: { messageHandlers?: Record<string, NativeHandler | undefined> } };
  return w.webkit?.messageHandlers?.hcpWatch ?? null;
}

/** Läuft die Web-App in der iPhone-App mit Watch-Anbindung? */
export function hasNativeWatchBridge(): boolean {
  return nativeHandler() !== null;
}

export function nativeWatchTransport(): WatchTransport | null {
  const handler = nativeHandler();
  return handler ? { send: (message) => handler.postMessage({ kind: "watch", message }) } : null;
}

export function sendNativeContext(context: RoundContext): boolean {
  const handler = nativeHandler();
  if (!handler) return false;
  handler.postMessage({ kind: "context", context });
  return true;
}

/** Ereignisse der iPhone-App an die Web-App (per evaluateJavaScript ausgelöst). */
export const NATIVE_COMMAND_EVENT = "hcp-watch-command";
export const NATIVE_STATUS_EVENT = "hcp-watch-status";

/**
 * Browser-Vorschau: Die Runde (Sender) schickt nur, solange eine Vorschau geöffnet ist und sich meldet.
 */
export class SimulatorLink implements WatchTransport {
  private channel: BroadcastChannel | null = null;
  private lastHello = 0;

  constructor(
    private readonly onCommand: (command: WatchCommand) => void,
    private readonly onPresence: (present: boolean, fresh: boolean) => void,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (typeof BroadcastChannel === "undefined") return;
    this.channel = new BroadcastChannel(SIMULATOR_CHANNEL);
    this.channel.onmessage = (event: MessageEvent<SimulatorMessage>) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.kind === "hello") {
        const fresh = !this.present();
        this.lastHello = this.now();
        this.onPresence(true, fresh);
      } else if (msg.kind === "bye") {
        this.lastHello = 0;
        this.onPresence(false, false);
      } else if (msg.kind === "command") this.onCommand(msg.command);
    };
    // vorhandene Vorschau-Fenster sollen sich sofort melden
    this.channel.postMessage({ kind: "hello-request" });
  }

  present(): boolean {
    return this.lastHello > 0 && this.now() - this.lastHello <= SIMULATOR_PRESENCE_MS;
  }

  send(message: WatchMessage): void {
    if (this.present()) this.channel?.postMessage({ kind: "watch", message } satisfies SimulatorMessage);
  }

  close(): void {
    this.channel?.close();
    this.channel = null;
  }
}
