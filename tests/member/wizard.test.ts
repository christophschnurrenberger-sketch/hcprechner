import { describe, expect, it } from "vitest";
import { applyPatch, holesChoiceOf, holesPatch, initialState, toRoundInput } from "@/components/member/wizard/wizardState";

describe("Runden-Wizard: Zustand", () => {
  const confirmed = { par: 72, courseRating: 72.3, slopeRating: 131 };
  const base = { ...initialState("2026-09-30"), courseId: "c1", layoutId: "l1", teeColor: "Gelb", ratingConfirmed: confirmed };

  it("Bestätigung des Ratings verfällt bei anderem Abschlag, Löchern, Geschlecht oder Datum", () => {
    expect(applyPatch(base, { gbe: "90" }).ratingConfirmed).toEqual(confirmed);
    expect(applyPatch(base, { teeColor: "Gelb" }).ratingConfirmed).toEqual(confirmed);
    for (const patch of [{ teeColor: "Rot" }, { holes: 9 as const }, { gender: "F" as const }, { date: "2026-09-01" }, { layoutId: "l2" }]) {
      expect(applyPatch(base, patch).ratingConfirmed).toBeNull();
    }
    expect(applyPatch(base, { teeColor: "Rot", ratingConfirmed: confirmed }).ratingConfirmed).toEqual(confirmed);
  });

  it("bestätigte Werte gehen mit der Eingabe an das Backend", () => {
    expect(toRoundInput(base).course).toMatchObject({ kind: "DB", teeColor: "Gelb", confirmRating: confirmed });
    expect(toRoundInput({ ...base, ratingConfirmed: null }).course).not.toHaveProperty("confirmRating");
  });

  it("Löcher-Auswahl: 18 Loch, vordere/hintere neun bzw. 9-Loch-Platz", () => {
    expect(holesChoiceOf({ holes: 18, nine: null }, 18)).toBe("18");
    expect(holesChoiceOf({ holes: 9, nine: "BACK" }, 18)).toBe("BACK");
    expect(holesChoiceOf({ holes: 9, nine: null }, 18)).toBe("FRONT");
    expect(holesChoiceOf({ holes: 9, nine: "FRONT" }, 9)).toBe("9");
    expect(holesPatch("BACK")).toEqual({ holes: 9, nine: "BACK" });
    expect(holesPatch("9")).toEqual({ holes: 9, nine: null });
    expect(holesPatch("18")).toEqual({ holes: 18, nine: null });
  });
});
