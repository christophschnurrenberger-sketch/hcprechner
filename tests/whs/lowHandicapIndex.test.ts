import { describe, expect, it } from "vitest";
import { DE_2026 } from "@/rules/whs/de/2026/config";
import { calculateLowHandicapIndex } from "@/rules/whs/de/2026/lowHandicapIndex";
import type { HistoryPoint } from "@/lib/whs/types";

const history: HistoryPoint[] = [
  { effectiveFrom: null, value: 20.0, source: "START" },
  { effectiveFrom: "2025-01-10", value: 15.0, source: "REVISION" },
  { effectiveFrom: "2025-06-01", value: 12.0, source: "REVISION" },
  { effectiveFrom: "2025-06-15", value: 13.0, source: "REVISION" },
  { effectiveFrom: "2026-03-01", value: 14.0, source: "REVISION" },
];

const low = (mostRecentScoreDate: string, totalScores = 20, h = history) =>
  calculateLowHandicapIndex({ mostRecentScoreDate, history: h, totalScores }, DE_2026);

describe("Low Handicap Index", () => {
  it("erst ab 20 Ergebnissen", () => {
    expect(low("2026-05-01", 19)).toBeNull();
    expect(low("2026-05-01", 20)).not.toBeNull();
  });

  it("niedrigster Wert innerhalb der 365 Tage", () => {
    const r = low("2026-05-01")!;
    expect(r.windowStart).toBe("2025-05-01");
    expect(r.value).toBe(12.0);
    expect(r.effectiveFrom).toBe("2025-06-01");
  });

  it("Werte älter als 365 Tage zählen nicht (nicht einfach Minimum aller Werte)", () => {
    const r = low("2026-06-20")!;
    // Zeitraum ab 2025-06-20: zu Beginn galt 13,0; 12,0 ist bereits abgelaufen
    expect(r.value).toBe(13.0);
  });

  it("der zu Beginn des Zeitraums geltende HCPI zählt mit", () => {
    const r = low("2026-06-05")!;
    // Zeitraum ab 2025-06-05: zu Beginn galt 12,0 (seit 2025-06-01)
    expect(r.value).toBe(12.0);
  });

  it("Start-HCPI ohne Datum gilt zu Beginn eines frühen Zeitraums", () => {
    const r = low("2025-03-01")!;
    expect(r.value).toBe(15.0);
    const early = low("2024-12-01")!;
    expect(early.value).toBe(20.0);
  });

  it("der HCPI, mit dem am Tag des jüngsten Ergebnisses gespielt wurde, zählt mit", () => {
    const h: HistoryPoint[] = [
      { effectiveFrom: null, value: 20.0, source: "START" },
      { effectiveFrom: "2026-05-01", value: 11.0, source: "REVISION" },
    ];
    expect(low("2026-05-01", 20, h)!.value).toBe(11.0);
    // eine erst am Folgetag wirksame Revision zählt noch nicht
    expect(low("2026-04-30", 20, h)!.value).toBe(20.0);
  });
});
