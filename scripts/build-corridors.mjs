import { mkdir, readFile, writeFile } from "node:fs/promises";

const GENEVA_BOUNDS = { minLat: 46.15, maxLat: 46.26, minLon: 6.04, maxLon: 6.24 };
const CLIP_PADDING_DEGREES = 0.004;
const CORRIDOR_CLIP_RADIUS_METERS = 350;
const SIMPLIFY_TOLERANCE_METERS = 18;
const ROUTE_GROUPS = {
  "12": "school_12_17",
  "14": "home_14_18",
  "17": "school_12_17",
  "18": "home_14_18"
};
const CURATED_STOPS = {
  "14": [
    "Genève, Jonction",
    "Genève, Palladium",
    "Genève, Stand",
    "Genève, Bel-Air",
    "Genève, Coutance",
    "Genève, gare Cornavin",
    "Genève, Lyon",
    "Genève, Poterie",
    "Genève, Servette",
    "Genève, Vieusseux",
    "Vernier, Bouchet",
    "Vernier, Balexert",
    "Vernier, Avanchets-Etang",
    "Vernier, Blandonnet"
  ],
  "18": [
    "Genève, Bel-Air",
    "Genève, Coutance",
    "Genève, gare Cornavin",
    "Genève, Lyon",
    "Genève, Poterie",
    "Genève, Servette",
    "Genève, Vieusseux",
    "Vernier, Bouchet",
    "Vernier, Balexert",
    "Vernier, Avanchets-Etang",
    "Vernier, Blandonnet"
  ],
  "12": [
    "Genève, Plainpalais",
    "Genève, Place de Neuve",
    "Genève, Bel-Air",
    "Genève, Molard",
    "Genève, Rive",
    "Genève, Terrassière",
    "Genève, Villereuse",
    "Genève-Eaux-Vives, gare",
    "Genève, Amandolier",
    "Chêne-Bougeries, Grange-Canal",
    "Chêne-Bougeries, Grangettes",
    "Chêne-Bougeries,Grange-Falquet",
    "Chêne-Bourg, Place Favre",
    "Chêne-Bourg, Peillonnex",
    "Thônex, Graveson",
    "Thônex, Moillesulaz"
  ],
  "17": [
    "Genève, Plainpalais",
    "Genève, Place de Neuve",
    "Genève, Bel-Air",
    "Genève, Molard",
    "Genève, Rive",
    "Genève, Terrassière",
    "Genève, Villereuse",
    "Genève-Eaux-Vives, gare",
    "Genève, Amandolier",
    "Chêne-Bougeries, Grange-Canal",
    "Chêne-Bougeries, Grangettes",
    "Chêne-Bougeries,Grange-Falquet",
    "Chêne-Bourg, Place Favre",
    "Chêne-Bourg, Peillonnex",
    "Thônex, Graveson",
    "Thônex, Moillesulaz"
  ]
};

const stopsData = JSON.parse(await readFile("stops.json", "utf8")).stops;
const lineData = JSON.parse(await readFile("sitg-tpg-lignes.geojson", "utf8"));
const stopByName = new Map(stopsData.map((stop) => [stop.name, stop]));
const tramFeatures = lineData.features.filter((feature) => feature.properties?.VEHICULE === "TRAM");
const tramLines = unique(tramFeatures.map((feature) => String(feature.properties?.LIGNE ?? ""))).filter(Boolean).sort(compareTransitLines);

const corridors = tramLines.map((line) => {
  const features = tramFeatures.filter((feature) => String(feature.properties?.LIGNE) === line);
  const rawPaths = features.flatMap((feature) => geometryPaths(feature.geometry));
  const points = CURATED_STOPS[line] ? curatedStopsForLine(line) : generatedStopsForLine(line, rawPaths);
  const clip = boundsFor(points, CLIP_PADDING_DEGREES);
  const paths = rawPaths
    .flatMap((path) => clippedPaths(path, clip, points))
    .map((path) => simplifyPath(path, SIMPLIFY_TOLERANCE_METERS))
    .filter((path) => path.length >= 2);

  return {
    id: "line_" + line,
    label: "Line " + line,
    line,
    routeGroup: ROUTE_GROUPS[line] ?? "line_" + line,
    points,
    paths
  };
});

const cdnPayload = {
  v: 1,
  generatedAt: new Date().toISOString(),
  genevaBounds: GENEVA_BOUNDS,
  corridors
};

await mkdir("cdn", { recursive: true });
await writeFile("cdn/corridors-v1.json", JSON.stringify(cdnPayload));
await writeFile(
  "shared/corridors.ts",
  `export const GENEVA_BOUNDS = ${JSON.stringify(GENEVA_BOUNDS)};\n\nexport const DEFAULT_CORRIDORS = ${JSON.stringify(corridors, null, 2)};\n\nexport let CORRIDORS = DEFAULT_CORRIDORS;\n\nexport function setCorridors(corridors) {\n  if (Array.isArray(corridors) && corridors.length) {\n    CORRIDORS = corridors;\n  }\n}\n`
);

console.log(`Wrote ${corridors.length} tram corridors: ${tramLines.join(", ")}`);

function curatedStopsForLine(line) {
  return CURATED_STOPS[line].map((name) => {
    const stop = stopByName.get(name);
    if (!stop) {
      throw new Error(`Missing stop: ${name}`);
    }
    const platform = stop.platforms.find((candidate) => candidate.id === stop.id) ?? stop.platforms[0];
    return {
      name,
      lat: round6(platform.location.lat),
      lon: round6(platform.location.lon)
    };
  });
}

function generatedStopsForLine(line, rawPaths) {
  const routePoints = rawPaths.flatMap((path) => path.map((coordinate) => ({ lat: coordinate[1], lon: coordinate[0] })));
  const byName = new Map();
  for (const stop of stopsData) {
    const platform = stop.platforms?.find((candidate) => candidate.services?.some((service) => sameTramLine(service, line)));
    if (!platform?.location || byName.has(stop.name)) {
      continue;
    }
    byName.set(stop.name, {
      name: stop.name,
      lat: round6(platform.location.lat),
      lon: round6(platform.location.lon)
    });
  }
  return Array.from(byName.values())
    .map((stop) => ({ ...stop, order: nearestRouteIndex(stop, routePoints) }))
    .sort((a, b) => a.order - b.order)
    .map(({ order, ...stop }) => stop);
}

function sameTramLine(service, line) {
  return String(service?.line ?? "") === line && String(service?.mode ?? "").toLowerCase() === "tram";
}

function geometryPaths(geometry) {
  if (geometry?.type === "LineString") {
    return [geometry.coordinates];
  }
  if (geometry?.type === "MultiLineString") {
    return geometry.coordinates;
  }
  return [];
}

function clippedPaths(rawPath, bounds, corridorPoints) {
  const result = [];
  let segment = [];
  for (const coordinate of rawPath) {
    const point = { lat: round6(coordinate[1]), lon: round6(coordinate[0]) };
    if (isInside(point, bounds) && distanceToCorridorMeters(point, corridorPoints) <= CORRIDOR_CLIP_RADIUS_METERS) {
      segment.push([point.lat, point.lon]);
    } else if (segment.length) {
      if (segment.length >= 2) {
        result.push(segment);
      }
      segment = [];
    }
  }
  if (segment.length >= 2) {
    result.push(segment);
  }
  return result;
}

function boundsFor(points, padding) {
  return {
    minLat: Math.min(...points.map((point) => point.lat)) - padding,
    maxLat: Math.max(...points.map((point) => point.lat)) + padding,
    minLon: Math.min(...points.map((point) => point.lon)) - padding,
    maxLon: Math.max(...points.map((point) => point.lon)) + padding
  };
}

function isInside(point, bounds) {
  return point.lat >= bounds.minLat && point.lat <= bounds.maxLat && point.lon >= bounds.minLon && point.lon <= bounds.maxLon;
}

function nearestRouteIndex(stop, routePoints) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  routePoints.forEach((point, index) => {
    const distance = haversineMeters(stop, point);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function distanceToCorridorMeters(point, corridorPoints) {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < corridorPoints.length - 1; index += 1) {
    best = Math.min(best, distanceToSegmentMeters(point, corridorPoints[index], corridorPoints[index + 1]));
  }
  return best;
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

function haversineMeters(a, b) {
  const earthRadiusMeters = 6371000;
  const dLat = degreesToRadians(b.lat - a.lat);
  const dLon = degreesToRadians(b.lon - a.lon);
  const lat1 = degreesToRadians(a.lat);
  const lat2 = degreesToRadians(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function round6(value) {
  return Math.round(value * 1000000) / 1000000;
}

function unique(values) {
  return Array.from(new Set(values));
}

function compareTransitLines(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
