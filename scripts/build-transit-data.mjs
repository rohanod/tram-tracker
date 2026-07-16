import { mkdir, readFile, writeFile } from "node:fs/promises";

const METADATA_SOURCE = "new-data/tpg-lines.info.json";
const GEOMETRY_SOURCE = "new-data/tpg-routes.geojson";
const COLOR_SOURCE = "lines.json";
const OUTPUT_DIR = "storage-data";
const METADATA_OUTPUT = `${OUTPUT_DIR}/transit-metadata.json`;
const GEOMETRY_OUTPUT = `${OUTPUT_DIR}/transit-geometry.json`;
const SIMPLIFY_TOLERANCE_METERS = 12;

const metadataSource = JSON.parse(await readFile(METADATA_SOURCE, "utf8"));
const geometrySource = JSON.parse(await readFile(GEOMETRY_SOURCE, "utf8"));
const colorSource = JSON.parse(await readFile(COLOR_SOURCE, "utf8"));
const colors = new Map();

for (const item of colorSource) {
  const line = canonicalLine(item?.number);
  const color = normalizeHex(item?.colour);
  if (line && color && !colors.has(line)) {
    colors.set(line, {
      c: color,
      f: foregroundFor(color),
      t: String(item?.type ?? "")
    });
  }
}

const stopByKey = new Map();
const lines = [];
const directionIds = new Set();
let endpointMismatchCount = 0;

for (const sourceLine of metadataSource.lines ?? []) {
  const line = canonicalLine(sourceLine?.number);
  if (!line) continue;

  const directions = [];
  for (const sourceDirection of sourceLine.directions ?? []) {
    const id = String(sourceDirection?.id ?? "").trim();
    const headsign = String(sourceDirection?.headsign ?? sourceDirection?.to ?? "").trim();
    if (!id || !headsign || directionIds.has(id)) continue;
    directionIds.add(id);

    const stopKeys = [];
    for (const sourceStop of sourceDirection.stops ?? []) {
      const name = String(sourceStop?.name ?? "").trim();
      const lat = finiteNumber(sourceStop?.lat);
      const lon = finiteNumber(sourceStop?.lon);
      if (!name || lat === null || lon === null) continue;
      const key = `${name}|${lat.toFixed(5)}|${lon.toFixed(5)}`;
      if (!stopByKey.has(key)) {
        stopByKey.set(key, { n: name, a: round5(lat), o: round5(lon) });
      }
      stopKeys.push(key);
    }

    const first = stopByKey.get(stopKeys[0]);
    const last = stopByKey.get(stopKeys.at(-1));
    if (!endpointMatches(first?.n, sourceDirection?.from) || !endpointMatches(last?.n, sourceDirection?.to)) {
      endpointMismatchCount += 1;
    }

    directions.push({
      i: id,
      h: headsign,
      f: String(sourceDirection?.from ?? "").trim(),
      s: stopKeys
    });
  }

  const color = colors.get(line) ?? { c: "#666666", f: "#FFFFFF", t: String(sourceLine?.vehicle ?? "") };
  lines.push({
    l: line,
    c: color.c,
    f: color.f,
    t: String(sourceLine?.vehicle ?? color.t),
    d: directions
  });
}

lines.sort((a, b) => compareTransitLines(a.l, b.l));
const stopKeys = Array.from(stopByKey.keys());
const stopIndex = new Map(stopKeys.map((key, index) => [key, index]));
for (const line of lines) {
  for (const direction of line.d) {
    direction.s = direction.s.map((key) => stopIndex.get(key));
  }
}

const features = [];
for (const feature of geometrySource.features ?? []) {
  const id = String(feature?.properties?.id ?? "").trim();
  const line = canonicalLine(feature?.properties?.line);
  const paths = geometryPaths(feature?.geometry)
    .map((path) => simplifyPath(path, SIMPLIFY_TOLERANCE_METERS))
    .filter((path) => path.length >= 2)
    .map(encodePolyline);
  if (!id || !line || !paths.length) continue;
  features.push({ i: id, l: line, p: paths });
}

if (features.length !== directionIds.size) {
  throw new Error(`Direction/geometry mismatch: ${directionIds.size} metadata directions, ${features.length} geometry features`);
}

const generatedAt = new Date().toISOString();
const metadata = {
  v: 1,
  generatedAt,
  sourceGeneratedAt: String(metadataSource.generatedAt ?? ""),
  endpointMismatchCount,
  stops: stopKeys.map((key) => stopByKey.get(key)),
  lines
};
const geometry = { v: 1, generatedAt, precision: 5, features };

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(METADATA_OUTPUT, JSON.stringify(metadata));
await writeFile(GEOMETRY_OUTPUT, JSON.stringify(geometry));

const metadataBytes = Buffer.byteLength(JSON.stringify(metadata));
const geometryBytes = Buffer.byteLength(JSON.stringify(geometry));
const maxBytes = 5 * 1024 * 1024;
if (metadataBytes > maxBytes || geometryBytes > maxBytes) {
  throw new Error(`Lakebed file limit exceeded: metadata=${metadataBytes}, geometry=${geometryBytes}`);
}

console.log(`Wrote ${METADATA_OUTPUT} (${metadataBytes} bytes)`);
console.log(`Wrote ${GEOMETRY_OUTPUT} (${geometryBytes} bytes)`);
console.log(`${lines.length} lines, ${directionIds.size} directions, ${stopKeys.length} stops`);
console.log(`${endpointMismatchCount} direction stop lists do not match declared endpoints`);

function canonicalLine(value) {
  const line = String(value ?? "").trim().toUpperCase();
  if (!line) return "";
  return /^\d+$/.test(line) ? String(Number(line)) : /^[A-Z0-9+]{1,8}$/.test(line) ? line : "";
}

function normalizeHex(value) {
  const hex = String(value ?? "").trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(hex) ? hex : "";
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round5(value) {
  return Math.round(value * 100000) / 100000;
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function endpointMatches(stopName, endpointName) {
  const stop = normalizeName(stopName);
  const endpoint = normalizeName(endpointName);
  if (!stop || !endpoint) return false;
  const stopPlace = stop.split(" ").at(-1);
  const endpointPlace = endpoint.split(" ").at(-1);
  return stop.includes(endpointPlace) || endpoint.includes(stopPlace);
}

function geometryPaths(geometry) {
  if (geometry?.type === "LineString") return [geometry.coordinates];
  if (geometry?.type === "MultiLineString") return geometry.coordinates;
  return [];
}

function simplifyPath(points, toleranceMeters) {
  if (points.length <= 2) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  simplifyRange(points, 0, points.length - 1, toleranceMeters, keep);
  return points.filter((_, index) => keep[index]);
}

function simplifyRange(points, startIndex, endIndex, toleranceMeters, keep) {
  let maxDistance = 0;
  let maxIndex = startIndex;
  const start = coordinatePoint(points[startIndex]);
  const end = coordinatePoint(points[endIndex]);
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const distance = distanceToSegmentMeters(coordinatePoint(points[index]), start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = index;
    }
  }
  if (maxDistance > toleranceMeters) {
    keep[maxIndex] = true;
    simplifyRange(points, startIndex, maxIndex, toleranceMeters, keep);
    simplifyRange(points, maxIndex, endIndex, toleranceMeters, keep);
  }
}

function coordinatePoint(coordinate) {
  return { lat: Number(coordinate[1]), lon: Number(coordinate[0]) };
}

function distanceToSegmentMeters(point, start, end) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = metersPerDegreeLat * Math.cos((point.lat * Math.PI) / 180);
  const px = point.lon * metersPerDegreeLon;
  const py = point.lat * metersPerDegreeLat;
  const sx = start.lon * metersPerDegreeLon;
  const sy = start.lat * metersPerDegreeLat;
  const ex = end.lon * metersPerDegreeLon;
  const ey = end.lat * metersPerDegreeLat;
  const dx = ex - sx;
  const dy = ey - sy;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(px - sx, py - sy);
  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSquared));
  return Math.hypot(px - (sx + t * dx), py - (sy + t * dy));
}

function encodePolyline(coordinates) {
  let lastLat = 0;
  let lastLon = 0;
  let output = "";
  for (const coordinate of coordinates) {
    const lat = Math.round(Number(coordinate[1]) * 100000);
    const lon = Math.round(Number(coordinate[0]) * 100000);
    output += encodeSigned(lat - lastLat) + encodeSigned(lon - lastLon);
    lastLat = lat;
    lastLon = lon;
  }
  return output;
}

function encodeSigned(value) {
  let encoded = value < 0 ? ~(value << 1) : value << 1;
  let output = "";
  while (encoded >= 0x20) {
    output += String.fromCharCode((0x20 | (encoded & 0x1f)) + 63);
    encoded >>= 5;
  }
  return output + String.fromCharCode(encoded + 63);
}

function foregroundFor(hex) {
  const values = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = values.map((value) => (value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)));
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#111111" : "#FFFFFF";
}

function compareTransitLines(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
