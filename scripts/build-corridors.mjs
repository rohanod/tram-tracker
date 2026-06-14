import { readFile, writeFile } from "node:fs/promises";

const GENEVA_BOUNDS = { minLat: 46.15, maxLat: 46.26, minLon: 6.04, maxLon: 6.24 };
const CLIP_PADDING_DEGREES = 0.004;
const TERMINAL_PADDING_DEGREES = 0.0002;
const CORRIDOR_CLIP_RADIUS_METERS = 350;
const SIMPLIFY_TOLERANCE_METERS = 18;

const STOP_POINTS = {
  line_14: {
    label: "Line 14",
    line: "14",
    routeGroup: "home_14_18",
    names: [
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
    ]
  },
  line_18: {
    label: "Line 18",
    line: "18",
    routeGroup: "home_14_18",
    names: [
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
    ]
  },
  line_12: {
    label: "Line 12",
    line: "12",
    routeGroup: "school_12_17",
    names: [
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
  },
  line_17: {
    label: "Line 17",
    line: "17",
    routeGroup: "school_12_17",
    names: [
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
  }
};

const stopsData = JSON.parse(await readFile("stops.json", "utf8")).stops;
const lineData = JSON.parse(await readFile("sitg-tpg-lignes.geojson", "utf8"));
const stopByName = new Map(stopsData.map((stop) => [stop.name, stop]));

const corridors = Object.entries(STOP_POINTS).map(([id, config]) => {
  const points = config.names.map((name) => {
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

  const clip = boundsFor(points, CLIP_PADDING_DEGREES);
  const terminalClip = boundsFor(points, TERMINAL_PADDING_DEGREES);
  const paths = lineData.features
    .filter((feature) => feature.properties?.LIGNE === config.line && feature.properties?.VEHICULE === "TRAM")
    .flatMap((feature) => clippedPaths(feature.geometry, clip, terminalClip, points))
    .map((path) => simplifyPath(path, SIMPLIFY_TOLERANCE_METERS))
    .filter((path) => path.length >= 2);

  return {
    id,
    label: config.label,
    line: config.line,
    routeGroup: config.routeGroup,
    points,
    paths
  };
});

const output = `export const GENEVA_BOUNDS = ${JSON.stringify(GENEVA_BOUNDS)};\n\nexport const CORRIDORS = ${JSON.stringify(corridors, null, 2)};\n`;
await writeFile("shared/corridors.ts", output);

function clippedPaths(geometry, bounds, terminalClip, corridorPoints) {
  const rawPaths =
    geometry.type === "LineString"
      ? [geometry.coordinates]
      : geometry.type === "MultiLineString"
        ? geometry.coordinates
        : [];

  const result = [];
  for (const rawPath of rawPaths) {
    let segment = [];
    for (const coordinate of rawPath) {
      const point = { lat: round6(coordinate[1]), lon: round6(coordinate[0]) };
      if (
        isInside(point, bounds) &&
        point.lon >= terminalClip.minLon &&
        point.lon <= terminalClip.maxLon &&
        distanceToCorridorMeters(point, corridorPoints) <= CORRIDOR_CLIP_RADIUS_METERS
      ) {
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

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function round6(value) {
  return Math.round(value * 1000000) / 1000000;
}
