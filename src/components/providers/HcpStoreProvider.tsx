"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { calculateScoringRecord } from "@/lib/whs/scoringRecord";
import type { PlayerProfile, Round, ScoringRecordResult } from "@/lib/whs/types";
import {
  EXAMPLE_PREFIX,
  STORAGE_KEY,
  emptyData,
  exampleRounds,
  loadData,
  nextSequence,
  saveData,
} from "@/lib/store/localStore";
import type { AppSettings, StoredData } from "@/lib/store/schema";

interface HcpStore {
  ready: boolean;
  data: StoredData;
  profile: PlayerProfile;
  rounds: Round[];
  settings: AppSettings;
  result: ScoringRecordResult;
  storageOk: boolean;
  saveRound: (round: Round) => void;
  deleteRound: (id: string) => void;
  updateProfile: (patch: Partial<PlayerProfile>) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  replaceAll: (data: StoredData) => void;
  resetAll: () => void;
  loadExampleData: () => void;
  removeExampleData: () => void;
  hasExampleData: boolean;
}

const Ctx = createContext<HcpStore | null>(null);

export function HcpStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StoredData>(() => emptyData());
  const [ready, setReady] = useState(false);
  const [storageOk, setStorageOk] = useState(true);

  useEffect(() => {
    // Laden aus dem Browser-Speicher nach der Hydration (Local Mode)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(loadData());
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setData(loadData());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const commit = useCallback((updater: (prev: StoredData) => StoredData) => {
    setData((prev) => {
      const next = { ...updater(prev), updatedAt: new Date().toISOString() };
      setStorageOk(saveData(next));
      return next;
    });
  }, []);

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
      saveRound,
      deleteRound,
      updateProfile,
      updateSettings,
      replaceAll,
      resetAll,
      loadExampleData,
      removeExampleData,
      hasExampleData: data.rounds.some((r) => r.id.startsWith(EXAMPLE_PREFIX)),
    }),
    [ready, data, result, storageOk, saveRound, deleteRound, updateProfile, updateSettings, replaceAll, resetAll, loadExampleData, removeExampleData],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHcp(): HcpStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useHcp muss innerhalb von HcpStoreProvider verwendet werden");
  return ctx;
}
