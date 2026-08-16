import { setTransitData } from "../shared/corridors";
import { setDirectionOptions } from "../shared/tram";
import localGeometry from "../storage-data/tpg-routes.polyline.json";
import localMetadata from "../storage-data/tpg-lines.info.json";
import { debugSync, errorMessage, readMeta, writeMeta } from "./local-store";
import { TRANSIT_DATA_VERSION } from "./transit-data.generated";
import type { LineInfo } from "./types";

const CACHE_KEY = "transit-data-cache-v1";

type CompactStop = { n: string; a: number; o: number };
type CompactDirection = { i: string; h: string; f: string; s: number[] };
type CompactLine = { l: string; c: string; f: string; t: string; d: CompactDirection[] };
type CompactMetadata = { v: number; generatedAt: string; stops: CompactStop[]; lines: CompactLine[] };
type CompactGeometry = { v: number; precision: number; features: Array<{ i: string; l: string; p: string[] }> };
type RawStop = { name: string; lat: number; lon: number };
type RawDirection = { id: string; headsign?: string; to?: string; stops?: RawStop[] };
type RawLine = { number: string; vehicle?: string; colour?: string; color?: string; directions?: RawDirection[] };
type RawMetadata = { generatedAt?: string; lines: RawLine[] };
type RawFeature = { properties?: { id?: string; line?: string }; geometry?: { type?: string; coordinates?: any[] } };
type RawGeometry = { type?: string; generatedAt?: string; features: RawFeature[] };
type MetadataPayload = CompactMetadata | RawMetadata;
type GeometryPayload = CompactGeometry | RawGeometry;
type CachedPayload = { version: string; metadata: MetadataPayload; geometry: GeometryPayload };
type RuntimeData = {
  stops: Array<{ name: string; lat: number; lon: number }>;
  corridors: Array<{ id: string; label: string; line: string; routeGroup: string; points: Array<{ name: string; lat: number; lon: number }>; paths: Array<Array<[number, number]>> }>;
  directions: Record<string, string[]>;
  catalog: Record<string, LineInfo>;
};

export async function loadTransitData(): Promise<Record<string, LineInfo> | null> {
  if (typeof location !== "undefined" && (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "[::1]" || location.hostname.endsWith(".localhost"))) {
    return applyPayload(localMetadata as MetadataPayload, localGeometry as GeometryPayload);
  }

  const cached = await readCached();
  const cachedCatalog = cached ? applyPayload(cached.metadata, cached.geometry) : null;
  if (cached?.version === TRANSIT_DATA_VERSION || (typeof navigator !== "undefined" && !navigator.onLine)) return cachedCatalog;

  try {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot decompress transit data.");
    const response = await fetch(`/api/transit-data?v=${encodeURIComponent(TRANSIT_DATA_VERSION)}`, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Transit data HTTP ${response.status}`);
    const binary = atob((await response.text()).trim());
    const compressed = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    const payload = JSON.parse(await new Response(stream).text()) as CachedPayload;
    if (payload.version !== TRANSIT_DATA_VERSION) throw new Error("Transit data version mismatch.");
    const catalog = applyPayload(payload.metadata, payload.geometry);
    await writeMeta(CACHE_KEY, JSON.stringify(payload));
    return catalog;
  } catch (err) {
    debugSync("transit-data-refresh-error", { error: errorMessage(err) });
    return cachedCatalog;
  }
}

async function readCached(): Promise<CachedPayload | null> {
  try {
    const raw = await readMeta(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedPayload;
    validateTransitPayloads(cached.metadata, cached.geometry);
    return cached;
  } catch (err) {
    debugSync("transit-data-cache-error", { error: errorMessage(err) });
    return null;
  }
}

export function validateTransitPayloads(metadata: MetadataPayload, geometry: GeometryPayload) {
  if (!Array.isArray(metadata?.lines)) throw new Error("Invalid metadata file.");
  if (!Array.isArray(geometry?.features)) throw new Error("Invalid geometry file.");
  if (
    isCompactGeometry(geometry) &&
    (!Number.isInteger(geometry.precision) || geometry.features.some((feature) =>
      !feature.i || !feature.l || !Array.isArray(feature.p) || !feature.p.length || feature.p.some((path) => typeof path !== "string" || !path)
    ))
  ) {
    throw new Error("Invalid polyline geometry file.");
  }
  const directionIds = new Set(isCompactMetadata(metadata)
    ? metadata.lines.flatMap((line) => line.d.map((direction) => direction.i))
    : metadata.lines.flatMap((line) => (line.directions ?? []).map((direction) => direction.id)));
  const geometryIds = isCompactGeometry(geometry)
    ? geometry.features.map((feature) => feature.i)
    : geometry.features.map((feature) => String(feature.properties?.id ?? ""));
  if (!directionIds.size || geometryIds.length !== directionIds.size || geometryIds.some((id) => !directionIds.has(id))) {
    throw new Error("Geometry does not match metadata.");
  }
}

function applyPayload(metadata: MetadataPayload, geometry: GeometryPayload): Record<string, LineInfo> {
  validateTransitPayloads(metadata, geometry);
  const runtime = isCompactMetadata(metadata)
    ? runtimeFromCompact(metadata, geometry)
    : runtimeFromRaw(metadata as RawMetadata, geometry);
  setTransitData(runtime.corridors, runtime.stops);
  setDirectionOptions(runtime.directions);
  return runtime.catalog;
}

function runtimeFromCompact(metadata: CompactMetadata, geometry: GeometryPayload): RuntimeData {
  const allStops = metadata.stops.map((stop) => ({ name: stop.n, lat: stop.a, lon: stop.o }));
  const pathsByLine = geometryPathsByLine(geometry);

  const directions: Record<string, string[]> = {};
  const catalog: Record<string, LineInfo> = {};
  const corridors = metadata.lines.map((line) => {
    directions[line.l] = unique(line.d.map((direction) => direction.h));
    catalog[line.l] = { line: line.l, color: line.c, foreground: line.f, type: line.t, link: "", directions: directions[line.l] };
    const stopIndexes = unique(line.d.flatMap((direction) => direction.s));
    return {
      id: "line_" + line.l,
      label: "Line " + line.l,
      line: line.l,
      routeGroup: "line_" + line.l,
      points: stopIndexes.map((index) => allStops[index]).filter(Boolean),
      paths: pathsByLine.get(line.l) ?? []
    };
  });
  return { stops: allStops, corridors, directions, catalog };
}

function runtimeFromRaw(metadata: RawMetadata, geometry: GeometryPayload): RuntimeData {
  const pathsByLine = geometryPathsByLine(geometry);
  const stopByKey = new Map<string, { name: string; lat: number; lon: number }>();
  const directions: Record<string, string[]> = {};
  const catalog: Record<string, LineInfo> = {};
  const corridors = metadata.lines.flatMap((sourceLine) => {
    const line = canonicalLine(sourceLine.number);
    if (!line) return [];
    const sourceDirections = sourceLine.directions ?? [];
    directions[line] = unique(sourceDirections.map((direction) => String(direction.headsign ?? direction.to ?? "").trim()).filter(Boolean));
    const points = sourceDirections.flatMap((direction) => direction.stops ?? []).flatMap((stop) => {
      const lat = Number(stop.lat);
      const lon = Number(stop.lon);
      const name = String(stop.name ?? "").trim();
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
      const key = `${name}|${lat}|${lon}`;
      if (!stopByKey.has(key)) stopByKey.set(key, { name, lat, lon });
      return [stopByKey.get(key)!];
    });
    const color = normalizeColor(sourceLine.colour ?? sourceLine.color);
    catalog[line] = {
      line,
      color,
      foreground: foregroundFor(color),
      type: String(sourceLine.vehicle ?? ""),
      link: "",
      directions: directions[line]
    };
    return [{
      id: "line_" + line,
      label: "Line " + line,
      line,
      routeGroup: "line_" + line,
      points: uniqueByReference(points),
      paths: pathsByLine.get(line) ?? []
    }];
  });
  return { stops: Array.from(stopByKey.values()), corridors, directions, catalog };
}

function geometryPathsByLine(geometry: GeometryPayload): Map<string, Array<Array<[number, number]>>> {
  const pathsByLine = new Map<string, Array<Array<[number, number]>>>();
  if (isCompactGeometry(geometry)) {
    for (const feature of geometry.features) {
      const line = canonicalLine(feature.l);
      const paths = pathsByLine.get(line) ?? [];
      for (const encoded of feature.p) paths.push(decodePolyline(encoded, geometry.precision));
      pathsByLine.set(line, paths);
    }
    return pathsByLine;
  }

  for (const feature of geometry.features) {
    const line = canonicalLine(feature.properties?.line);
    if (!line) continue;
    const paths = pathsByLine.get(line) ?? [];
    for (const path of rawGeometryPaths(feature.geometry)) {
      paths.push(path.map((coordinate) => [Number(coordinate[1]), Number(coordinate[0])]));
    }
    pathsByLine.set(line, paths);
  }
  return pathsByLine;
}

export function decodePolyline(encoded: string, precision = 5): Array<[number, number]> {
  const factor = Math.pow(10, precision);
  const points: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    const latValue = decodeValue(encoded, index);
    index = latValue.index;
    const lonValue = decodeValue(encoded, index);
    index = lonValue.index;
    lat += latValue.value;
    lon += lonValue.value;
    points.push([lat / factor, lon / factor]);
  }
  return points;
}

function decodeValue(encoded: string, start: number) {
  let result = 0;
  let shift = 0;
  let index = start;
  let byte = 0;
  do {
    byte = encoded.charCodeAt(index++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20 && index < encoded.length);
  return { value: result & 1 ? ~(result >> 1) : result >> 1, index };
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function uniqueByReference<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function isCompactMetadata(metadata: MetadataPayload): metadata is CompactMetadata {
  return metadata?.v === 1 && Array.isArray((metadata as CompactMetadata).stops);
}

function isCompactGeometry(geometry: GeometryPayload): geometry is CompactGeometry {
  return geometry?.v === 1;
}

function rawGeometryPaths(geometry: RawFeature["geometry"]): any[][] {
  if (geometry?.type === "LineString") return [geometry.coordinates ?? []];
  if (geometry?.type === "MultiLineString") return geometry.coordinates ?? [];
  return [];
}

function canonicalLine(value: unknown): string {
  const line = String(value ?? "").trim().toUpperCase();
  return /^\d+$/.test(line) ? String(Number(line)) : line;
}

function normalizeColor(value: unknown): string {
  const color = String(value ?? "").trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : "#666666";
}

function foregroundFor(hex: string): string {
  const values = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = values.map((value) => value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.45 ? "#111111" : "#FFFFFF";
}
