"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { accountApi } from "@/lib/account/client";
import type { AccountUser } from "@/lib/account/types";

export type AccountState =
  | { status: "loading"; user: null }
  | { status: "unavailable"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: AccountUser };

interface AccountContextValue {
  state: AccountState;
  csrf: string | null;
  login: (username: string, password: string) => Promise<AccountUser>;
  /** Nur die Sitzung beenden – ausstehende Speichervorgänge vorher mit useHcp().flushSync() abschließen. */
  logout: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  /** Sitzung abgelaufen (HTTP 401 beim Speichern): lokal abmelden. */
  sessionExpired: () => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

/** Benutzerkonto (vom Admin angelegter Zugang). Ohne Anmeldung bleibt alles im Local Mode. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountState>({ status: "loading", user: null });
  const [csrf, setCsrf] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    accountApi
      .status()
      .then((s) => {
        if (cancelled) return;
        setCsrf(s.csrf);
        setState(!s.enabled ? { status: "unavailable", user: null } : s.user ? { status: "authenticated", user: s.user } : { status: "anonymous", user: null });
      })
      .catch(() => !cancelled && setState({ status: "unavailable", user: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await accountApi.login(username, password);
    setCsrf(res.csrf);
    setState({ status: "authenticated", user: res.user });
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await accountApi.logout(csrf);
    } finally {
      setCsrf(null);
      setState({ status: "anonymous", user: null });
    }
  }, [csrf]);

  const changePassword = useCallback(
    async (current: string, next: string) => {
      const res = await accountApi.changePassword(csrf, current, next);
      // Das CSRF-Token ist an den Passwortstand gebunden (Webspace-Edition) → neues Token übernehmen
      if (res.csrf !== undefined) setCsrf(res.csrf);
      setState({ status: "authenticated", user: res.user });
    },
    [csrf],
  );

  const sessionExpired = useCallback(() => {
    setCsrf(null);
    setState({ status: "anonymous", user: null });
  }, []);

  const value = useMemo(() => ({ state, csrf, login, logout, changePassword, sessionExpired }), [state, csrf, login, logout, changePassword, sessionExpired]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount muss innerhalb von AccountProvider verwendet werden");
  return ctx;
}
