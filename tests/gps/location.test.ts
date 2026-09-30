import { describe, expect, it } from "vitest";
import { PositionFilter } from "@/lib/gps/filter";
import { geodesicDistance } from "@/lib/gps/geodesy";
import { createLocationService, LocationError, type LocationEvent } from "@/lib/gps/locationService";
import { FakeClock, FakeGeolocation, fakeEnv, flush } from "./helpers";

const P = { latitude: 47.94, longitude: 10.31 };
/** Punkt `m` Meter nördlich von P */
const north = (m: number) => ({ latitude: P.latitude + m / 111_195, longitude: P.longitude });

describe("PositionFilter – Sprünge und Glättung", () => {
  it("verwirft sehr ungenaue Messungen und ungültige Werte", () => {
    const f = new PositionFilter();
    expect(f.push({ ...P, accuracy: 150, timestamp: 1000 }).verdict).toBe("REJECTED_ACCURACY");
    expect(f.push({ latitude: 999, longitude: 10, accuracy: 5, timestamp: 1000 }).verdict).toBe("REJECTED_INVALID");
    expect(f.push({ ...P, accuracy: 5, timestamp: 1000 }).verdict).toBe("ACCEPTED");
    expect(f.push({ ...P, accuracy: 5, timestamp: 500 }).verdict).toBe("REJECTED_OUT_OF_ORDER");
  });

  it("ein einzelner unrealistischer Sprung (35 m in 1 s) wird ignoriert", () => {
    const f = new PositionFilter();
    f.push({ ...P, accuracy: 4, timestamp: 0 });
    const jump = f.push({ ...north(35), accuracy: 4, timestamp: 1000 });
    expect(jump.verdict).toBe("PENDING_JUMP");
    // nächste Messung wieder am alten Ort → Sprung verworfen
    const back = f.push({ ...north(1), accuracy: 4, timestamp: 2000 });
    expect(back.verdict).toBe("ACCEPTED");
    expect(geodesicDistance(P, back.fix!)).toBeLessThan(2);
  });

  it("bestätigt ein neuer Ort sich mehrfach (Fahrt im Cart), wird er übernommen", () => {
    const f = new PositionFilter();
    f.push({ ...P, accuracy: 4, timestamp: 0 });
    expect(f.push({ ...north(60), accuracy: 4, timestamp: 1000 }).verdict).toBe("PENDING_JUMP");
    const confirmed = f.push({ ...north(62), accuracy: 4, timestamp: 2000 });
    expect(confirmed.verdict).toBe("RESET");
    expect(Math.round(geodesicDistance(P, confirmed.fix!))).toBe(62);
  });

  it("glättet Zittern, folgt normaler Bewegung aber ohne Trägheit", () => {
    const f = new PositionFilter();
    f.push({ ...P, accuracy: 5, timestamp: 0 });
    // Zittern ±3 m um denselben Ort
    let last = f.push({ ...north(3), accuracy: 5, timestamp: 1000 }).fix!;
    last = f.push({ ...north(-3), accuracy: 5, timestamp: 2000 }).fix!;
    expect(geodesicDistance(P, last)).toBeLessThan(2);
    // 20 s Gehen mit 1,4 m/s: geglättete Position hängt höchstens wenige Meter hinterher
    for (let s = 1; s <= 20; s++) last = f.push({ ...north(s * 1.4), accuracy: 5, timestamp: 2000 + s * 1000 }).fix!;
    expect(Math.abs(geodesicDistance(P, last) - 28)).toBeLessThan(4);
    expect(last.accuracy).toBe(5); // gemeldete Genauigkeit, keine Scheingenauigkeit
  });
});

describe("LocationService", () => {
  it("fortlaufende Messung: Berechtigung, Status, Genauigkeit, Stopp verwirft die Position", async () => {
    const clock = new FakeClock();
    const geo = new FakeGeolocation();
    const { env } = fakeEnv({ clock, geo, permission: "prompt" });
    const svc = createLocationService(env);
    expect(await svc.refreshPermission()).toBe("UNKNOWN");
    const events: LocationEvent[] = [];
    svc.subscribe((e) => events.push(e));
    svc.start();
    expect(svc.status).toBe("ACQUIRING");
    expect(geo.active).toBe(1);
    geo.emit(P.latitude, P.longitude, 4, clock.now());
    expect(svc.status).toBe("ACTIVE");
    expect(svc.permission).toBe("AUTHORIZED");
    expect(svc.hasPermission()).toBe(true);
    expect(svc.getAccuracy()).toBe(4);
    expect(events.some((e) => e.type === "fix")).toBe(true);
    svc.stop();
    expect(svc.status).toBe("OFF");
    expect(geo.active).toBe(0);
    expect(svc.getLastPosition()).toBeNull();
    // verspätete Meldungen nach dem Stopp werden nicht verarbeitet
    const count = events.length;
    geo.emit(P.latitude, P.longitude, 4, clock.now());
    expect(events.length).toBe(count);
    expect(clock.activeTimers).toBe(0);
  });

  it("verweigerte Berechtigung → DENIED, Messung beendet", async () => {
    const clock = new FakeClock();
    const geo = new FakeGeolocation();
    geo.decision = "deny";
    const svc = createLocationService(fakeEnv({ clock, geo, permission: "prompt" }).env);
    svc.start();
    await flush();
    expect(svc.permission).toBe("DENIED");
    expect(svc.status).toBe("ERROR");
    expect(svc.lastError).toBe("PERMISSION_DENIED");
    expect(geo.active).toBe(0);
  });

  it("kein Signal: nach 30 s ohne Messung NO_SIGNAL; Zeitüberschreitung startet die Abfrage neu", () => {
    const clock = new FakeClock();
    const geo = new FakeGeolocation();
    const svc = createLocationService(fakeEnv({ clock, geo, permission: "granted" }).env);
    svc.start();
    clock.advance(29_000);
    expect(svc.status).toBe("ACQUIRING");
    clock.advance(4_000);
    expect(svc.status).toBe("NO_SIGNAL");
    geo.emit(P.latitude, P.longitude, 6, clock.now());
    expect(svc.status).toBe("ACTIVE");
    const before = geo.cleared.length;
    clock.advance(25_000);
    geo.fail(3);
    expect(geo.cleared.length).toBe(before + 1);
    expect(geo.active).toBe(1);
    expect(svc.status).toBe("NO_SIGNAL");
    geo.fail(2);
    expect(svc.lastError).toBe("POSITION_UNAVAILABLE");
  });

  it("im Hintergrund pausiert, beim Zurückkehren wieder aktiv (Akku)", () => {
    const clock = new FakeClock();
    const geo = new FakeGeolocation();
    const fake = fakeEnv({ clock, geo, permission: "granted" });
    const svc = createLocationService(fake.env);
    svc.start();
    expect(geo.active).toBe(1);
    fake.setVisible(false);
    expect(geo.active).toBe(0);
    fake.setVisible(true);
    expect(geo.active).toBe(1);
    svc.stop();
    fake.setVisible(false);
    fake.setVisible(true);
    expect(geo.active).toBe(0);
  });

  it("nicht unterstützt bzw. ohne HTTPS: UNAVAILABLE / RESTRICTED, keine Abfrage", async () => {
    const clock = new FakeClock();
    const none = createLocationService(fakeEnv({ clock, geo: null }).env);
    expect(none.permission).toBe("UNAVAILABLE");
    none.start();
    expect(none.status).toBe("ERROR");
    await expect(none.getCurrentPosition()).rejects.toBeInstanceOf(LocationError);
    const insecure = createLocationService(fakeEnv({ clock, secure: false }).env);
    expect(insecure.permission).toBe("RESTRICTED");
    insecure.start();
    expect(insecure.lastError).toBe("INSECURE");
  });

  it("einzelne Position (Admin): nutzt frische laufende Messung oder fragt einmalig", async () => {
    const clock = new FakeClock();
    const geo = new FakeGeolocation();
    const svc = createLocationService(fakeEnv({ clock, geo, permission: "granted" }).env);
    const p = svc.getCurrentPosition();
    expect(geo.singleRequests).toHaveLength(1);
    geo.singleRequests[0].ok({ coords: { latitude: P.latitude, longitude: P.longitude, accuracy: 3 }, timestamp: clock.now() });
    await expect(p).resolves.toMatchObject({ accuracy: 3 });
    expect(svc.getLastPosition()).toBeNull(); // einmalige Abfrage wird nicht gespeichert
    const denied = svc.getCurrentPosition();
    geo.singleRequests[1].err({ code: 1 });
    await expect(denied).rejects.toMatchObject({ kind: "PERMISSION_DENIED" });
    expect(svc.permission).toBe("DENIED");
  });

  it("nachträglich in den Einstellungen erlaubt → Berechtigung wird übernommen", async () => {
    const clock = new FakeClock();
    const fake = fakeEnv({ clock, permission: "denied" });
    const svc = createLocationService(fake.env);
    expect(await svc.refreshPermission()).toBe("DENIED");
    fake.changePermission("granted");
    expect(svc.permission).toBe("AUTHORIZED");
  });
});
