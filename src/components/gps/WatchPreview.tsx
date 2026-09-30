"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Crosshair } from "lucide-react";
import { SIMULATOR_CHANNEL, type SimulatorMessage } from "@/lib/gps/watch/bridge";
import { EMPTY_RECEIVER, receiveWatchMessage, watchDisplay, type WatchCommand, type WatchDisplay, type WatchReceiverState, type WatchTarget } from "@/lib/gps/watch/protocol";
import { cn } from "@/lib/format";
import { Card, CardBody, PageHeader } from "@/components/ui";

/** Displaygrößen in Punkten: kleinste (40 mm) und größte (49 mm) Apple Watch. */
const SIZES = [
  { label: "40 mm", width: 162, height: 197 },
  { label: "49 mm", width: 205, height: 251 },
] as const;

const TARGETS: WatchTarget[] = ["green_center", "green_front", "green_back"];

/**
 * Vorschau der Apple-Watch-Anzeige im Browser (Entwicklung und Test). Die echte Anzeige kommt aus der
 * watchOS-App (native/apple); diese Seite empfängt dieselben Protokollnachrichten von einer laufenden Runde
 * in einem anderen Tab dieses Browsers (BroadcastChannel – keine Übertragung über das Netz).
 */
export function WatchPreviewPage() {
  const [receiver, setReceiver] = useState<WatchReceiverState>(EMPTY_RECEIVER);
  const [now, setNow] = useState(() => Date.now());
  const [target, setTarget] = useState<WatchTarget>("green_center");
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(SIMULATOR_CHANNEL);
    channel.current = ch;
    const hello = () => ch.postMessage({ kind: "hello" } satisfies SimulatorMessage);
    ch.onmessage = (event: MessageEvent<SimulatorMessage | { kind: "hello-request" }>) => {
      const msg = event.data;
      if (msg?.kind === "hello-request") hello();
      if (msg?.kind === "watch") setReceiver((r) => receiveWatchMessage(r, msg.message, Date.now()));
    };
    hello();
    const presence = setInterval(hello, 4_000);
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    const bye = () => ch.postMessage({ kind: "bye" } satisfies SimulatorMessage);
    window.addEventListener("pagehide", bye);
    return () => {
      bye();
      window.removeEventListener("pagehide", bye);
      clearInterval(presence);
      clearInterval(tick);
      ch.close();
      channel.current = null;
    };
  }, []);

  const send = (command: WatchCommand) => channel.current?.postMessage({ kind: "command", command } satisfies SimulatorMessage);
  const display = watchDisplay(receiver, now);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Apple-Watch-Vorschau"
        description="Zeigt, was die Watch während der Runde anzeigt. Die echte Anzeige kommt aus der watchOS-App (iPhone-App + Watch-App, siehe Dokumentation); diese Seite empfängt dieselben Daten von einer laufenden Runde in einem anderen Tab dieses Browsers."
      />
      <div className="flex flex-wrap items-start justify-center gap-8" data-watch-preview>
        {SIZES.map((size) => (
          <figure key={size.label} className="flex flex-col items-center gap-2">
            <WatchFace display={display} width={size.width} height={size.height} />
            <figcaption className="text-xs text-ink-3">{size.label}</figcaption>
          </figure>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => send({ type: "hole", delta: -1 })} className="inline-flex h-11 items-center gap-1 rounded-xl border border-border-strong bg-surface px-4 text-sm font-semibold">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Loch
        </button>
        <button
          type="button"
          onClick={() => {
            const next = TARGETS[(TARGETS.indexOf(target) + 1) % TARGETS.length];
            setTarget(next);
            send({ type: "target", target: next });
          }}
          className="inline-flex h-11 items-center gap-1 rounded-xl border border-border-strong bg-surface px-4 text-sm font-semibold"
        >
          <Crosshair className="h-4 w-4" aria-hidden /> Ziel
        </button>
        <button type="button" onClick={() => send({ type: "hole", delta: 1 })} className="inline-flex h-11 items-center gap-1 rounded-xl border border-border-strong bg-surface px-4 text-sm font-semibold">
          Loch <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <Card>
        <CardBody className="space-y-1 text-sm text-ink-2">
          <p>
            <strong>So testen:</strong> Runde auf dem Smartphone bzw. in einem zweiten Tab starten (Platz mit GPS-Gründaten) – die Vorschau zeigt Loch, Entfernung, Ziel und
            GPS-Status. Tab der Runde schließen → nach 15 s „Verbindung verloren“ mit Alter der letzten Entfernung.
          </p>
          <p className="text-ink-3">Übertragen werden nur Loch, Par, Entfernung, Ziel, GPS-Genauigkeit, Status und Zeitpunkt – keine Scorecard- oder Kontodaten.</p>
        </CardBody>
      </Card>
    </div>
  );
}

/** Watch-Zifferblatt: reduziert auf Loch, Entfernung, Ziel, GPS – gleiche Anordnung wie die watchOS-App. */
export function WatchFace({ display, width, height }: { display: WatchDisplay; width: number; height: number }) {
  const scale = width / 184;
  return (
    <div
      role="img"
      aria-label={display.spoken}
      className="relative flex flex-col items-center justify-center overflow-hidden bg-black text-center text-white shadow-xl ring-8 ring-neutral-800"
      style={{ width, height, borderRadius: 36 * scale, padding: 10 * scale }}
      data-watch-kind={display.kind}
    >
      {display.hole && (
        <p className="font-bold tracking-[0.12em] text-white/80" style={{ fontSize: 15 * scale }}>
          {display.hole}
          {display.par && <span className="ml-2 font-semibold text-white/55">{display.par}</span>}
        </p>
      )}
      {display.kind === "NO_ROUND" ? (
        <p className="font-semibold" style={{ fontSize: 17 * scale }}>
          {display.gps}
        </p>
      ) : display.rows.length > 0 && display.kind !== "CONNECTION_LOST" && display.distance ? (
        <div className={cn("mt-1 w-full space-y-0.5", display.dim && "opacity-45")}>
          {display.rows.map((row) => (
            <div key={row.label} className={cn("flex items-baseline justify-between rounded-lg px-2", row.primary && "bg-emerald-500/25")}>
              <span className="font-semibold tracking-wider text-white/70" style={{ fontSize: 11 * scale }}>
                {row.label}
              </span>
              <span className="tabular font-extrabold" style={{ fontSize: (row.primary ? 30 : 20) * scale }}>
                {row.value ?? "—"}
                <span className="ml-0.5 font-bold text-white/70" style={{ fontSize: 11 * scale }}>
                  {display.unit}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : display.distance ? (
        <>
          <p className={cn("tabular font-black leading-none", display.dim && "opacity-45")} style={{ fontSize: 58 * scale, marginTop: 4 * scale }}>
            {display.approx && <span style={{ fontSize: 28 * scale }}>≈</span>}
            {display.distance}
            <span className="font-extrabold text-white/80" style={{ fontSize: 20 * scale }}>
              {display.unit}
            </span>
          </p>
          <p className="font-bold tracking-[0.18em] text-white/75" style={{ fontSize: 13 * scale, marginTop: 4 * scale }}>
            {display.target}
          </p>
        </>
      ) : (
        <p className="font-semibold text-white/90" style={{ fontSize: 16 * scale, marginTop: 8 * scale }}>
          {display.kind === "ACQUIRING" ? display.gps : display.notice ?? display.gps}
        </p>
      )}
      {display.kind !== "NO_ROUND" && (
        <p className={cn("font-semibold", display.tone === "good" ? "text-emerald-400" : display.tone === "poor" ? "text-amber-400" : "text-white/60")} style={{ fontSize: 12 * scale, marginTop: 6 * scale }}>
          {display.kind === "ACQUIRING" ? null : display.gps}
        </p>
      )}
      {display.notice && display.distance && (
        <p className="whitespace-nowrap font-semibold text-amber-300" style={{ fontSize: 11 * scale }}>
          {display.notice}
        </p>
      )}
      {display.age && (
        <p className="whitespace-nowrap font-semibold text-amber-300" style={{ fontSize: 11 * scale }}>
          {display.age}
        </p>
      )}
      {display.kind === "NO_GPS" && display.notice && (
        <p className="text-white/70" style={{ fontSize: 11 * scale }}>
          {display.notice}
        </p>
      )}
    </div>
  );
}
