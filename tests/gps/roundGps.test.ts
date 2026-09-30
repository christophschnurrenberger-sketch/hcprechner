import { describe, expect, it } from "vitest";
import type { GreenGeo } from "@/lib/courses/types";
import { createLocationService } from "@/lib/gps/locationService";
import { RoundGpsController, shouldTrack, type OptInStore, type RoundGpsContext } from "@/lib/gps/roundGps";
import { FakeClock, FakeGeolocation, fakeEnv, flush } from "./helpers";

// Fiktive Grüns: Loch 7 → 151 m Mitte vom Spieler, Loch 8 → 300 m nördlich
const PLAYER = { latitude: 47.94, longitude: 10.31 };
const G7: GreenGeo = { front: null, center: { latitude: 47.94057392, longitude: 10.311831758 }, back: null, polygon: null, pin: null };
const G8: GreenGeo = { front: null, center: { latitude: 47.94 + 300 / 111_195, longitude: 10.31 }, back: null, polygon: null, pin: null };

function setup(permission: "granted" | "denied" | "prompt" | null = "granted", opted = false) {
  const clock = new FakeClock();
  const geo = new FakeGeolocation();
  const fake = fakeEnv({ clock, geo, permission });
  const service = createLocationService(fake.env);
  let optIn = opted;
  const store: OptInStore = { get: () => optIn, set: (v) => (optIn = v) };
  const ctrl = new RoundGpsController(service, { now: clock.now, optIn: store, setTimeout: clock.setTimeout, clearTimeout: clock.clear, setInterval: clock.setInterval, clearInterval: clock.clear, locale: "de" });
  ctrl.attach();
  let renders = 0;
  ctrl.subscribe(() => renders++);
  const ctx = (patch: Partial<RoundGpsContext> = {}): RoundGpsContext => ({ round: "ACTIVE", courseId: "c1", holeNumber: 7, green: G7, hasGreens: true, target: "green_center", unit: "M", ...patch });
  const at = (m: number, accuracy = 4) => geo.emit(PLAYER.latitude + m / 111_195, PLAYER.longitude, accuracy, clock.now());
  return { clock, geo, fake, service, ctrl, ctx, at, renders: () => renders, optIn: () => optIn };
}

describe("GPS während der Runde (Rundenstatus → Standort)", () => {
  it("nur bei aktiver Runde mit Berechtigung und Gründaten", () => {
    const base: RoundGpsContext = { round: "ACTIVE", courseId: "c1", holeNumber: 1, green: G7, hasGreens: true, target: "green_center", unit: "M" };
    expect(shouldTrack(base, "AUTHORIZED", false)).toBe(true);
    expect(shouldTrack({ ...base, round: "NOT_STARTED" }, "AUTHORIZED", false)).toBe(false);
    expect(shouldTrack({ ...base, round: "PAUSED" }, "AUTHORIZED", false)).toBe(false);
    expect(shouldTrack({ ...base, round: "COMPLETED" }, "AUTHORIZED", false)).toBe(false);
    expect(shouldTrack({ ...base, hasGreens: false }, "AUTHORIZED", false)).toBe(false);
    expect(shouldTrack(base, "UNKNOWN", false)).toBe(false);
    expect(shouldTrack(base, "UNKNOWN", true)).toBe(true);
    expect(shouldTrack(base, "DENIED", true)).toBe(false);
  });

  it("aktive Runde: Standort an, Entfernung zur Grünmitte; Runde beendet → Standort STOP", async () => {
    const t = setup("granted");
    t.ctrl.update(t.ctx({ round: "NOT_STARTED" }));
    await flush();
    expect(t.geo.active).toBe(0);
    expect(t.ctrl.getView().gps.kind).toBe("OFF");

    t.ctrl.update(t.ctx());
    await flush();
    expect(t.geo.active).toBe(1);
    expect(t.ctrl.getView().gps.label).toBe("GPS wird ermittelt…");
    t.at(0, 5);
    const v = t.ctrl.getView();
    expect(v.display.text).toBe("151 m");
    expect(v.display.spoken).toBe("151 Meter zur Mitte des Grüns");
    expect(v.gps).toMatchObject({ label: "GPS", detail: "±5 m" });

    t.ctrl.update(t.ctx({ round: "COMPLETED" }));
    expect(t.geo.active).toBe(0);
    expect(t.ctrl.isTracking()).toBe(false);
    expect(t.service.getLastPosition()).toBeNull();
    const renders = t.renders();
    t.at(10);
    t.clock.advance(5_000);
    expect(t.renders()).toBe(renders); // keine weitere Standortverarbeitung
    expect(t.ctrl.getView().display.text).toBe("— m");
  });

  it("Runde verlassen (Pause) schaltet ab; Fortsetzen schaltet wieder ein", async () => {
    const t = setup("granted");
    t.ctrl.update(t.ctx());
    await flush();
    expect(t.geo.active).toBe(1);
    t.ctrl.update(t.ctx({ round: "PAUSED" }));
    expect(t.geo.active).toBe(0);
    t.ctrl.update(t.ctx());
    expect(t.geo.active).toBe(1);
    t.ctrl.dispose();
    expect(t.geo.active).toBe(0);
  });

  it("Erstnutzung: Erklärung, dann Systemabfrage; verweigert → „Standortzugriff deaktiviert“", async () => {
    const t = setup("prompt");
    t.geo.decision = "deny";
    t.ctrl.update(t.ctx());
    await flush();
    expect(t.geo.active).toBe(0); // keine Abfrage ohne Nutzeraktion
    expect(t.ctrl.getView().gps.kind).toBe("PERMISSION_REQUIRED");
    t.ctrl.activate();
    expect(t.optIn()).toBe(true);
    await flush();
    expect(t.ctrl.getView().gps.kind).toBe("DENIED");
    expect(t.geo.active).toBe(0);
    // Scorecard-unabhängig: Runde bleibt aktiv, Anzeige zeigt keine Entfernung
    expect(t.ctrl.getView().display.text).toBe("— m");
  });

  it("Erstnutzung erlaubt → nächste Runden starten ohne erneute Erklärung", async () => {
    const t = setup(null); // Browser ohne Permissions-API (z. B. ältere iOS-Versionen)
    t.ctrl.update(t.ctx());
    await flush();
    expect(t.ctrl.getView().gps.kind).toBe("PERMISSION_REQUIRED");
    t.ctrl.activate();
    t.at(0);
    expect(t.ctrl.getView().gps.kind).toBe("ACTIVE");
    t.ctrl.dispose();
    const next = setup(null, true);
    next.ctrl.update(next.ctx());
    await flush();
    expect(next.geo.active).toBe(1);
  });

  it("Lochwechsel: Entfernung von Loch 7 wird nie für Loch 8 angezeigt", async () => {
    const t = setup("granted");
    t.ctrl.update(t.ctx());
    await flush();
    t.at(0);
    expect(t.ctrl.getView()).toMatchObject({ hole: 7 });
    expect(t.ctrl.getView().display.text).toBe("151 m");
    // Wechsel mit frischer Messung (< 5 s): sofort neue Entfernung für Loch 8
    t.clock.advance(1_000);
    t.ctrl.update(t.ctx({ holeNumber: 8, green: G8 }));
    expect(t.ctrl.getView().hole).toBe(8);
    expect(t.ctrl.getView().result.holeId).toBe(8);
    expect(t.ctrl.getView().display.text).toBe("300 m");
    // Wechsel mit alter Messung: „GPS wird aktualisiert…“, keine Zahl bis zur nächsten Messung
    t.clock.advance(12_000);
    t.ctrl.update(t.ctx({ holeNumber: 7, green: G7 }));
    const v = t.ctrl.getView();
    expect(v.hole).toBe(7);
    expect(v.updating).toBe(true);
    expect(v.display.text).toBe("— m");
    expect(v.gps.label).toBe("GPS wird aktualisiert…");
    t.at(0);
    expect(t.ctrl.getView().updating).toBe(false);
    expect(t.ctrl.getView().display.text).toBe("151 m");
  });

  it("GPS verliert Signal: „GPS wird ermittelt…“, später „Kein GPS-Signal“ – Anzeige nie 0", async () => {
    const t = setup("granted");
    t.ctrl.update(t.ctx());
    await flush();
    t.at(0);
    expect(t.ctrl.getView().gps.label).toBe("GPS");
    t.clock.advance(21_000);
    const lost = t.ctrl.getView();
    expect(lost.gps.label).toBe("GPS wird ermittelt…");
    expect(lost.stale).toBe(true);
    expect(lost.display.text).toBe("151 m"); // letzte Entfernung abgeblendet sichtbar
    t.clock.advance(10_000);
    expect(t.ctrl.getView().gps.label).toBe("Kein GPS-Signal");
    t.clock.advance(40_000);
    expect(t.ctrl.getView().display.text).toBe("— m");
    t.at(0);
    expect(t.ctrl.getView().gps.label).toBe("GPS");
  });

  it("schlechte Genauigkeit wird gekennzeichnet und gerundet (±25/±50 m)", async () => {
    const t = setup("granted");
    t.ctrl.update(t.ctx());
    await flush();
    t.at(0, 25);
    expect(t.ctrl.getView().gps).toMatchObject({ label: "GPS ungenau", detail: "±25 m" });
    expect(t.ctrl.getView().display.text).toBe("≈ 150 m");
    t.clock.advance(1_000);
    t.at(0, 50);
    t.clock.advance(1_000);
    expect(t.ctrl.getView().gps.detail).toBe("±50 m");
  });

  it("Loch ohne Gründaten: Hinweis statt Entfernung; Platz ohne Gründaten: GPS bleibt aus", async () => {
    const t = setup("granted");
    t.ctrl.update(t.ctx({ holeNumber: 9, green: null }));
    await flush();
    t.at(0);
    expect(t.ctrl.getView().noGreen).toBe(true);
    expect(t.ctrl.getView().display.text).toBe("— m");
    const none = setup("granted");
    none.ctrl.update(none.ctx({ hasGreens: false, green: null }));
    await flush();
    expect(none.geo.active).toBe(0);
    expect(none.ctrl.getView().gps.kind).toBe("OFF");
  });

  it("Anzeige nur bei relevanter Änderung (10 cm Bewegung löst keinen Render aus)", async () => {
    const t = setup("granted");
    t.ctrl.update(t.ctx());
    await flush();
    t.at(0);
    const before = t.renders();
    for (let i = 0; i < 10; i++) {
      t.clock.advance(1_000);
      t.at(0.1 * (i % 2));
    }
    expect(t.renders()).toBe(before);
    t.clock.advance(1_000);
    t.at(-20);
    t.clock.advance(1_000);
    t.at(-20);
    t.clock.advance(1_000);
    expect(t.renders()).toBeGreaterThan(before);
    expect(Number(t.ctrl.getView().display.value)).toBeGreaterThan(155);
  });

  it("Meter/Yards: Einheit folgt der Einstellung", async () => {
    const t = setup("granted");
    t.ctrl.update(t.ctx({ unit: "YD" }));
    await flush();
    t.at(0, 5);
    expect(t.ctrl.getView().display.text).toBe("165 yd");
  });
});
