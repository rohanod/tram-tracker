import { setTransitData } from "../shared/corridors";
import { setDirectionOptions } from "../shared/tram";
import localGeometry from "../storage-data/transit-geometry.json";
import localMetadata from "../storage-data/transit-metadata.json";
import { debugSync, errorMessage, readMeta, writeMeta } from "./local-store";
import type { LineInfo, TransitDataConfig } from "./types";

const CACHE_KEY = "transit-data-cache-v1";

type CompactStop = { n: string; a: number; o: number };
type CompactDirection = { i: string; h: string; f: string; s: number[] };
type CompactLine = { l: string; c: string; f: string; t: string; d: CompactDirection[] };
type MetadataPayload = { v: number; generatedAt: string; stops: CompactStop[]; lines: CompactLine[] };
type GeometryPayload = { v: number; precision: number; features: Array<{ i: string; l: string; p: string[] }> };
type CachedPayload = { version: string; metadata: MetadataPayload; geometry: GeometryPayload };

export async function loadTransitData(config: TransitDataConfig | null | undefined): Promise<Record<string, LineInfo> | null> {
  if (typeof location !== "undefined" && (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "[::1]" || location.hostname.endsWith(".localhost"))) {
    const metadata = localMetadata as MetadataPayload;
    const geometry = localGeometry as GeometryPayload;
    validatePayload(metadata, geometry);
    applyPayload(metadata, geometry);
    return catalogFrom(metadata);
  }

  const cached = await readCached();
  if (cached) applyPayload(cached.metadata, cached.geometry);
  if (!config?.version || !config.metadataUrl || !config.geometryUrl || (cached?.version === config.version) || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return cached ? catalogFrom(cached.metadata) : null;
  }

  try {
    const [metadataResponse, geometryResponse] = await Promise.all([
      fetch(config.metadataUrl, { cache: "force-cache" }),
      fetch(config.geometryUrl, { cache: "force-cache" })
    ]);
    if (!metadataResponse.ok || !geometryResponse.ok) {
      throw new Error(`Transit data HTTP ${metadataResponse.status}/${geometryResponse.status}`);
    }
    const metadata = await metadataResponse.json() as MetadataPayload;
    const geometry = await geometryResponse.json() as GeometryPayload;
    validatePayload(metadata, geometry);
    applyPayload(metadata, geometry);
    await writeMeta(CACHE_KEY, JSON.stringify({ version: config.version, metadata, geometry }));
    return catalogFrom(metadata);
  } catch (err) {
    debugSync("transit-data-refresh-error", { error: errorMessage(err) });
    return cached ? catalogFrom(cached.metadata) : null;
  }
}

async function readCached(): Promise<CachedPayload | null> {
  try {
    const raw = await readMeta(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedPayload;
    validatePayload(cached.metadata, cached.geometry);
    return cached;
  } catch (err) {
    debugSync("transit-data-cache-error", { error: errorMessage(err) });
    return null;
  }
}

function validatePayload(metadata: MetadataPayload, geometry: GeometryPayload) {
  if (metadata?.v !== 1 || geometry?.v !== 1 || !Array.isArray(metadata.lines) || !Array.isArray(metadata.stops) || !Array.isArray(geometry.features)) {
    throw new Error("Invalid transit data");
  }
}

function applyPayload(metadata: MetadataPayload, geometry: GeometryPayload) {
  const allStops = metadata.stops.map((stop) => ({ name: stop.n, lat: stop.a, lon: stop.o }));
  const pathsByLine = new Map<string, Array<Array<[number, number]>>>();
  for (const feature of geometry.features) {
    const paths = pathsByLine.get(feature.l) ?? [];
    for (const encoded of feature.p) paths.push(decodePolyline(encoded, geometry.precision || 5));
    pathsByLine.set(feature.l, paths);
  }

  const directions: Record<string, string[]> = {};
  const corridors = metadata.lines.map((line) => {
    directions[line.l] = unique(line.d.map((direction) => direction.h));
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
  setTransitData(corridors, allStops);
  setDirectionOptions(directions);
}

function catalogFrom(metadata: MetadataPayload): Record<string, LineInfo> {
  return Object.fromEntries(metadata.lines.map((line) => [line.l, {
    line: line.l,
    color: line.c,
    foreground: line.f,
    type: line.t,
    link: "",
    directions: unique(line.d.map((direction) => direction.h))
  }]));
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
