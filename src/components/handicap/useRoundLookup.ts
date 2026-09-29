"use client";

import { useMemo } from "react";
import type { Round, RoundResult } from "@/lib/whs/types";
import { useHcp } from "@/components/providers/HcpStoreProvider";

export function useRoundLookup() {
  const { rounds, result } = useHcp();
  return useMemo(() => {
    const roundsById = new Map<string, Round>(rounds.map((r) => [r.id, r]));
    const resultsById = new Map<string, RoundResult>(result.rounds.map((r) => [r.roundId, r]));
    return { roundsById, resultsById };
  }, [rounds, result]);
}
