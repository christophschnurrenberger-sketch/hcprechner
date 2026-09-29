"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ApiState<T> {
  data: T | undefined;
  error: unknown;
  /** true, solange die Anfrage für den aktuellen Schlüssel läuft (vorherige Daten bleiben sichtbar) */
  loading: boolean;
  reload: () => void;
  /** Lokale Aktualisierung nach einer Änderung (ohne neue Anfrage) */
  setData: (data: T) => void;
}

/**
 * Lädt Daten über den API-Adapter. `key` beschreibt die Parameter (z. B. Filter) – ändert er sich,
 * wird neu geladen. Fehler werden als Zustand geliefert (Anzeige mit ErrorState).
 */
export function useApi<T>(load: () => Promise<T>, key: string = ""): ApiState<T> {
  const loadRef = useRef(load);
  const [version, setVersion] = useState(0);
  const requestKey = `${key}#${version}`;
  const [state, setState] = useState<{ key: string | null; data: T | undefined; error: unknown }>({ key: null, data: undefined, error: undefined });

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let alive = true;
    loadRef.current().then(
      (data) => alive && setState({ key: requestKey, data, error: undefined }),
      (error) => alive && setState((s) => ({ key: requestKey, data: s.data, error })),
    );
    return () => {
      alive = false;
    };
  }, [requestKey]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((data: T) => setState((s) => ({ ...s, data, error: undefined })), []);

  return { data: state.data, error: state.key === requestKey ? state.error : undefined, loading: state.key !== requestKey, reload, setData };
}
