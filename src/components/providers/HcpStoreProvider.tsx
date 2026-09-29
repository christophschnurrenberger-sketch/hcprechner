"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { calculateScoringRecord } from "@/lib/whs/scoringRecord";
import type { PlayerProfile, Round, ScoringRecordResult } from "@/lib/whs/types";
import {
  EXAMPLE_PREFIX,
  STORAGE_KEY,
  countStoredRounds,
  emptyData,
  exampleRounds,
  isDirty,
  loadData,
  nextSequence,
  removeData,
  saveData,
  setDirty,
} from "@/lib/store/localStore";
import type { AppSettings, StoredData } from "@/lib/store/schema";
import { AccountApiError, accountApi } from "@/lib/account/client";
import { UserDataSyncEngine } from "@/lib/account/syncEngine";
import { fromUserPayload, mergeUserData, userStorageKey } from "@/lib/account/userData";
import { useAccount } from "./AccountProvider";

/** Speicherort der Daten: nur im Browser (Local Mode) oder im Benutzerkonto auf dem Server. */
export type SyncStatus =
  | { mode: "local" }
  | { mode: "account"; state: "loading" | "saving" | "saved" | "error"; message?: string; lastSavedAt?: string | null };

interface HcpStore {
  ready: boolean;
  data: StoredData;
  profile: PlayerProfile;
  rounds: Round[];
  settings: AppSettings;
  result: ScoringRecordResult;
  storageOk: boolean;
  sync: SyncStatus;
  /** Runden, die ohne Anmeldung in diesem Browser gespeichert sind (für die Übernahme ins Konto). */
  anonymousRounds: number;
  saveRound: (round: Round) => void;
  deleteRound: (id: string) => void;
  updateProfile: (patch: Partial<PlayerProfile>) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  replaceAll: (data: StoredData) => void;
  resetAll: () => void;
  loadExampleData: () => void;
  removeExampleData: () => void;
  /** Übernimmt die Runden aus dem Local Mode dieses Browsers in das angemeldete Konto. */
  importAnonymousData: () => void;
  /** Wartet, bis ausstehende Änderungen auf dem Server gespeichert sind (z. B. vor dem Abmelden). */
  flushSync: () => Promise<void>;
  hasExampleData: boolean;
}

const Ctx = createContext<HcpStore | null>(null);

export function HcpStoreProvider({ children }: { children: ReactNode }) {
  const { state: account, csrf, sessionExpired } = useAccount();
  const userId = account.status === "authenticated" ? account.user.id : null;
  const [data, setData] = useState<StoredData>(() => emptyData());
  const [ready, setReady] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [sync, setSync] = useState<SyncStatus>({ mode: "local" });
  const [anonymousRounds, setAnonymousRounds] = useState(0);

  const keyRef = useRef(STORAGE_KEY);
  const dataRef = useRef<StoredData>(data);
  const csrfRef = useRef<string | null>(csrf);
  const engineRef = useRef<UserDataSyncEngine | null>(null);

  useEffect(() => {
    csrfRef.current = csrf;
  }, [csrf]);

  const apply = useCallback((next: StoredData) => {
    dataRef.current = next;
    setData(next);
    setStorageOk(saveData(next, keyRef.current));
  }, []);

  const flushSync = useCallback(async () => {
    await engineRef.current?.flush();
  }, []);

  // ---------------------------------------------------------------------------
  // Laden: Local Mode oder Benutzerkonto
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (account.status === "loading") return;
    let cancelled = false;
    const previousKey = keyRef.current;
    const key = userId ? userStorageKey(STORAGE_KEY, userId) : STORAGE_KEY;
    engineRef.current?.dispose();
    engineRef.current = null;
    // Nach dem Abmelden den Zwischenspeicher des Kontos entfernen (gemeinsam genutzte Geräte) –
    // außer er enthält noch nicht gespeicherte Änderungen (werden bei der nächsten Anmeldung übernommen).
    if (previousKey !== key && previousKey !== STORAGE_KEY && !isDirty(previousKey)) removeData(previousKey);
    keyRef.current = key;

    /* eslint-disable react-hooks/set-state-in-effect -- Laden aus dem Browser-Speicher bzw. vom Server nach der Hydration */
    if (!userId) {
      const local = loadData(STORAGE_KEY);
      dataRef.current = local;
      setData(local);
      setSync({ mode: "local" });
      setAnonymousRounds(0);
      setReady(true);
    } else {
      setReady(false);
      setSync({ mode: "account", state: "loading" });
      setAnonymousRounds(countStoredRounds(STORAGE_KEY));
      const startEngine = (revision: number) => {
        const engine = new UserDataSyncEngine({
          revision,
          getData: () => dataRef.current,
          apply,
          save: (base, payload) => accountApi.saveData(csrfRef.current, base, payload),
          setDirty: (dirty) => setDirty(key, dirty),
          onStatus: (status) => setSync({ mode: "account", ...status }),
          onUnauthorized: sessionExpired,
        });
        engineRef.current = engine;
        return engine;
      };
      accountApi
        .loadData(csrfRef.current)
        .then((res) => {
          if (cancelled) return;
          const engine = startEngine(res.revision);
          const server = res.data ? fromUserPayload(res.data) : null;
          if (isDirty(key)) {
            // Nicht gespeicherte Änderungen dieses Geräts mit dem Serverstand zusammenführen
            const pending = loadData(key);
            apply(server ? mergeUserData(pending, server) : pending);
            engine.schedule();
          } else {
            apply(server ?? emptyData());
            setSync({ mode: "account", state: "saved", lastSavedAt: res.updatedAt });
          }
          setReady(true);
        })
        .catch((error) => {
          if (cancelled) return;
          if (error instanceof AccountApiError && error.status === 401) {
            sessionExpired();
            return;
          }
          apply(loadData(key));
          setSync({ mode: "account", state: "error", message: "Server nicht erreichbar – angezeigt werden die zuletzt auf diesem Gerät gespeicherten Daten. Änderungen bitte erst nach erneutem Laden erfassen." });
          setReady(true);
        });
    }
    /* eslint-enable react-hooks/set-state-in-effect */

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && keyRef.current === STORAGE_KEY) {
        const next = loadData(STORAGE_KEY);
        dataRef.current = next;
        setData(next);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, [account.status, userId, apply, sessionExpired]);

  // ---------------------------------------------------------------------------
  // Änderungen
  // ---------------------------------------------------------------------------

  const commit = useCallback(
    (updater: (prev: StoredData) => StoredData) => {
      const next = { ...updater(dataRef.current), updatedAt: new Date().toISOString() };
      apply(next);
      engineRef.current?.schedule();
    },
    [apply],
  );

  const saveRound = useCallback(
    (round: Round) =>
      commit((prev) => {
        const exists = prev.rounds.some((r) => r.id === round.id);
        const previous = prev.rounds.find((r) => r.id === round.id);
        const dateChanged = previous && previous.date !== round.date;
        const sequence = !exists || dateChanged ? nextSequence(prev.rounds, round.date, round.id) : round.sequence;
        const stored = { ...round, sequence, updatedAt: new Date().toISOString() };
        return {
          ...prev,
          rounds: exists ? prev.rounds.map((r) => (r.id === round.id ? stored : r)) : [...prev.rounds, stored],
        };
      }),
    [commit],
  );

  const deleteRound = useCallback(
    (id: string) => commit((prev) => ({ ...prev, rounds: prev.rounds.filter((r) => r.id !== id) })),
    [commit],
  );

  const updateProfile = useCallback(
    (patch: Partial<PlayerProfile>) => commit((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } })),
    [commit],
  );

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => commit((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } })),
    [commit],
  );

  const replaceAll = useCallback((next: StoredData) => commit(() => next), [commit]);
  const resetAll = useCallback(() => commit(() => emptyData()), [commit]);

  const loadExampleData = useCallback(
    () =>
      commit((prev) => ({
        ...prev,
        profile: prev.rounds.length === 0 ? { ...prev.profile, startHandicapIndex: 36.0 } : prev.profile,
        rounds: [...prev.rounds.filter((r) => !r.id.startsWith(EXAMPLE_PREFIX)), ...exampleRounds()],
      })),
    [commit],
  );

  const removeExampleData = useCallback(
    () => commit((prev) => ({ ...prev, rounds: prev.rounds.filter((r) => !r.id.startsWith(EXAMPLE_PREFIX)) })),
    [commit],
  );

  const importAnonymousData = useCallback(() => {
    const local = loadData(STORAGE_KEY);
    commit((prev) => {
      // Leeres Konto: auch das Spielerprofil (Start-HCPI, Geschlecht) übernehmen
      const base = prev.rounds.length === 0 ? { ...prev, profile: local.profile } : prev;
      return mergeUserData(base, { ...prev, rounds: local.rounds });
    });
  }, [commit]);

  const result = useMemo(() => calculateScoringRecord(data.profile, data.rounds), [data.profile, data.rounds]);

  const value = useMemo<HcpStore>(
    () => ({
      ready,
      data,
      profile: data.profile,
      rounds: data.rounds,
      settings: data.settings,
      result,
      storageOk,
      sync,
      anonymousRounds,
      saveRound,
      deleteRound,
      updateProfile,
      updateSettings,
      replaceAll,
      resetAll,
      loadExampleData,
      removeExampleData,
      importAnonymousData,
      flushSync,
      hasExampleData: data.rounds.some((r) => r.id.startsWith(EXAMPLE_PREFIX)),
    }),
    [
      ready,
      data,
      result,
      storageOk,
      sync,
      anonymousRounds,
      saveRound,
      deleteRound,
      updateProfile,
      updateSettings,
      replaceAll,
      resetAll,
      loadExampleData,
      removeExampleData,
      importAnonymousData,
      flushSync,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHcp(): HcpStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useHcp muss innerhalb von HcpStoreProvider verwendet werden");
  return ctx;
}
