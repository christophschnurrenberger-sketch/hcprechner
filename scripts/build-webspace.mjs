#!/usr/bin/env node
/**
 * Baut die Webspace-Edition und packt sie als ZIP für den FTP-Upload.
 *
 *   npm run build:webspace                 → release/golf-hcp-rechner-webspace-<version>.zip
 *   npm run build:webspace -- --seed x.json → andere Golfplatz-Startdaten mitliefern (JSON-Export des Admin-Bereichs)
 *   npm run build:webspace -- --no-seed     → leere Golfplatzdatenbank (Standard: data/seed/golfplaetze-bayern.json)
 *   npm run build:webspace -- --no-zip      → nur Ordner release/golf-hcp-rechner/ erzeugen
 *
 * Ablauf: statischer Next.js-Export (BUILD_TARGET=webspace) → PHP-Dateien aus webspace/php
 * dazukopieren → Startdaten, version.txt, LIESMICH.txt → ZIP (ohne externe Werkzeuge).
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out");
const RELEASE = join(ROOT, "release");
const APP_DIR_NAME = "golf-hcp-rechner";
const STAGE = join(RELEASE, APP_DIR_NAME);
const PLACEHOLDER = "/__HCP_BASE__";

const args = process.argv.slice(2);
const DEFAULT_SEED = join(ROOT, "data", "seed", "golfplaetze-bayern.json");
// Standard: die mitgelieferten Startdaten aus data/seed (mit --seed <datei> ersetzbar, --no-seed = leer)
const seedArg = args.includes("--seed") ? args[args.indexOf("--seed") + 1] : args.includes("--no-seed") ? null : existsSync(DEFAULT_SEED) ? DEFAULT_SEED : null;
const skipBuild = args.includes("--skip-build");
const noZip = args.includes("--no-zip");

function log(msg) {
  console.log(`▸ ${msg}`);
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// 1. Statischer Export ------------------------------------------------------
if (!skipBuild) {
  log("Next.js-Build (Webspace-Edition, statischer Export) …");
  rmSync(OUT, { recursive: true, force: true });
  const nextBin = join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
  const res = spawnSync(nextBin, ["build"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, BUILD_TARGET: "webspace", NEXT_TELEMETRY_DISABLED: "1" },
  });
  if (res.status !== 0) fail("Next.js-Build fehlgeschlagen");
}
if (!existsSync(join(OUT, "index.html"))) fail("out/index.html fehlt – Build prüfen");
if (!readFileSync(join(OUT, "index.html"), "utf8").includes(PLACEHOLDER)) {
  fail(`Platzhalter ${PLACEHOLDER} nicht in out/index.html gefunden – wurde mit BUILD_TARGET=webspace gebaut?`);
}

// 2. Paketordner ------------------------------------------------------------
log(`Paketordner ${relative(ROOT, STAGE)} …`);
rmSync(RELEASE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });
cpSync(OUT, STAGE, { recursive: true });
cpSync(join(ROOT, "webspace", "php"), STAGE, { recursive: true });

// 3. Golfplatz-Startdaten ---------------------------------------------------
const emptyDataset = { format: "golf-hcp-rechner/courses", schemaVersion: 1, revision: 0, updatedAt: null, courses: [], changes: [], importRuns: [] };
let seed = emptyDataset;
if (seedArg) {
  const raw = JSON.parse(readFileSync(seedArg, "utf8"));
  if (raw.format === emptyDataset.format && Array.isArray(raw.courses)) seed = { ...raw, revision: 0, changes: [], importRuns: [] };
  else if (Array.isArray(raw.courses)) seed = { ...emptyDataset, courses: raw.courses };
  else fail(`${seedArg}: kein Golfplatz-Datensatz (erwartet { courses: [...] })`);
  log(`Startdaten: ${seed.courses.length} Anlagen aus ${relative(ROOT, seedArg)}`);
}
writeFileSync(join(STAGE, "golfplaetze-daten.json"), JSON.stringify(seed));

// 4. Version und Anleitung --------------------------------------------------
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const git = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" });
const commit = git.status === 0 ? git.stdout.trim() : "";
const stamp = new Date().toISOString().slice(0, 10);
const version = `${pkg.version} (${stamp}${commit ? `, ${commit}` : ""})`;
writeFileSync(join(STAGE, "version.txt"), `${version}\n`);
writeFileSync(join(STAGE, "LIESMICH.txt"), readFileSync(join(ROOT, "webspace", "LIESMICH.txt"), "utf8").replace("{{VERSION}}", version));

// 5. Kontrolle: keine Server-Artefakte, PHP-Dateien vollständig -------------
for (const required of ["install.php", "gate.php", "api/_lib.php", "api/auth.php", "api/me.php", "api/admin.php", "api/courses.php", "api/_community.php", "api/community.php", "data/.htaccess", "404.html", "login/index.html", "member/index.html", "member/community/index.html", "member/stats/index.html", "admin/index.html", "admin/community/index.html"]) {
  if (!existsSync(join(STAGE, required))) fail(`${required} fehlt im Paket`);
}

// 6. ZIP ----------------------------------------------------------------------
function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/** Minimaler ZIP-Schreiber (Deflate, UTF-8-Dateinamen) – keine Abhängigkeiten. */
function createZip(baseDir, prefix) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const { time, day } = dosDateTime(new Date());
  for (const file of listFiles(baseDir).sort()) {
    const name = Buffer.from(`${prefix}/${relative(baseDir, file).split(sep).join("/")}`, "utf8");
    const data = readFileSync(file);
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4); // erstellt unter Unix
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((0o100644 << 16) >>> 0), 38); // -rw-r--r--
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  const count = centrals.length / 2;
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return { buffer: Buffer.concat([...locals, centralBuf, end]), count };
}

if (!noZip) {
  const zipName = `golf-hcp-rechner-webspace-${pkg.version}.zip`;
  const { buffer, count } = createZip(STAGE, APP_DIR_NAME);
  writeFileSync(join(RELEASE, zipName), buffer);
  log(`ZIP: release/${zipName} (${count} Dateien, ${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
}
log("Fertig. Hochladen und install.php im Browser aufrufen – Anleitung in LIESMICH.txt.");
