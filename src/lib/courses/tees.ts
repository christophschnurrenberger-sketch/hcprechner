/** Abschlagsfarben. Es wird nie angenommen, dass eine Anlage jede Farbe besitzt. */
export const TEE_COLORS = ["Grün", "Orange", "Rot", "Blau", "Gelb", "Weiß", "Schwarz", "Silber", "Gold"] as const;

export const TEE_SWATCH: Record<string, string> = {
  Grün: "#2f8f4e",
  Orange: "#f08a24",
  Rot: "#c8322f",
  Blau: "#2463b5",
  Gelb: "#f2c230",
  Weiß: "#ffffff",
  Schwarz: "#1f2326",
  Silber: "#b8bec4",
  Gold: "#c9a227",
};

/** Normalisiert Farbschreibweisen („gelb“, „Yellow“, „weiss“). */
export function normalizeTeeColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  const map: Record<string, string> = {
    gruen: "Grün",
    grün: "Grün",
    green: "Grün",
    orange: "Orange",
    rot: "Rot",
    red: "Rot",
    blau: "Blau",
    blue: "Blau",
    gelb: "Gelb",
    yellow: "Gelb",
    weiss: "Weiß",
    weiß: "Weiß",
    white: "Weiß",
    schwarz: "Schwarz",
    black: "Schwarz",
    silber: "Silber",
    silver: "Silber",
    gold: "Gold",
  };
  return map[v] ?? value.trim();
}

export function genderLabel(gender: "M" | "F" | null | undefined): string {
  return gender === "F" ? "Damen" : gender === "M" ? "Herren" : "–";
}

export function parseGender(value: string | null | undefined): "M" | "F" | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (["m", "h", "herren", "herr", "male", "men", "man"].includes(v)) return "M";
  if (["f", "w", "d", "damen", "dame", "female", "women", "woman"].includes(v)) return "F";
  return null;
}
