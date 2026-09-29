/**
 * Parser für die Golfclub-Übersicht des Bayerischen Golfverbands (Discovery).
 *
 * Die Seitenstruktur kann sich ändern. Der Parser arbeitet deshalb mit
 * mehreren Strategien (JSON-LD, Einträge mit Postleitzahl, Tabellenzeilen)
 * und liefert nur Stammdaten – niemals Ratingwerte.
 */
import * as cheerio from "cheerio";
import { parseRegion } from "@/lib/courses/regions";
import type { FacilityType } from "@/lib/courses/types";

export interface DiscoveredClub {
  name: string;
  city: string | null;
  postalCode: string | null;
  address: string | null;
  website: string | null;
  detailUrl: string | null;
  region: string | null;
  facilityType: FacilityType;
  holes: number[];
  rawText: string;
}

export interface ClubListPage {
  entries: DiscoveredClub[];
  nextPageUrl: string | null;
  strategy: "JSON_LD" | "ENTRY_BLOCKS" | "TABLE" | "NONE";
}

/** Bayerische Postleitzahlbereiche (inkl. Grenzregionen wie Aschaffenburg, Neu-Ulm, Lindau). */
export function isBavarianPostalCode(plz: string): boolean {
  const n = Number(plz);
  if (!/^\d{5}$/.test(plz)) return false;
  return (
    (n >= 80000 && n <= 87999) ||
    (n >= 88100 && n <= 88179) ||
    (n >= 89200 && n <= 89449) ||
    (n >= 90000 && n <= 97999) ||
    (n >= 63700 && n <= 63939)
  );
}

const PLZ_CITY = /\b(\d{5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-/ ]{1,40}?)(?=\s*(?:$|[,|•·\n\r]|Tel|Fon|www|http|E-?Mail|\d))/;

export function extractPostalCity(text: string): { postalCode: string; city: string } | null {
  const m = text.replace(/ /g, " ").match(PLZ_CITY);
  if (!m) return null;
  return { postalCode: m[1], city: m[2].trim().replace(/\s{2,}/g, " ") };
}

/** Erkennt Anlagentyp und Lochzahlen aus Freitext („18-Loch-Platz, 9-Loch-Kurzplatz“). */
export function classifyFacility(text: string): { facilityType: FacilityType; holes: number[] } {
  const t = text.toLowerCase();
  const holes = new Set<number>();
  for (const m of t.matchAll(/\b(6|9|12|18|27|36|45|54)\s*[- ]?\s*(?:loch|holes?)\b/g)) holes.add(Number(m[1]));
  const drivingRange = /driving\s*range|übungsanlage|uebungsanlage|golf\s*range\b/.test(t);
  const par3 = /par[\s-]*3/.test(t);
  const short = /kurzplatz|kurz-platz|pitch\s*&\s*putt|pitch\s*and\s*putt/.test(t);
  let facilityType: FacilityType = "GOLF_COURSE";
  const hasRegularCourse = [...holes].some((h) => h >= 9) && !short && !par3;
  if (drivingRange && holes.size === 0) facilityType = "DRIVING_RANGE";
  else if (par3 && !hasRegularCourse && !/18/.test(t)) facilityType = "PAR3";
  else if (short && !hasRegularCourse && ![...holes].some((h) => h >= 18)) facilityType = "SHORT_COURSE";
  return { facilityType, holes: [...holes].sort((a, b) => b - a) };
}

function absolute(url: string | undefined, base: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").replace(/^[\s•·\-–]+|[\s•·\-–]+$/g, "").trim();
}

function fromJsonLd($: cheerio.CheerioAPI, baseUrl: string): DiscoveredClub[] {
  const results: DiscoveredClub[] = [];
  const types = new Set(["GolfCourse", "SportsClub", "SportsOrganization", "Organization", "LocalBusiness", "SportsActivityLocation"]);
  $('script[type="application/ld+json"]').each((_, el) => {
    let data: unknown;
    try {
      data = JSON.parse($(el).text());
    } catch {
      return;
    }
    const items: unknown[] = Array.isArray(data)
      ? data
      : (data as { "@graph"?: unknown[] })["@graph"] ?? (data as { itemListElement?: unknown[] }).itemListElement ?? [data];
    for (const raw of items) {
      const item = ((raw as { item?: unknown }).item ?? raw) as Record<string, unknown>;
      const type = item["@type"];
      const typeList = Array.isArray(type) ? type : [type];
      if (!typeList.some((t) => types.has(String(t)))) continue;
      const address = (item.address ?? {}) as Record<string, string>;
      const name = cleanName(String(item.name ?? ""));
      if (!name) continue;
      const text = [name, item.description].filter(Boolean).join(" ");
      const cls = classifyFacility(text);
      results.push({
        name,
        city: address.addressLocality ?? null,
        postalCode: address.postalCode ?? null,
        address: address.streetAddress ?? null,
        website: absolute(item.sameAs as string | undefined, baseUrl) ?? absolute(item.url as string | undefined, baseUrl),
        detailUrl: absolute(item.url as string | undefined, baseUrl),
        region: parseRegion(address.addressRegion),
        facilityType: String(typeList[0]) === "GolfCourse" && cls.facilityType === "DRIVING_RANGE" ? "GOLF_COURSE" : cls.facilityType,
        holes: cls.holes,
        rawText: text,
      });
    }
  });
  return results;
}

function fromBlocks($: cheerio.CheerioAPI, baseUrl: string): DiscoveredClub[] {
  const baseHost = hostOf(baseUrl);
  const results: DiscoveredClub[] = [];
  const seen = new Set<string>();
  const candidates = $("article, li, .card, .club, .item, .entry, .result, .teaser, div[class*='club'], div[class*='list-item']");
  candidates.each((_, el) => {
    const node = $(el);
    // nur „Blätter“: Blöcke, die keine weiteren Kandidaten mit PLZ enthalten
    if (node.find("article, li, .card, .club, .item, .entry, .result, .teaser").filter((__, c) => /\b\d{5}\b/.test($(c).text())).length > 0) return;
    const text = node.text().replace(/\s+/g, " ").trim();
    if (text.length < 8 || text.length > 1200) return;
    const pc = extractPostalCity(node.text());
    if (!pc) return;
    const heading = node.find("h1, h2, h3, h4, h5, strong, b, .title, .name").first().text();
    const firstLink = node.find("a").first();
    const name = cleanName(heading || firstLink.text() || text.split(pc.postalCode)[0]);
    if (!name || name.length < 3 || /^\d/.test(name)) return;
    const key = `${name.toLowerCase()}|${pc.postalCode}`;
    if (seen.has(key)) return;
    seen.add(key);
    let website: string | null = null;
    let detailUrl: string | null = null;
    node.find("a[href]").each((__, a) => {
      const href = absolute($(a).attr("href"), baseUrl);
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (hostOf(href) === baseHost) detailUrl = detailUrl ?? href;
      else if (/^https?:/.test(href)) website = website ?? href;
    });
    const afterName = text.startsWith(name) ? text.slice(name.length) : text;
    const street = afterName.match(/([A-ZÄÖÜ][\wäöüß.\-]*(?: [\wäöüß.\-]+){0,3}?(?:straße|str\.|weg|platz|allee|ring|gasse|hof|berg|feld)\s*\d+[a-z]?)/i);
    const cls = classifyFacility(text);
    results.push({
      name,
      city: pc.city,
      postalCode: pc.postalCode,
      address: street ? street[1].trim() : null,
      website,
      detailUrl,
      region: parseRegion(text.match(/\b(Oberbayern|Niederbayern|Oberpfalz|Oberfranken|Mittelfranken|Unterfranken|Schwaben)\b/)?.[1]),
      facilityType: cls.facilityType,
      holes: cls.holes,
      rawText: text,
    });
  });
  return results;
}

function fromTable($: cheerio.CheerioAPI, baseUrl: string): DiscoveredClub[] {
  const results: DiscoveredClub[] = [];
  $("table tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 2) return;
    const text = $(tr).text().replace(/\s+/g, " ").trim();
    const pc = extractPostalCity(cells.toArray().map((c) => $(c).text()).join("\n"));
    if (!pc) return;
    const name = cleanName($(cells[0]).text());
    if (!name) return;
    const link = $(tr).find("a[href]").first().attr("href");
    const cls = classifyFacility(text);
    results.push({
      name,
      city: pc.city,
      postalCode: pc.postalCode,
      address: null,
      website: null,
      detailUrl: absolute(link, baseUrl),
      region: null,
      facilityType: cls.facilityType,
      holes: cls.holes,
      rawText: text,
    });
  });
  return results;
}

function findNextPage($: cheerio.CheerioAPI, baseUrl: string): string | null {
  const rel = $('a[rel="next"], link[rel="next"]').attr("href");
  if (rel) return absolute(rel, baseUrl);
  let next: string | null = null;
  $("a[href]").each((_, a) => {
    if (next) return;
    const label = ($(a).text() + " " + ($(a).attr("aria-label") ?? "") + " " + ($(a).attr("title") ?? "")).trim().toLowerCase();
    if (/^(weiter|nächste|naechste|next|›|»|>)\b|nächste seite|next page|weiter\s*›/.test(label)) {
      next = absolute($(a).attr("href"), baseUrl);
    }
  });
  return next && next !== baseUrl ? next : null;
}

/** Fügt zwischen Block-Elementen Leerzeichen ein, damit Texte nicht zusammenkleben. */
export function spaceBlocks(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|td|th|span|a|strong|b|dt|dd|address|section|article)>/gi, "$& ");
}

export function parseClubListHtml(html: string, baseUrl: string): ClubListPage {
  const $ = cheerio.load(spaceBlocks(html));
  const nextPageUrl = findNextPage($, baseUrl);
  const jsonLd = fromJsonLd($, baseUrl);
  if (jsonLd.length > 0) return { entries: jsonLd, nextPageUrl, strategy: "JSON_LD" };
  const blocks = fromBlocks($, baseUrl);
  if (blocks.length > 0) return { entries: blocks, nextPageUrl, strategy: "ENTRY_BLOCKS" };
  const table = fromTable($, baseUrl);
  if (table.length > 0) return { entries: table, nextPageUrl, strategy: "TABLE" };
  return { entries: [], nextPageUrl, strategy: "NONE" };
}

/** Offizielle Website von einer Detailseite (erster externer Link, keine Social-Media-Links). */
export function extractWebsiteFromDetail(html: string, baseUrl: string): { website: string | null; text: string } {
  const $ = cheerio.load(spaceBlocks(html));
  const baseHost = hostOf(baseUrl);
  const blocked = /facebook|instagram|twitter|x\.com|youtube|linkedin|google|maps|apple\.com|xing|tiktok|pinterest/;
  let website: string | null = null;
  $("a[href]").each((_, a) => {
    if (website) return;
    const href = absolute($(a).attr("href"), baseUrl);
    if (!href || !/^https?:/.test(href)) return;
    const host = hostOf(href);
    if (!host || host === baseHost || blocked.test(host)) return;
    website = href;
  });
  return { website, text: $("body").text().replace(/\s+/g, " ").trim() };
}

export interface RatingCandidate {
  teeColor: string | null;
  gender: "M" | "F" | null;
  holes: 9 | 18 | null;
  courseRating: number;
  slopeRating: number;
  par: number | null;
  context: string;
  sourceUrl: string;
}

const TEE_MAP: Record<string, string> = {
  gelb: "Gelb",
  weiß: "Weiß",
  weiss: "Weiß",
  rot: "Rot",
  blau: "Blau",
  schwarz: "Schwarz",
  orange: "Orange",
  grün: "Grün",
  gruen: "Grün",
  silber: "Silber",
  gold: "Gold",
};

const CR_THEN_SLOPE = /(?:course[\s-]*rating|\bcr)\s*[:=]?\s*(\d{2}[,.]\d)[^;]{0,20}?(?:slope(?:[\s-]*rating)?|\bsr)\s*[:=]?\s*(\d{2,3})/gi;
const SLOPE_THEN_CR = /(?:slope(?:[\s-]*rating)?|\bsr)\s*[:=]?\s*(\d{2,3})[^;]{0,20}?(?:course[\s-]*rating|\bcr)\s*[:=]?\s*(\d{2}[,.]\d)/gi;

/**
 * Sucht CR/Slope-Angaben in Freitext (z. B. Scorekarte als HTML/Text).
 * Abschlag und Geschlecht werden nur aus demselben Satz/Abschnitt übernommen.
 * Ergebnisse sind KANDIDATEN zur manuellen Prüfung – nie verifiziert.
 */
export function extractRatingCandidates(text: string, sourceUrl: string): RatingCandidate[] {
  const results: RatingCandidate[] = [];
  const normalized = text.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ");
  // Abschnitte: Zeilenumbruch, Semikolon oder Satzpunkt (nicht Dezimalpunkt)
  const segments = normalized.split(/[;\n\r]|\.(?!\d)/);
  for (const segment of segments) {
    const found: { cr: number; slope: number; index: number }[] = [];
    for (const m of segment.matchAll(CR_THEN_SLOPE)) {
      found.push({ cr: Number(m[1].replace(",", ".")), slope: Number(m[2]), index: m.index ?? 0 });
    }
    if (found.length === 0) {
      for (const m of segment.matchAll(SLOPE_THEN_CR)) {
        found.push({ cr: Number(m[2].replace(",", ".")), slope: Number(m[1]), index: m.index ?? 0 });
      }
    }
    for (const f of found) {
      if (!(f.slope >= 55 && f.slope <= 155) || !(f.cr >= 25 && f.cr <= 85)) continue;
      const lc = segment.toLowerCase();
      const before = lc.slice(0, f.index);
      const teeMatches = [...before.matchAll(/\b(gelb|weiß|weiss|rot|blau|schwarz|orange|grün|gruen|silber|gold)\b/g)];
      const tee = teeMatches.length ? teeMatches[teeMatches.length - 1][1] : null;
      results.push({
        teeColor: tee ? TEE_MAP[tee] ?? null : null,
        gender: /damen|ladies|women/.test(lc) ? "F" : /herren|\bmen\b|gents/.test(lc) ? "M" : null,
        holes: f.cr < 45 ? 9 : 18,
        courseRating: f.cr,
        slopeRating: f.slope,
        par: null,
        context: segment.trim().slice(0, 200),
        sourceUrl,
      });
    }
  }
  const unique = new Map<string, RatingCandidate>();
  for (const c of results) unique.set(`${c.teeColor}|${c.gender}|${c.courseRating}|${c.slopeRating}`, c);
  return [...unique.values()];
}

/** Links auf der Club-Website, die wahrscheinlich Scorekarte/Platzdaten enthalten. */
export function findScorecardLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();
  $("a[href]").each((_, a) => {
    const label = `${$(a).text()} ${$(a).attr("href")}`.toLowerCase();
    if (/scorekarte|scorecard|score-karte|course[\s-]*rating|slope|platzdaten|course[\s-]*handicap|vorgabe|spielvorgabe|platzinfo|der platz|unser platz/.test(label)) {
      const href = absolute($(a).attr("href"), baseUrl);
      if (href && /^https?:/.test(href)) links.add(href);
    }
  });
  return [...links].slice(0, 10);
}
