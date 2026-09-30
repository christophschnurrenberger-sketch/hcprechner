import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { GreenGeo } from "@/lib/courses/types";
import { createLocationService } from "@/lib/gps/locationService";
import { RoundGpsController, type RoundGpsContext } from "@/lib/gps/roundGps";
import {
  EMPTY_RECEIVER,
  receiveWatchMessage,
  watchDisplay,
  watchStateFromView,
  WatchSync,
  type WatchMessage,
  type WatchReceiverState,
} from "@/lib/gps/watch/protocol";
import { FakeClock, FakeGeolocation, fakeEnv, flush } from "./helpers";

interface WatchVector {
  name: string;
  messages: { atMs: number; message: WatchMessage }[];
  nowMs: number;
  expected: Record<string, unknown>;
}

const fixture = JSON.parse(readFileSync(path.join(__dirname, "../fixtures/gps-vectors.json"), "utf8")) as { watch: WatchVector[] };

function replay(v: WatchVector): WatchReceiverState {
  return v.messages.reduce((r, m) => receiveWatchMessage(r, m.message, m.atMs), EMPTY_RECEIVER);
}

describe("Watch-Anzeige – gemeinsame Testwerte (auch in HCPGolfKit/Swift)", () => {
  it.each(fixture.watch.map((v) => [v.name, v] as const))("%s", (_n, v) => {
    const d = watchDisplay(replay(v), v.nowMs, "de");
    expect({ kind: d.kind, hole: d.hole, par: d.par, distance: d.distance, approx: d.approx, target: d.target, gps: d.gps, age: d.age, notice: d.notice, dim: d.dim, rows: d.rows }).toEqual(v.expected);
    expect(d.distance).not.toBe("0");
  });

  it("Swift-Testressource ist identisch mit den TypeScript-Testwerten", () => {
    const swift = path.join(__dirname, "../../native/apple/HCPGolfKit/Tests/HCPGolfKitTests/Resources/gps-vectors.json");
    expect(readFileSync(swift, "utf8")).toBe(readFileSync(path.join(__dirname, "../fixtures/gps-vectors.json"), "utf8"));
  });
});

// Fiktive Grüns genau nördlich des Spielers: Loch 7 in 151 m, Loch 8 in 300 m
const PLAYER = { latitude: 47.94, longitude: 10.31 };
const G7: GreenGeo = { front: null, center: { latitude: 47.94 + 151 / 111_195, longitude: 10.31 }, back: null, polygon: null, pin: null };
const G8: GreenGeo = { front: null, center: { latitude: 47.94 + 300 / 111_195, longitude: 10.31 }, back: null, polygon: null, pin: null };

async function round() {
  const clock = new FakeClock();
  const geo = new FakeGeolocation();
  const service = createLocationService(fakeEnv({ clock, geo, permission: "granted" }).env);
  const ctrl = new RoundGpsController(service, { now: clock.now, optIn: { get: () => true, set: () => undefined }, setTimeout: clock.setTimeout, clearTimeout: clock.clear, setInterval: clock.setInterval, clearInterval: clock.clear, locale: "de" });
  ctrl.attach();
  const ctx = (p: Partial<RoundGpsContext> = {}): RoundGpsContext => ({ round: "ACTIVE", courseId: "c1", holeNumber: 7, green: G7, hasGreens: true, target: "green_center", unit: "M", ...p });
  ctrl.update(ctx());
  await flush();
  // „Watch“: Empfänger hinter einer Test-Übertragung
  let watch = EMPTY_RECEIVER;
  const sent: WatchMessage[] = [];
  const sync = new WatchSync({ send: (m) => ((watch = receiveWatchMessage(watch, m, clock.now())), sent.push(m)) }, clock.now);
  const push = (par = 4) => sync.update(watchStateFromView(ctrl.getView(), { roundActive: true, par }));
  const at = (northM: number, accuracy = 4) => geo.emit(PLAYER.latitude + northM / 111_195, PLAYER.longitude, accuracy, clock.now());
  return { clock, ctrl, ctx, sync, push, at, sent, watch: () => watch };
}

describe("iPhone ↔ Watch", () => {
  it("Synchronisation: iPhone 151 m → Watch 151 m, iPhone 148 m → Watch 148 m (nur Änderungen)", async () => {
    const t = await round();
    t.at(0);
    t.push();
    expect(t.ctrl.getView().display.text).toBe("151 m");
    expect(watchDisplay(t.watch(), t.clock.now())).toMatchObject({ kind: "DISTANCE", hole: "LOCH 7", distance: "151", target: "MITTE" });
    expect(t.sent[0].type).toBe("state");
    // 3 m näher gehen und stehen bleiben (Glättung läuft ein)
    for (let i = 1; i <= 8; i++) {
      t.clock.advance(1_000);
      t.at(Math.min(i, 3));
    }
    t.clock.advance(1_000);
    t.push();
    expect(t.ctrl.getView().display.text).toBe("148 m");
    expect(watchDisplay(t.watch(), t.clock.now()).distance).toBe("148");
    const patch = t.sent.at(-1)!;
    expect(patch.type).toBe("patch");
    expect(Object.keys(patch.data ?? {}).sort()).toEqual(["distance", "timestamp"]);
    // ohne Änderung keine Nachricht
    expect(t.push()).toBeNull();
  });

  it("Watch getrennt: „Verbindung verloren“, iPhone rechnet weiter", async () => {
    const t = await round();
    t.at(0);
    t.push();
    const lastWatch = t.watch();
    // Übertragung fällt aus: iPhone zeigt weiter aktuelle Entfernungen, die Watch bekommt nichts mehr
    for (let i = 1; i <= 16; i++) {
      t.clock.advance(1_000);
      t.at(i * 0.5);
    }
    expect(t.ctrl.getView().gps.label).toBe("GPS");
    expect(t.ctrl.getView().display.value).not.toBeNull();
    const d = watchDisplay(lastWatch, t.clock.now());
    expect(d).toMatchObject({ kind: "CONNECTION_LOST", notice: "Verbindung verloren", dim: true, distance: "151" });
    expect(d.age).toMatch(/^vor 0:1\d min$/);
  });

  it("Herzschlag alle 5 s ohne Änderung hält die Verbindung; das Alter der Entfernung wird angezeigt", async () => {
    const t = await round();
    t.at(0);
    t.push();
    for (let s = 1; s <= 12; s++) {
      t.clock.advance(1_000);
      t.sync.heartbeat();
    }
    expect(t.sent.filter((m) => m.type === "heartbeat")).toHaveLength(2);
    const d = watchDisplay(t.watch(), t.clock.now());
    expect(d.kind).toBe("DISTANCE");
    expect(d.age).toBe("vor 0:12 min");
  });

  it("Lochwechsel: Watch zeigt nie die Entfernung des vorigen Lochs", async () => {
    const t = await round();
    t.at(0);
    t.push();
    t.clock.advance(15_000); // Messung nicht mehr frisch → „GPS wird aktualisiert…“
    t.ctrl.update(t.ctx({ holeNumber: 8, green: G8 }));
    t.push(5);
    const d = watchDisplay(t.watch(), t.clock.now());
    expect(d.hole).toBe("LOCH 8");
    expect(d.distance).toBeNull();
    t.at(0);
    t.push(5);
    expect(watchDisplay(t.watch(), t.clock.now())).toMatchObject({ hole: "LOCH 8", distance: "300" });
  });

  it("Runde beendet → Watch: „Keine aktive Runde“", async () => {
    const t = await round();
    t.at(0);
    t.push();
    t.ctrl.update(t.ctx({ round: "COMPLETED" }));
    t.sync.update(watchStateFromView(t.ctrl.getView(), { roundActive: false, par: 4 }));
    expect(watchDisplay(t.watch(), t.clock.now())).toMatchObject({ kind: "NO_ROUND", gps: "Keine aktive Runde" });
  });

  it("überträgt nur Rundendaten (keine Scorecard-, Konto- oder Platzdaten)", async () => {
    const t = await round();
    t.at(0);
    t.push();
    expect(Object.keys(t.sent[0].data ?? {}).sort()).toEqual(
      ["approx", "back", "center", "distance", "front", "gpsAccuracy", "hole", "noGreen", "par", "roundActive", "status", "target", "timestamp", "unit"].sort(),
    );
  });
});
