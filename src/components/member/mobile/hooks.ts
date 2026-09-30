"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { draftLabel } from "@/components/member/wizard/wizardState";
import { parseLocalDraft, readLocalDraftRaw, saveLocalDraft, type LocalRoundDraft } from "./localDraft";

// ---------------------------------------------------------------------------
// Mobile oder Desktop?
// ---------------------------------------------------------------------------

/**
 * Smartphone oder Tablet im Hochformat → mobile Scorecard; Desktop und Tablet quer → bisherige Eingabe.
 * `null` vor dem ersten Rendern im Browser (statischer Export kennt das Gerät nicht).
 */
const MOBILE_QUERY = "(max-width: 767px), (max-width: 1100px) and (orientation: portrait) and (pointer: coarse)";

function subscribeMedia(cb: () => void) {
  const m = window.matchMedia(MOBILE_QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

export function useMobileEntry(): boolean | null {
  return useSyncExternalStore(
    subscribeMedia,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => null,
  );
}

// ---------------------------------------------------------------------------
// Verbindung, Wake Lock, Haptik
// ---------------------------------------------------------------------------

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/** Bildschirm während einer laufenden Runde anlassen (wo der Browser es kann; sonst still ignoriert). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const request = async () => {
      try {
        if (!stopped && document.visibilityState === "visible") lock = await navigator.wakeLock.request("screen");
      } catch {
        /* nicht erlaubt (z. B. Energiesparmodus) – kein Fehler für den Nutzer */
      }
    };
    void request();
    const onVisible = () => void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => undefined);
    };
  }, [active]);
}

/** Leichte haptische Rückmeldung (Android); iOS-Browser unterstützen das nicht – dann passiert nichts. */
export function haptic(ms = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* nicht unterstützt */
  }
}

export function isNetworkError(e: unknown): boolean {
  return (e instanceof ApiError && e.code === "NETWORK") || (typeof navigator !== "undefined" && !navigator.onLine);
}

// ---------------------------------------------------------------------------
// Automatisches Speichern: sofort auf dem Gerät, kurz danach als Entwurf auf dem Server
// ---------------------------------------------------------------------------

export type SyncState = "saved" | "saving" | "offline" | "local";

/**
 * Jede Eingabe landet sofort im lokalen Entwurf. Der Server-Entwurf folgt nach kurzer Pause; ohne Verbindung
 * bleibt die Runde lokal und wird bei der nächsten Verbindung nachgereicht. Nach `finalize()` (Runde
 * gespeichert oder verworfen) werden keine Entwürfe mehr geschrieben.
 */
export function useDraftAutosave(draft: LocalRoundDraft | null) {
  const [sync, setSync] = useState<SyncState>("saved");
  const [attempt, setAttempt] = useState(0);
  const finalized = useRef(false);
  const latest = useRef<LocalRoundDraft | null>(draft);
  const lastSent = useRef<string | null>(null);

  const push = useCallback(async (): Promise<boolean> => {
    const d = latest.current;
    if (!d || finalized.current) return true;
    const body = JSON.stringify([d.state, d.mode, d.pos]);
    if (body === lastSent.current) {
      setSync("saved");
      return true;
    }
    setSync("saving");
    try {
      await api.member.saveDraft({ id: d.draftId, label: draftLabel(d.state), input: { wizard: d.state, step: d.state.step, mobile: { mode: d.mode, pos: d.pos } } });
      if (finalized.current) return true;
      lastSent.current = body;
      setSync("saved");
      return true;
    } catch (e) {
      if (!finalized.current) setSync(isNetworkError(e) ? "offline" : "local");
      return false;
    }
  }, []);

  useEffect(() => {
    latest.current = draft;
    if (!draft || finalized.current) return;
    const localOk = saveLocalDraft({ ...draft, updatedAt: new Date().toISOString() });
    const t = setTimeout(() => {
      if (!localOk) setSync("local");
      void push();
    }, 900);
    return () => clearTimeout(t);
  }, [draft, push, attempt]);

  // Verbindung wieder da → nachreichen
  useEffect(() => {
    const retry = () => setAttempt((n) => n + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);

  const finalize = useCallback(() => {
    finalized.current = true;
  }, []);

  return { sync, flush: push, finalize };
}

// ---------------------------------------------------------------------------
// Laufende Runde auf diesem Gerät (Dashboard, Wiederaufnahme)
// ---------------------------------------------------------------------------

function subscribeDraft(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("hcp-local-draft", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("hcp-local-draft", cb);
  };
}

export function useLocalActiveRound(userId: string | null | undefined): LocalRoundDraft | null {
  const raw = useSyncExternalStore(subscribeDraft, () => (userId ? readLocalDraftRaw(userId) : null), () => null);
  return useMemo(() => (userId ? parseLocalDraft(raw, userId) : null), [raw, userId]);
}
