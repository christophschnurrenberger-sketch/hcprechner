/** Anzeigeformatierung (deutsch). Keine fachliche Rundung – nur Darstellung. */

export function formatDecimal(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return value.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** HCPI-Darstellung inkl. Plus-Handicap („+1,2“ für −1,2). */
export function formatHcp(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  if (value < 0) return `+${formatDecimal(-value)}`;
  return formatDecimal(value);
}

export function formatSigned(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return "–";
  if (value === 0) return formatDecimal(0, decimals);
  const s = formatDecimal(Math.abs(value), decimals);
  return value > 0 ? `+${s}` : `−${s}`;
}

export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  return value.toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

export function formatPcc(value: number): string {
  if (value === 0) return "0";
  return value > 0 ? `+${formatDecimal(value, Number.isInteger(value) ? 0 : 1)}` : `−${formatDecimal(-value, Number.isInteger(value) ? 0 : 1)}`;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
