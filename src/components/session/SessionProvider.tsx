"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, type MeResponse } from "@/lib/api/client";
import { onSessionLost } from "@/lib/api/transport";
import type { PublicSettings, SessionUser } from "@/lib/api/types";
import type { Permission } from "@/lib/auth/permissions";

const DEFAULT_SETTINGS: PublicSettings = {
  siteName: "Golf HCP Rechner",
  registrationOpen: true,
  emailVerificationRequired: true,
  imprintText: null,
  privacyText: null,
  contactEmail: null,
};

interface SessionState {
  /** loggedOut: gerade abgemeldet – Bereiche leiten dann nicht selbst um (die Abmeldung navigiert). */
  status: "loading" | "ready" | "error" | "loggedOut";
  user: SessionUser | null;
  settings: PublicSettings;
  installed: boolean;
  appVersion: string | null;
  error: string | null;
}

interface SessionContextValue extends SessionState {
  /** Rolle/Rechte stammen aus der Antwort des Backends – die Oberfläche blendet damit nur Elemente ein. */
  can: (permission: Permission) => boolean;
  refresh: () => Promise<MeResponse | null>;
  setUser: (user: SessionUser | null) => void;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const PROTECTED = /^\/(member|admin)(\/|$)/;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading", user: null, settings: DEFAULT_SETTINGS, installed: true, appVersion: null, error: null });
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const refresh = useCallback(async () => {
    try {
      const res = await api.auth.me();
      setState({ status: "ready", user: res.user, settings: res.settings ?? DEFAULT_SETTINGS, installed: res.installed, appVersion: res.appVersion ?? null, error: null });
      return res;
    } catch (error) {
      setState((s) => ({ ...s, status: "error", error: error instanceof Error ? error.message : "Fehler" }));
      return null;
    }
  }, []);

  useEffect(() => {
    // Initiales Laden der Sitzung (externer Zustand → React-Zustand)
    void refresh();
  }, [refresh]);

  useEffect(
    () =>
      onSessionLost((code) => {
        setState((s) => ({ ...s, user: null }));
        const path = pathRef.current ?? "/";
        if (PROTECTED.test(path)) {
          const reason = code === "ACCOUNT_DISABLED" ? "disabled" : code === "ACCOUNT_LOCKED" ? "locked" : "expired";
          const next = typeof window !== "undefined" ? window.location.pathname.replace(/^.*?(\/(member|admin)(\/|$))/, "$1") + window.location.search : path;
          router.replace(`/login?${reason}=1&next=${encodeURIComponent(next)}`);
        }
      }),
    [router],
  );

  /** Benutzer nach Anmeldung/Profiländerung setzen; null = abgemeldet (z. B. nach Kontolöschung). */
  const setUser = useCallback((user: SessionUser | null) => setState((s) => ({ ...s, user, status: user ? "ready" : "loggedOut" })), []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setState((s) => ({ ...s, user: null, status: "loggedOut" }));
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ ...state, can: (p) => Boolean(state.user?.permissions.includes(p)), refresh, setUser, logout }),
    [state, refresh, setUser, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession außerhalb von SessionProvider");
  return ctx;
}
