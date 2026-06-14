import { mkdir, readFile, writeFile } from "node:fs/promises";

const LINE_SOURCE = "lines.json";
const OUTPUT_PATH = "cdn/tpg-lines-v1.json";

const sourceLines = JSON.parse(await readFile(LINE_SOURCE, "utf8"));
const byLine = new Map();

for (const sourceLine of sourceLines) {
  const line = canonicalLine(sourceLine?.number);
  const color = normalizeHex(sourceLine?.colour);
  if (!line || !color || byLine.has(line)) {
    continue;
  }

  byLine.set(line, {
    l: line,
    c: color,
    f: foregroundFor(color),
    t: String(sourceLine?.type ?? ""),
    u: String(sourceLine?.link ?? "")
  });
}

const lines = Array.from(byLine.values()).sort((a, b) => compareTransitLines(a.l, b.l));
const output = {
  v: 1,
  g: new Date().toISOString(),
  src: LINE_SOURCE,
  lines
};

await mkdir("cdn", { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(output));
console.log(`Wrote ${OUTPUT_PATH}`);
console.log(`${lines.length} deduplicated TPG lines`);

function canonicalLine(value) {
  const line = String(value ?? "").trim().toUpperCase();
  if (!line) {
    return "";
  }

  if (/^\d+$/.test(line)) {
    return String(Number(line));
  }

  return /^[A-Z0-9+]{1,8}$/.test(line) ? line : "";
}

function normalizeHex(value) {
  const hex = String(value ?? "").trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(hex) ? hex : "";
}

function foregroundFor(hex) {
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const luminance = 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return blackContrast >= whiteContrast ? "#111111" : "#ffffff";
}

function toLinear(value) {
  return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function compareTransitLines(a, b) {
  const numberA = /^\d+$/.test(a) ? Number(a) : Number.NaN;
  const numberB = /^\d+$/.test(b) ? Number(b) : Number.NaN;

  if (Number.isFinite(numberA) && Number.isFinite(numberB)) {
    return numberA - numberB;
  }

  if (Number.isFinite(numberA)) {
    return -1;
  }

  if (Number.isFinite(numberB)) {
    return 1;
  }

  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
