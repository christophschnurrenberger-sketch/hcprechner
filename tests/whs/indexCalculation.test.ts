import { describe, expect, it } from "vitest";
import { DE_2026 } from "@/rules/whs/de/2026/config";
import { calculateHandicapIndex, lookupIndexTable } from "@/rules/whs/de/2026/indexCalculation";
import { calculateHandicapIndex as apiCalculateHandicapIndex } from "@/lib/whs";

const entries = (values: number[]) =>
  values.map((adjustedSD, i) => ({ roundId: `r${i}`, position: i, adjustedSD }));

describe("WHS-Tabelle (zentral hinterlegt)", () => {
  const expected: [number, number, number][] = [
    [3, 1, -2],
    [4, 1, -1],
    [5, 1, 0],
    [6, 2, -1],
    [7, 2, 0],
    [8, 2, 0],
    [9, 3, 0],
    [10, 3, 0],
    [11, 3, 0],
    [12, 4, 0],
    [13, 4, 0],
    [14, 4, 0],
    [15, 5, 0],
    [16, 5, 0],
    [17, 6, 0],
    [18, 6, 0],
    [19, 7, 0],
    [20, 8, 0],
  ];
  it.each(expected)("%i Ergebnisse → beste %i, Anpassung %i", (n, count, adjustment) => {
    const row = lookupIndexTable(n, DE_2026)!;
    expect(row.count).toBe(count);
    expect(row.adjustment).toBe(adjustment);
  });

  it("1–2 Ergebnisse: noch kein HCPI", () => {
    expect(lookupIndexTable(0, DE_2026)).toBeNull();
    expect(lookupIndexTable(1, DE_2026)).toBeNull();
    expect(lookupIndexTable(2, DE_2026)).toBeNull();
    expect(calculateHandicapIndex(entries([20, 22]), DE_2026)).toBeNull();
  });

  it("die Tabelle ist lückenlos von 3 bis 20", () => {
    for (let n = 3; n <= 20; n++) expect(lookupIndexTable(n, DE_2026)).not.toBeNull();
  });
});

describe("Handicap Index aus Score Differentials", () => {
  it("Beispiel: 8 Ergebnisse → Durchschnitt der besten 2 (16,9 und 17,9) = 17,4", () => {
    const r = calculateHandicapIndex(entries([18.6, 20.1, 17.9, 23.4, 19.2, 21.0, 16.9, 25.2]), DE_2026)!;
    expect(r.usedCount).toBe(2);
    expect(r.recordSize).toBe(8);
    expect(r.value).toBe(17.4);
    expect(r.usedRoundIds.sort()).toEqual(["r2", "r6"]);
  });

  it("TEST 3: 8 SDs → beste 2", () => {
    const r = calculateHandicapIndex(entries([30, 29, 28, 27, 26, 25, 24, 23]), DE_2026)!;
    expect(r.usedCount).toBe(2);
    expect(r.value).toBe(23.5);
  });

  it("TEST 2 / TEST 5: 20 SDs → nur die besten 8", () => {
    const values = [25, 12, 29, 17, 10, 21, 14, 27, 11, 19, 23, 16, 28, 13, 20, 15, 26, 18, 24, 22];
    const r = calculateHandicapIndex(entries(values), DE_2026)!;
    expect(r.usedCount).toBe(8);
    expect(r.usedRoundIds).toHaveLength(8);
    // beste 8: 10..17 → 13,5
    expect(r.value).toBe(13.5);
  });

  it("TEST 4: 19 SDs → beste 7", () => {
    const values = [25, 12, 29, 17, 10, 21, 14, 27, 11, 19, 23, 16, 28, 13, 20, 15, 26, 18, 24];
    const r = calculateHandicapIndex(entries(values), DE_2026)!;
    expect(r.usedCount).toBe(7);
    // beste 7: 10..16 → 13,0
    expect(r.value).toBe(13.0);
  });

  it("3 Ergebnisse: bestes −2,0", () => {
    expect(calculateHandicapIndex(entries([30, 25, 28]), DE_2026)!.value).toBe(23.0);
  });

  it("4 Ergebnisse: bestes −1,0", () => {
    expect(calculateHandicapIndex(entries([30, 25, 28, 27]), DE_2026)!.value).toBe(24.0);
  });

  it("5 Ergebnisse: bestes ohne Anpassung", () => {
    expect(calculateHandicapIndex(entries([30, 25, 28, 27, 26]), DE_2026)!.value).toBe(25.0);
  });

  it("6 Ergebnisse: Durchschnitt der besten 2 −1,0", () => {
    expect(calculateHandicapIndex(entries([30, 25, 28, 27, 26, 29]), DE_2026)!.value).toBe(24.5);
  });

  it("9 Ergebnisse: beste 3", () => {
    expect(calculateHandicapIndex(entries([30, 25, 28, 27, 26, 29, 24, 31, 32]), DE_2026)!.value).toBe(25.0);
  });

  it("12 Ergebnisse: beste 4", () => {
    const r = calculateHandicapIndex(entries([40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 30, 29]), DE_2026)!;
    expect(r.value).toBe(30.5);
  });

  it("15 Ergebnisse: beste 5", () => {
    const values = Array.from({ length: 15 }, (_, i) => 20 + i);
    expect(calculateHandicapIndex(entries(values), DE_2026)!.value).toBe(22.0);
  });

  it("17 Ergebnisse: beste 6", () => {
    const values = Array.from({ length: 17 }, (_, i) => 20 + i);
    expect(calculateHandicapIndex(entries(values), DE_2026)!.value).toBe(22.5);
  });

  it("Durchschnitt wird auf eine Nachkommastelle gerundet", () => {
    // beste 8: 10,1 10,2 10,2 10,3 10,3 10,3 10,4 10,4 → 82,2/8 = 10,275 → 10,3
    const values = [10.1, 10.2, 10.2, 10.3, 10.3, 10.3, 10.4, 10.4, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20];
    expect(calculateHandicapIndex(entries(values), DE_2026)!.value).toBe(10.3);
  });

  it("mehr als 20 Einträge im Fenster sind ein Programmierfehler", () => {
    const values = Array.from({ length: 21 }, () => 20);
    expect(() => calculateHandicapIndex(entries(values), DE_2026)).toThrow(RangeError);
  });

  it("die öffentliche API verwendet automatisch nur die letzten 20", () => {
    // 21 Werte: der erste (sehr gute) fällt heraus
    const values = [0, ...Array.from({ length: 20 }, () => 20)];
    expect(apiCalculateHandicapIndex(values)!.value).toBe(20.0);
  });

  it("gleiche Werte: das jüngere Ergebnis wird markiert", () => {
    const r = calculateHandicapIndex(entries([20, 20, 25, 26, 27, 28, 29, 30]), DE_2026)!;
    expect(r.usedRoundIds).toEqual(["r1", "r0"]);
    expect(r.value).toBe(20.0);
  });
});
