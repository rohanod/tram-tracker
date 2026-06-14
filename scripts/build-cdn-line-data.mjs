import { mkdir, readFile, writeFile } from "node:fs/promises";

const LINE_SOURCE = "sitg-tpg-lignes.geojson";
const STOP_SOURCE = "stops.json";
const OUTPUT_PATH = "cdn/tpg-line-data-v1.json";
const SIMPLIFY_TOLERANCE_METERS = 70;
const ROUTE_MODES = new Set(["BUS", "TRAM"]);

const [lineData, stopData] = await Promise.all([
  readJson(LINE_SOURCE),
  readJson(STOP_SOURCE)
]);

const routes = lineData.features
  .filter((feature) => ROUTE_MODES.has(String(feature.properties?.VEHICULE ?? "").toUpperCase()))
  .map((feature) => routeFromFeature(feature))
  .filter((route) => route.p.length > 0)
  .sort((a, b) => compareNatural(a.l, b.l) || a.d.localeCompare(b.d));

const stops = stopData.stops
  .map((stop) => stopFromSource(stop))
  .filter(Boolean)
  .sort((a, b) => a.n.localeCompare(b.n));

const output = {
  v: 1,
  g: new Date().toISOString(),
  src: [LINE_SOURCE, STOP_SOURCE],
  tol: SIMPLIFY_TOLERANCE_METERS,
  r: routes,
  s: stops
};

await mkdir("cdn", { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(output));
console.log(`Wrote ${OUTPUT_PATH}`);
console.log(`${routes.length} route geometries, ${stops.length} stops`);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function routeFromFeature(feature) {
  const properties = feature.properties ?? {};
  return {
    i: String(feature.id ?? properties.OBJECTID ?? ""),
    l: String(properties.LIGNE ?? ""),
    d: String(properties.DIRECTION ?? ""),
    m: String(properties.VEHICULE ?? "").toLowerCase(),
    p: geometryPaths(feature.geometry)
      .map((path) => simplifyPath(path.map(([lon, lat]) => [round5(lat), round5(lon)]), SIMPLIFY_TOLERANCE_METERS))
      .filter((path) => path.length >= 2)
  };
}

function geometryPaths(geometry) {
  if (!geometry) {
    return [];
  }

  if (geometry.type === "LineString") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates;
  }

  return [];
}

function stopFromSource(stop) {
  const platform = stop.platforms?.find((candidate) => candidate.id === stop.id) ?? stop.platforms?.[0];
  const location = platform?.location;
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lon)) {
    return null;
  }

  return {
    i: String(stop.id ?? ""),
    n: String(stop.name ?? ""),
    a: round5(location.lat),
    o: round5(location.lon),
    v: uniqueServices(stop.platforms ?? [])
  };
}

function uniqueServices(platforms) {
  const byKey = new Map();

  for (const platform of platforms) {
    for (const service of platform.services ?? []) {
      const line = String(service.line ?? "");
      const mode = String(service.mode ?? "");
      const directionId = String(service.directionId ?? "");
      const headsign = String(service.headsign ?? "");
      const key = [line, mode, directionId, headsign].join("|");
      if (!line || byKey.has(key)) {
        continue;
      }

      byKey.set(key, [line, mode, directionId, headsign]);
    }
  }

  return Array.from(byKey.values()).sort((a, b) => compareNatural(a[0], b[0]) || a[3].localeCompare(b[3]));
}

function simplifyPath(points, toleranceMeters) {
  if (points.length <= 2) {
    return points;
  }

  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  simplifyRange(points, 0, points.length - 1, toleranceMeters, keep);
  return points.filter((_, index) => keep[index]);
}

function simplifyRange(points, startIndex, endIndex, toleranceMeters, keep) {
  let maxDistance = 0;
  let maxIndex = startIndex;
  const start = asPoint(points[startIndex]);
  const end = asPoint(points[endIndex]);

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const distance = distanceToSegmentMeters(asPoint(points[index]), start, end);
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

function asPoint(point) {
  return { lat: point[0], lon: point[1] };
}

function distanceToSegmentMeters(point, start, end) {
  const originLat = degreesToRadians(point.lat);
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = 111320 * Math.cos(originLat);

  const pointX = point.lon * metersPerDegreeLon;
  const pointY = point.lat * metersPerDegreeLat;
  const startX = start.lon * metersPerDegreeLon;
  const startY = start.lat * metersPerDegreeLat;
  const endX = end.lon * metersPerDegreeLon;
  const endY = end.lat * metersPerDegreeLat;
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(pointX - startX, pointY - startY);
  }

  const t = Math.max(0, Math.min(1, ((pointX - startX) * dx + (pointY - startY) * dy) / lengthSquared));
  return Math.hypot(pointX - (startX + t * dx), pointY - (startY + t * dy));
}

function compareNatural(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function round5(value) {
  return Math.round(Number(value) * 100000) / 100000;
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}
