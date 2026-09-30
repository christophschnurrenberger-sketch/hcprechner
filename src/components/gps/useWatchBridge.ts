"use client";

import { useEffect, useRef, useState } from "react";
import type { DistanceViewState } from "@/lib/gps/distanceView";
import { NATIVE_COMMAND_EVENT, NATIVE_STATUS_EVENT, nativeWatchTransport, sendNativeContext, SimulatorLink, type RoundContext } from "@/lib/gps/watch/bridge";
import { watchStateFromView, WatchSync, type WatchCommand, type WatchState } from "@/lib/gps/watch/protocol";

const INACTIVE_CONTEXT: RoundContext = { v: 1, roundActive: false, courseId: null, unit: "m", target: "green_center", hole: null, holes: [] };

interface Options {
  view: DistanceViewState;
  /** aktive Runde auf einem Platz mit Grün-Koordinaten */
  roundActive: boolean;
  par: number | null;
  /** Rundenkontext für die iPhone-App (null ohne native Hülle bzw. ohne aktive Runde) */
  context: RoundContext | null;
  onCommand: (command: WatchCommand) => void;
}

/**
 * Überträgt den Entfernungsstand an die Apple Watch (über die iPhone-App) bzw. an die Browser-Vorschau.
 * Es werden nur Änderungen gesendet; ohne Änderung alle 5 s ein Herzschlag. Kein Senden ohne Empfänger.
 */
export function useWatchBridge({ view, roundActive, par, context, onCommand }: Options): { connected: boolean } {
  const [simPresent, setSimPresent] = useState(false);
  const [nativeReachable, setNativeReachable] = useState(false);
  const syncRef = useRef<WatchSync | null>(null);
  const stateRef = useRef<WatchState | null>(null);
  const commandRef = useRef(onCommand);
  useEffect(() => {
    commandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    const native = nativeWatchTransport();
    const sim = new SimulatorLink(
      (command) => commandRef.current(command),
      (present, fresh) => {
        setSimPresent(present);
        // neue Vorschau: vollständigen Zustand senden
        if (fresh && stateRef.current) {
          syncRef.current?.reset();
          syncRef.current?.update(stateRef.current);
        }
      },
    );
    const sync = new WatchSync({
      send(message) {
        native?.send(message);
        sim.send(message);
      },
    });
    syncRef.current = sync;
    const beat = setInterval(() => {
      sync.heartbeat();
      setSimPresent(sim.present());
    }, 1_000);
    const onNativeCommand = (e: Event) => commandRef.current((e as CustomEvent<WatchCommand>).detail);
    const onNativeStatus = (e: Event) => setNativeReachable(Boolean((e as CustomEvent<{ reachable?: boolean }>).detail?.reachable));
    window.addEventListener(NATIVE_COMMAND_EVENT, onNativeCommand);
    window.addEventListener(NATIVE_STATUS_EVENT, onNativeStatus);
    return () => {
      // Runde verlassen: Watch zeigt „Keine aktive Runde“
      if (stateRef.current) sync.update({ ...stateRef.current, roundActive: false, distance: null, front: null, center: null, back: null, timestamp: null });
      clearInterval(beat);
      window.removeEventListener(NATIVE_COMMAND_EVENT, onNativeCommand);
      window.removeEventListener(NATIVE_STATUS_EVENT, onNativeStatus);
      sim.close();
      syncRef.current = null;
    };
  }, []);

  useEffect(() => {
    const state = watchStateFromView(view, { roundActive, par });
    stateRef.current = state;
    syncRef.current?.update(state);
  }, [view, roundActive, par]);

  // Rundenkontext für die iPhone-App; endet die Runde (oder wird sie verlassen), ausdrücklich „keine aktive Runde“
  // melden – dort endet dann auch die native Standortbestimmung.
  const contextKey = context ? JSON.stringify(context) : "";
  const sentContext = useRef(false);
  useEffect(() => {
    if (contextKey) {
      sentContext.current = sendNativeContext(JSON.parse(contextKey) as RoundContext);
    } else if (sentContext.current) {
      sendNativeContext(INACTIVE_CONTEXT);
      sentContext.current = false;
    }
  }, [contextKey]);
  useEffect(
    () => () => {
      if (sentContext.current) sendNativeContext(INACTIVE_CONTEXT);
    },
    [],
  );

  return { connected: simPresent || nativeReachable };
}
