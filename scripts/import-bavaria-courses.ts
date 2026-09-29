/**
 * Bayern-Datenimport (Discovery + Datenqualität)
 *
 *   npm run import:bavaria -- [Optionen]
 *
 * Ablauf:
 *  1. BGV-Golfclubliste ermitteln (alle Seiten) – oder gespeicherte HTML-Seiten / Discovery-CSV
 *  2. Namen normalisieren
 *  3. Anlagen deduplizieren (untereinander und gegen die Datenbank)
 *  4. offizielle Websites ermitteln (Detailseiten, optional)
 *  5. verfügbare Rating-Daten erfassen (optional, nur als Prüfkandidaten!)
 *  6. Datenbank aktualisieren (nur mit --apply)
 *  7. Quellen speichern (BGV-URL, Website)
 *  8. Änderungen protokollieren (change_log, import_runs, JSON-Bericht)
 *  9. fehlende Werte reporten (Datenqualitätsbericht)
 *
 * Es werden NIE Werte als verifiziert markiert und NIE Ratingwerte erfunden.
 * Gefundene CR/Slope-Angaben landen ausschließlich in einer Prüf-CSV
 * (verified=false), die nach manueller Kontrolle im Admin importiert werden kann.
 *
 * Optionen:
 *   --list-url <url>     URL der BGV-Clubübersicht (sonst: Suche ab Startseite / BGV_CLUB_LIST_URL)
 *   --max-pages <n>      maximale Seitenzahl (Standard 60)
 *   --html-dir <dir>     gespeicherte HTML-Seiten statt Live-Abruf
 *   --csv <datei>        Discovery-CSV (name,city,postal_code,website,bgv_url,holes,region)
 *   --details            BGV-Detailseiten abrufen (Website/Adresse)
 *   --scan-websites      Club-Websites nach Scorekarten/Ratingangaben durchsuchen (Kandidaten)
 *   --apply              Änderungen in die Datenbank schreiben (sonst Probelauf)
 *   --delay <ms>         Pause zwischen Abrufen (Standard 1500)
 */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { closeDb } from "@/db/client";
import { findBestMatch } from "@/lib/courses/duplicates";
import { normalizeCourseName } from "@/lib/courses/normalize";
import { buildQualityReport } from "@/lib/courses/quality";
import { parseRegion } from "@/lib/courses/regions";
import type { CourseDto, LayoutType } from "@/lib/courses/types";
import { CSV_OPTIONAL_COLUMNS, CSV_REQUIRED_COLUMNS } from "@/lib/courses/csv";
import {
  classifyFacility,
  extractRatingCandidates,
  extractWebsiteFromDetail,
  findScorecardLinks,
  isBavarianPostalCode,
  parseClubListHtml,
  type DiscoveredClub,
  type RatingCandidate,
} from "@/lib/importer/parseClubList";
import {
  createCourse,
  createLayout,
  loadAllCourses,
  recordImportRun,
  updateCourse,
} from "@/server/courseRepository";

const BGV_HOME = "https://www.bayerischer-golfverband.de/";
const USER_AGENT = "HCP-Rechner-Bayern-Importer/1.0 (Datenpflege Golfplatzverzeichnis; respektiert robots.txt)";

interface Options {
  listUrl: string | null;
  maxPages: number;
  htmlDir: string | null;
  csv: string | null;
  details: boolean;
  scanWebsites: boolean;
  apply: boolean;
  delay: number;
}

function parseArgs(argv: string[]): Options {
  const get = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] ?? null : null;
  };
  return {
    listUrl: get("--list-url") ?? process.env.BGV_CLUB_LIST_URL ?? null,
    maxPages: Number(get("--max-pages") ?? 60),
    htmlDir: get("--html-dir"),
    csv: get("--csv"),
    details: argv.includes("--details"),
    scanWebsites: argv.includes("--scan-websites"),
    apply: argv.includes("--apply"),
    delay: Number(get("--delay") ?? 1500),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const robotsCache = new Map<string, string[]>();

async function allowedByRobots(url: string): Promise<boolean> {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    const disallow: string[] = [];
    try {
      const res = await fetch(`${u.origin}/robots.txt`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        let applies = false;
        for (const line of (await res.text()).split(/\r?\n/)) {
          const [k, ...rest] = line.split(":");
          const key = k.trim().toLowerCase();
          const value = rest.join(":").trim();
          if (key === "user-agent") applies = value === "*";
          else if (applies && key === "disallow" && value) disallow.push(value);
        }
      }
    } catch {
      // robots.txt nicht erreichbar → keine Einschränkung bekannt
    }
    robotsCache.set(u.origin, disallow);
  }
  return !robotsCache.get(u.origin)!.some((p) => u.pathname.startsWith(p));
}

async function fetchHtml(url: string, delay: number): Promise<string> {
  if (!(await allowedByRobots(url))) throw new Error(`robots.txt verbietet ${url}`);
  await sleep(delay);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(30000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  return res.text();
}

async function discoverListUrl(delay: number): Promise<string> {
  const html = await fetchHtml(BGV_HOME, delay);
  const { load } = await import("cheerio");
  const $ = load(html);
  let found: string | null = null;
  $("a[href]").each((_, a) => {
    if (found) return;
    const label = `${$(a).text()} ${$(a).attr("href")}`.toLowerCase();
    if (/golfclubs|clubsuche|club-suche|golfanlagen|mitgliedsclubs|clubfinder|golfplatzsuche|clubs\b|vereine/.test(label)) {
      found = new URL($(a).attr("href")!, BGV_HOME).toString();
    }
  });
  if (!found) throw new Error("Clubübersicht auf der BGV-Startseite nicht gefunden – bitte --list-url angeben");
  return found;
}

function discoveryFromCsv(file: string): DiscoveredClub[] {
  const parsed = Papa.parse<Record<string, string>>(fs.readFileSync(file, "utf8"), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  return parsed.data
    .filter((r) => r.name?.trim())
    .map((r) => {
      const cls = classifyFacility(`${r.name} ${r.holes ?? ""} ${r.type ?? ""}`);
      const holes = r.holes ? r.holes.split(/[^\d]+/).filter(Boolean).map(Number) : cls.holes;
      return {
        name: r.name.trim(),
        city: r.city?.trim() || null,
        postalCode: r.postal_code?.trim() || null,
        address: r.address?.trim() || null,
        website: r.website?.trim() || null,
        detailUrl: r.bgv_url?.trim() || null,
        region: parseRegion(r.region),
        facilityType: cls.facilityType,
        holes,
        rawText: JSON.stringify(r),
      };
    });
}

function layoutFor(holes: number): { type: LayoutType; holesCount: number; name: string } | null {
  if (holes === 9) return { type: "9_HOLE", holesCount: 9, name: "9-Loch-Platz" };
  if (holes === 18) return { type: "18_HOLE", holesCount: 18, name: "18-Loch-Platz" };
  if (holes === 27) return { type: "27_HOLE", holesCount: 27, name: "27-Loch-Anlage" };
  if (holes === 36) return { type: "36_HOLE", holesCount: 36, name: "36-Loch-Anlage" };
  return null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const rawDir = path.join(process.cwd(), "data", "raw", "bgv", runId);
  const reportDir = path.join(process.cwd(), "data", "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
    console.warn("Hinweis: HTTPS_PROXY ist gesetzt – ggf. NODE_USE_ENV_PROXY=1 setzen, damit fetch den Proxy nutzt.");
  }
  console.log(`Bayern-Import ${runId} – ${options.apply ? "SCHREIBT in die Datenbank" : "Probelauf (ohne --apply)"}`);

  // 1. Discovery
  const discovered: DiscoveredClub[] = [];
  const errors: string[] = [];
  const pages: { url: string; entries: number; strategy: string }[] = [];
  if (options.csv) {
    discovered.push(...discoveryFromCsv(options.csv));
  } else if (options.htmlDir) {
    for (const file of fs.readdirSync(options.htmlDir).filter((f) => f.endsWith(".html")).sort()) {
      const page = parseClubListHtml(fs.readFileSync(path.join(options.htmlDir, file), "utf8"), options.listUrl ?? BGV_HOME);
      pages.push({ url: file, entries: page.entries.length, strategy: page.strategy });
      discovered.push(...page.entries);
    }
  } else {
    fs.mkdirSync(rawDir, { recursive: true });
    let url: string | null = options.listUrl ?? (await discoverListUrl(options.delay));
    const visited = new Set<string>();
    while (url && !visited.has(url) && visited.size < options.maxPages) {
      visited.add(url);
      try {
        const html = await fetchHtml(url, options.delay);
        fs.writeFileSync(path.join(rawDir, `page-${String(visited.size).padStart(3, "0")}.html`), html);
        const page = parseClubListHtml(html, url);
        pages.push({ url, entries: page.entries.length, strategy: page.strategy });
        console.log(`  Seite ${visited.size}: ${page.entries.length} Einträge (${page.strategy}) ${url}`);
        discovered.push(...page.entries);
        url = page.nextPageUrl;
      } catch (error) {
        errors.push(String(error));
        console.error(`  Fehler: ${error}`);
        break;
      }
    }
  }

  // 2./3. Normalisieren + interne Duplikate
  const unique: DiscoveredClub[] = [];
  const internalDuplicates: { kept: string; dropped: string }[] = [];
  for (const club of discovered) {
    const match = findBestMatch(
      { id: club.name, name: club.name, city: club.city, postalCode: club.postalCode, website: club.website },
      unique.map((u) => ({ ...u, id: u.name })),
      0.8,
    );
    if (match) internalDuplicates.push({ kept: match.item.name, dropped: club.name });
    else unique.push(club);
  }
  const outsideBavaria = unique.filter((c) => c.postalCode && !isBavarianPostalCode(c.postalCode));
  console.log(`Entdeckt: ${discovered.length} Einträge, ${unique.length} nach Deduplizierung, ${outsideBavaria.length} mit PLZ außerhalb Bayerns (nur markiert)`);

  // 4./5. Detailseiten & Websites
  const ratingCandidates: (RatingCandidate & { courseName: string; city: string | null })[] = [];
  for (const club of unique) {
    if (options.details && club.detailUrl && !club.website) {
      try {
        const detail = extractWebsiteFromDetail(await fetchHtml(club.detailUrl, options.delay), club.detailUrl);
        club.website = detail.website;
        const cls = classifyFacility(detail.text);
        if (club.holes.length === 0) club.holes = cls.holes;
        if (club.facilityType === "GOLF_COURSE" && cls.facilityType !== "GOLF_COURSE" && club.holes.length === 0) {
          club.facilityType = cls.facilityType;
        }
      } catch (error) {
        errors.push(`${club.name}: ${error}`);
      }
    }
    if (options.scanWebsites && club.website) {
      try {
        const home = await fetchHtml(club.website, options.delay);
        const links = [club.website, ...findScorecardLinks(home, club.website)];
        for (const link of links.slice(0, 4)) {
          const html = link === club.website ? home : await fetchHtml(link, options.delay).catch(() => "");
          const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
          for (const c of extractRatingCandidates(text, link)) {
            ratingCandidates.push({ ...c, courseName: club.name, city: club.city });
          }
        }
      } catch (error) {
        errors.push(`${club.name} (Website): ${error}`);
      }
    }
  }

  // 6./7. Datenbank abgleichen
  const existing: CourseDto[] = await loadAllCourses({ includeInactive: true });
  const created: string[] = [];
  const updated: { name: string; fields: string[] }[] = [];
  const conflicts: { name: string; field: string; existing: unknown; discovered: unknown }[] = [];
  const uncertain: { name: string; possibleMatch: string; score: number }[] = [];
  const checkedAt = new Date().toISOString().slice(0, 10);

  for (const club of unique) {
    const match = findBestMatch(
      { id: "__new__", name: club.name, city: club.city, postalCode: club.postalCode, address: club.address, website: club.website },
      existing,
      0.6,
    );
    if (match && match.pair.score >= 0.8) {
      const c = match.item;
      const fill: Record<string, string | null> = {};
      const compare: [keyof CourseDto, string | null][] = [
        ["website", club.website],
        ["bayernGolfverbandUrl", club.detailUrl],
        ["postalCode", club.postalCode],
        ["city", club.city],
        ["address", club.address],
        ["region", club.region],
      ];
      for (const [field, value] of compare) {
        if (!value) continue;
        const current = c[field] as string | null;
        if (current === null || current === "") fill[field] = value;
        else if (normalizeCourseName(String(current)) !== normalizeCourseName(value)) {
          conflicts.push({ name: c.name, field, existing: current, discovered: value });
        }
      }
      if (Object.keys(fill).length > 0) {
        updated.push({ name: c.name, fields: Object.keys(fill) });
        if (options.apply) {
          await updateCourse(c.id, { ...c, ...fill, layouts: undefined }, "IMPORTER", "import-bavaria-courses");
        }
      }
      continue;
    }
    if (match) {
      uncertain.push({ name: club.name, possibleMatch: match.item.name, score: match.pair.score });
      continue;
    }
    created.push(club.name);
    if (!options.apply) continue;
    const course = await createCourse(
      {
        name: club.name,
        city: club.city,
        postalCode: club.postalCode,
        address: club.address,
        website: club.website,
        region: club.region,
        facilityType: club.facilityType,
        bayernGolfverbandUrl: club.detailUrl ?? pages[0]?.url ?? null,
        verified: false,
        notes: `Aus BGV-Clubübersicht übernommen am ${checkedAt}. Stammdaten und Ratings sind ungeprüft.`,
      },
      "IMPORTER",
      "import-bavaria-courses",
    );
    if (club.facilityType !== "DRIVING_RANGE") {
      for (const h of club.holes) {
        const l = layoutFor(h);
        if (l) await createLayout({ courseId: course.id, ...l, notes: "automatisch aus der BGV-Liste erkannt" }, "IMPORTER", "import-bavaria-courses");
      }
    }
  }

  // Rating-Kandidaten als Prüf-CSV (verified=false)
  let candidatesFile: string | null = null;
  if (ratingCandidates.length > 0) {
    candidatesFile = path.join(reportDir, `rating-candidates-${runId}.csv`);
    const rows = ratingCandidates.map((c) => ({
      course_name: c.courseName,
      official_name: "",
      city: c.city ?? "",
      region: "",
      layout_name: "BITTE PRÜFEN",
      holes: c.holes ?? "",
      gender: c.gender ?? "",
      tee_color: c.teeColor ?? "",
      tee_name: "",
      par: "",
      course_rating: String(c.courseRating).replace(".", ","),
      slope_rating: c.slopeRating,
      yardage: "",
      source_type: "CLUB_OFFICIAL",
      source_url: c.sourceUrl,
      valid_from: "",
      valid_to: "",
      verified: "false",
      checked_at: checkedAt,
      confidence: "LOW",
    }));
    fs.writeFileSync(candidatesFile, Papa.unparse(rows, { columns: [...CSV_REQUIRED_COLUMNS, ...CSV_OPTIONAL_COLUMNS] }));
  }

  // 8./9. Bericht
  const after = options.apply ? await loadAllCourses({ includeInactive: true }) : existing;
  const quality = buildQualityReport(after, checkedAt);
  const report = {
    runId,
    mode: options.apply ? "APPLY" : "DRY_RUN",
    options,
    pages,
    discovered: discovered.length,
    unique: unique.length,
    internalDuplicates,
    outsideBavaria: outsideBavaria.map((c) => `${c.name} (${c.postalCode})`),
    created,
    updated,
    conflicts,
    uncertain,
    ratingCandidates: ratingCandidates.length,
    candidatesFile,
    errors,
    quality: { ...quality, issues: quality.issues.length },
  };
  const reportFile = path.join(reportDir, `bavaria-import-${runId}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({ ...report, discoveredEntries: unique }, null, 2));
  if (options.apply) await recordImportRun("BGV_DISCOVERY", errors.length ? "COMPLETED_WITH_ERRORS" : "COMPLETED", report);

  console.log("\n=== Datenqualität Bayern ===");
  console.log(`Bayern Golfanlagen:                ${quality.golfFacilities}`);
  console.log(`Verifizierte Anlagen:              ${quality.verifiedFacilities}`);
  console.log(`Nicht verifizierte Anlagen:        ${quality.unverifiedFacilities}`);
  console.log(`Anlagen mit verifiziertem Rating:  ${quality.facilitiesWithVerifiedRating}`);
  console.log(`Anlagen mit 18-Loch-Rating:        ${quality.facilitiesWith18HoleRating}`);
  console.log(`Anlagen mit 9-Loch-Rating:         ${quality.facilitiesWith9HoleRating}`);
  console.log(`Anlagen mit mehreren Tee-Ratings:  ${quality.facilitiesWithMultipleTees}`);
  console.log(`Fehlende CR:                       ${quality.missingCourseRating}`);
  console.log(`Fehlende Slope:                    ${quality.missingSlope}`);
  console.log(`Doppelte Anlagen (Verdacht):       ${quality.duplicates.length}`);
  console.log(`\nNeu: ${created.length} · ergänzt: ${updated.length} · Konflikte: ${conflicts.length} · unsicher: ${uncertain.length} · Rating-Kandidaten: ${ratingCandidates.length}`);
  console.log(`Bericht: ${path.relative(process.cwd(), reportFile)}`);
  if (candidatesFile) console.log(`Rating-Kandidaten (manuell prüfen!): ${path.relative(process.cwd(), candidatesFile)}`);
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
