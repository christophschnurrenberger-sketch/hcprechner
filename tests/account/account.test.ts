import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountApiError } from "@/lib/account/client";
import { UserDataSyncEngine, type AccountSyncState } from "@/lib/account/syncEngine";
import { generatePassword, normalizeUsername, validateDisplayName, validatePassword, validateUsername } from "@/lib/account/types";
import { fromUserPayload, mergeUserData, toUserPayload, userStorageKey } from "@/lib/account/userData";
import { emptyData, exampleRounds } from "@/lib/store/localStore";
import type { StoredData } from "@/lib/store/schema";
import type { Round } from "@/lib/whs/types";

function round(id: string, date: string, updatedAt: string, title = id): Round {
  const base = exampleRounds("2026-09-01")[0];
  return { ...base, id, date, title, updatedAt, createdAt: updatedAt };
}

function withRounds(rounds: Round[], startHandicapIndex = 54): StoredData {
  const d = emptyData();
  return { ...d, profile: { ...d.profile, startHandicapIndex }, rounds };
}

describe("Benutzerkonten: Regeln", () => {
  it("Benutzername: normalisiert und geprüft", () => {
    expect(normalizeUsername("  Max.Muster ")).toBe("max.muster");
    expect(validateUsername("Max.Muster")).toBeNull();
    expect(validateUsername("ab")).not.toBeNull();
    expect(validateUsername("max muster")).not.toBeNull();
    expect(validateUsername(".max")).not.toBeNull();
    expect(validateUsername("märz")).not.toBeNull();
  });

  it("Passwort mindestens 8 Zeichen, Name erforderlich", () => {
    expect(validatePassword("1234567")).not.toBeNull();
    expect(validatePassword("12345678")).toBeNull();
    expect(validateDisplayName("  ")).not.toBeNull();
    expect(validateDisplayName("Max Muster")).toBeNull();
  });

  it("Startpasswort: Länge, keine verwechselbaren Zeichen, zufällig", () => {
    const a = generatePassword();
    const b = generatePassword();
    expect(a).toHaveLength(12);
    expect(a).not.toMatch(/[0O1lI]/);
    expect(a).not.toBe(b);
    expect(validatePassword(a)).toBeNull();
  });
});

describe("Benutzerkonten: Daten", () => {
  it("Serverdaten ohne Zugangsdaten der anonymen Synchronisation", () => {
    const d = { ...withRounds([]), settings: { debugMode: false, theme: "dark" as const, sync: { profileId: "p", key: "geheim" } } };
    const payload = toUserPayload(d);
    expect(payload.settings?.sync).toBeNull();
    expect(payload.settings?.theme).toBe("dark");
    const back = fromUserPayload(JSON.parse(JSON.stringify(payload)));
    expect(back.settings.theme).toBe("dark");
    expect(back.settings.sync).toBeNull();
  });

  it("ungültige Serverdaten werden abgelehnt", () => {
    expect(() => fromUserPayload({ profile: { id: "x" }, rounds: [] })).toThrow();
  });

  it("Zusammenführen: Runden vereinigt, neuere Fassung gewinnt, Profil vom bevorzugten Stand", () => {
    const local = withRounds([round("a", "2026-05-01", "2026-06-01T10:00:00Z", "lokal neu"), round("b", "2026-05-02", "2026-05-02T10:00:00Z")], 30);
    const server = withRounds([round("a", "2026-05-01", "2026-05-15T10:00:00Z", "server alt"), round("c", "2026-04-20", "2026-04-20T10:00:00Z")], 28);
    const merged = mergeUserData(local, server);
    expect(merged.rounds.map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(merged.rounds.find((r) => r.id === "a")?.title).toBe("lokal neu");
    expect(merged.profile.startHandicapIndex).toBe(30);
    const reverse = mergeUserData(server, local);
    expect(reverse.rounds.find((r) => r.id === "a")?.title).toBe("lokal neu");
    expect(reverse.profile.startHandicapIndex).toBe(28);
  });

  it("Speicherschlüssel je Benutzer getrennt vom Local Mode", () => {
    expect(userStorageKey("hcp", "u1")).toBe("hcp:user:u1");
  });
});

describe("Benutzerkonten: Speichern auf dem Server", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(saveImpl: (rev: number, data: ReturnType<typeof toUserPayload>) => Promise<{ revision: number; updatedAt: string }>) {
    let data = withRounds([round("a", "2026-05-01", "2026-05-01T10:00:00Z")]);
    const statuses: AccountSyncState[] = [];
    const dirty: boolean[] = [];
    const save = vi.fn(saveImpl);
    const onUnauthorized = vi.fn();
    const engine = new UserDataSyncEngine({
      revision: 3,
      getData: () => data,
      apply: (d) => {
        data = d;
      },
      save,
      setDirty: (d) => dirty.push(d),
      onStatus: (s) => statuses.push(s),
      onUnauthorized,
      delayMs: 100,
      retryMs: 1000,
    });
    return { engine, save, statuses, dirty, onUnauthorized, get data() { return data; }, set data(d: StoredData) { data = d; } };
  }

  it("fasst schnelle Änderungen zu einem Speichervorgang zusammen", async () => {
    const t = setup(async (rev) => ({ revision: rev + 1, updatedAt: "2026-09-29T10:00:00Z" }));
    t.engine.schedule();
    t.engine.schedule();
    t.engine.schedule();
    await vi.advanceTimersByTimeAsync(150);
    expect(t.save).toHaveBeenCalledTimes(1);
    expect(t.save.mock.calls[0][0]).toBe(3);
    expect(t.statuses.at(-1)).toMatchObject({ state: "saved" });
    expect(t.dirty.at(-1)).toBe(false);
    t.engine.schedule();
    await vi.advanceTimersByTimeAsync(150);
    expect(t.save.mock.calls[1][0]).toBe(4);
  });

  it("Konflikt (409): Serverstand wird zusammengeführt und erneut gespeichert", async () => {
    const serverRound = round("s", "2026-04-01", "2026-04-01T10:00:00Z");
    let calls = 0;
    const t = setup(async (rev, payload) => {
      calls++;
      if (calls === 1) {
        throw new AccountApiError("Konflikt", 409, { revision: 7, data: toUserPayload(withRounds([serverRound])) });
      }
      expect(rev).toBe(7);
      expect(payload.rounds.map((r) => r.id).sort()).toEqual(["a", "s"]);
      return { revision: 8, updatedAt: "2026-09-29T10:00:00Z" };
    });
    t.engine.schedule();
    await vi.advanceTimersByTimeAsync(150);
    expect(t.save).toHaveBeenCalledTimes(2);
    expect(t.data.rounds.map((r) => r.id).sort()).toEqual(["a", "s"]);
    expect(t.statuses.at(-1)).toMatchObject({ state: "saved" });
  });

  it("ohne Verbindung: Fehlerstatus, bleibt als ungespeichert markiert und versucht es erneut", async () => {
    let fail = true;
    const t = setup(async (rev) => {
      if (fail) throw new AccountApiError("Server nicht erreichbar", 0);
      return { revision: rev + 1, updatedAt: "2026-09-29T10:00:00Z" };
    });
    t.engine.schedule();
    await vi.advanceTimersByTimeAsync(150);
    expect(t.statuses.at(-1)).toMatchObject({ state: "error" });
    expect(t.dirty.at(-1)).toBe(true);
    fail = false;
    await vi.advanceTimersByTimeAsync(1100);
    expect(t.save).toHaveBeenCalledTimes(2);
    expect(t.statuses.at(-1)).toMatchObject({ state: "saved" });
  });

  it("abgelaufene Sitzung (401) meldet ab, ohne die Änderungen zu verwerfen", async () => {
    const t = setup(async () => {
      throw new AccountApiError("Nicht angemeldet", 401);
    });
    t.engine.schedule();
    await vi.advanceTimersByTimeAsync(150);
    expect(t.onUnauthorized).toHaveBeenCalledTimes(1);
    expect(t.dirty.at(-1)).toBe(true);
    expect(t.data.rounds).toHaveLength(1);
  });

  it("flush speichert ausstehende Änderungen sofort", async () => {
    const t = setup(async (rev) => ({ revision: rev + 1, updatedAt: "2026-09-29T10:00:00Z" }));
    t.engine.schedule();
    await t.engine.flush();
    expect(t.save).toHaveBeenCalledTimes(1);
  });
});
