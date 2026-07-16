import { CORRIDORS, GENEVA_BOUNDS, TRANSIT_STOPS } from "./corridors";

export const MATCH_RADIUS_METERS = 250;
export const STOP_MATCH_RADIUS_METERS = 10;
export const LEG_VALUES = ["unclassified", "from_home", "to_school", "from_school", "to_home"];
export const MAIN_LINE_VALUES = ["12", "14", "17", "18"];
export const LINE_VALUES = ["unclassified", ...MAIN_LINE_VALUES];
export const OBSERVATION_VALUES = ["been_on", "seen"];
export let DIRECTION_OPTIONS_BY_LINE = {
  "12": ["Lancy-Bachet, Gare", "Thônex, Moillesulaz"],
  "14": ["Bernex, Vailly", "Meyrin, Gravière"],
  "17": ["Lancy-Pont-Rouge, Gare", "Annemasse, Parc Montessuit"],
  "18": ["Grand-Lancy, Palettes", "Meyrin, CERN"]
};

export function setDirectionOptions(options) {
  DIRECTION_OPTIONS_BY_LINE = { ...DIRECTION_OPTIONS_BY_LINE, ...(options ?? {}) };
}

export const LEG_LABELS = {
  unclassified: "No leg",
  from_home: "From home",
  to_school: "To school",
  from_school: "From school",
  to_home: "To home"
};

export const LINE_LABELS = {
  unclassified: "Manual",
  "12": "Line 12",
  "14": "Line 14",
  "17": "Line 17",
  "18": "Line 18"
};

export const OBSERVATION_LABELS = {
  been_on: "Been on",
  seen: "Seen"
};

export function cleanVehicleNumber(value) {
  return String(value ?? "").trim();
}

export function isValidVehicleNumber(value) {
  return /^\d{3,4}$/.test(cleanVehicleNumber(value));
}

export function normalizeVehicleNumber(value) {
  const clean = cleanVehicleNumber(value);
  return isValidVehicleNumber(clean) ? clean : "";
}

export function isKnownLeg(value) {
  return LEG_VALUES.includes(value);
}

export function normalizeLeg(value) {
  return isKnownLeg(value) ? value : "unclassified";
}

export function isKnownLine(value) {
  return normalizeLine(value) !== "unclassified";
}

export function normalizeLine(value) {
  const rawLine = String(value ?? "").trim();
  if (rawLine === "unclassified") {
    return rawLine;
  }

  const line = rawLine.toUpperCase();
  if (/^\d+$/.test(line)) {
    return String(Number(line));
  }

  return /^[A-Za-z0-9+]{1,8}$/.test(line) ? line : "unclassified";
}

export function isKnownObservationType(value) {
  return OBSERVATION_VALUES.includes(value);
}

export function normalizeObservationType(value) {
  return isKnownObservationType(value) ? value : "been_on";
}

export function vehicleHistoryMessage(entry) {
  if (!entry) {
    return "";
  }

  const line = normalizeLine(entry.savedLine ?? entry.line);
  const direction = normalizeDirection(entry.savedDirection ?? entry.direction ?? entry.savedLeg ?? entry.leg, line);
  const prefix = normalizeObservationType(entry.observationType) === "been_on" ? "Been on before" : "Seen before";
  const capturedAt = formatCapturedAtForMessage(entry.capturedAt);
  const trip = lineLabelForMessage(line) + ", " + directionLabelForLine(line, direction);
  return prefix + ": " + (capturedAt ? capturedAt + ", " : "") + trip + ".";
}

export function legLabelForLine(line, leg) {
  return directionLabelForLine(line, leg);
}

export function directionLabelForLine(line, direction) {
  const normalizedDirection = normalizeDirection(direction, line);
  if (normalizedDirection === "unclassified") {
    return "No direction";
  }

  return "To " + normalizedDirection;
}

export function normalizeDirection(value, line, fallback = "unclassified") {
  const raw = String(value ?? "").trim();
  const lower = raw.toLowerCase();
  if (!raw || lower === "auto" || lower === "detect" || lower === "detected") {
    return normalizeDirection(fallback, line);
  }
  if (lower === "none" || lower === "no direction" || lower === "unclassified") {
    return "unclassified";
  }
  if (isKnownLeg(lower)) {
    return headsignForLineAndLeg(line, lower) || normalizeLeg(lower);
  }

  const withoutPrefix = raw.replace(/^to\s+/i, "").replace(/\s+/g, " ").slice(0, 80).trim();
  const configured = directionOptionsForLine(line).find((direction) => direction.toLowerCase() === withoutPrefix.toLowerCase());
  return configured || withoutPrefix || "unclassified";
}

export function directionOptionsForLine(line) {
  const normalizedLine = normalizeLine(line);
  const configured = DIRECTION_OPTIONS_BY_LINE[normalizedLine] ?? [];
  if (configured.length) {
    return ["unclassified", ...configured];
  }

  const corridor = CORRIDORS.find((candidate) => candidate.line === normalizedLine);
  const fallback = corridor?.points?.length
    ? [stopHeadsign(corridor.points[0]?.name), stopHeadsign(corridor.points[corridor.points.length - 1]?.name)].filter(Boolean)
    : [];
  return ["unclassified", ...uniqueValues(fallback)];
}

export function headsignForLineAndLeg(line, leg) {
  const normalizedLine = normalizeLine(line);
  if (normalizedLine === "unclassified") {
    return "";
  }

  const options = directionOptionsForLine(normalizedLine).filter((direction) => direction !== "unclassified");
  const first = options[0] ?? "";
  const last = options[options.length - 1] ?? "";
  if (leg === "from_home" || leg === "from_school") {
    return first;
  }
  if (leg === "to_home" || leg === "to_school") {
    return last;
  }
  return "";
}

export function legValuesForCapturedAt(capturedAt) {
  return isBeforeGenevaNoon(capturedAt)
    ? ["unclassified", "from_home", "to_school"]
    : ["unclassified", "from_school", "to_home"];
}

export function roundCoordinate(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }

  return (Math.round(value * 10000) / 10000).toFixed(4);
}

export function normalizeLocation(location) {
  if (!location || typeof location.lat !== "number" || typeof location.lon !== "number") {
    return null;
  }

  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon)) {
    return null;
  }

  return {
    lat: Number(roundCoordinate(location.lat)),
    lon: Number(roundCoordinate(location.lon))
  };
}

export function classifyCapture(location, _capturedAt, includeNearestStop = true) {
  if (!location) {
    return baseClassification("no_location");
  }

  const normalizedLocation = normalizeLocation(location);
  if (!normalizedLocation) {
    return baseClassification("no_location");
  }

  if (!isInGenevaBounds(normalizedLocation)) {
    return baseClassification("outside_geneva");
  }

  const nearestTransitStop = includeNearestStop ? nearestStopFromList(normalizedLocation, TRANSIT_STOPS) : null;
  const nearestStopName = nearestTransitStop && nearestTransitStop.distance <= STOP_MATCH_RADIUS_METERS ? nearestTransitStop.name : "";
  const corridorDistances = CORRIDORS.map((corridor) => {
    const routeDistanceMeters = distanceToCorridorMeters(normalizedLocation, corridor);
    return {
      corridor,
      routeDistanceMeters,
      distanceMeters: routeDistanceMeters
    };
  }).sort((a, b) => a.distanceMeters - b.distanceMeters);

  const matches = corridorDistances.filter((match) => match.distanceMeters <= MATCH_RADIUS_METERS);
  const nearest = corridorDistances[0];

  if (!nearest) {
    return {
      ...baseClassification("outside_route"),
      nearestStopName
    };
  }

  if (matches.length === 0) {
    return {
      ...baseClassification("outside_route"),
      routeGroup: "none",
      distanceMeters: roundedMeters(nearest.distanceMeters),
      nearestStopName
    };
  }

  const matchingLines = uniqueValues(matches.map((match) => match.corridor.line).filter(Boolean));
  const suggestedLine = matchingLines.length === 1 ? matchingLines[0] : "unclassified";
  return {
    status: matchingLines.length === 1 ? "matched" : "ambiguous",
    suggestedLeg: "unclassified",
    suggestedLine,
    routeGroup: matchingLines.length === 1 ? "line_" + suggestedLine : "multiple",
    distanceMeters: roundedMeters(matches[0].distanceMeters),
    nearestStopName,
    matchingLines
  };
}

export function isInGenevaBounds(point) {
  return (
    point.lat >= GENEVA_BOUNDS.minLat &&
    point.lat <= GENEVA_BOUNDS.maxLat &&
    point.lon >= GENEVA_BOUNDS.minLon &&
    point.lon <= GENEVA_BOUNDS.maxLon
  );
}

function baseClassification(status) {
  return {
    status,
    suggestedLeg: "unclassified",
    suggestedLine: "unclassified",
    routeGroup: "none",
    distanceMeters: "",
    nearestStopName: "",
    matchingLines: []
  };
}

function uniqueValues(values) {
  return Array.from(new Set(values));
}

function lineLabelForMessage(line) {
  return line === "unclassified" ? LINE_LABELS.unclassified : "Line " + line;
}

function formatCapturedAtForMessage(capturedAt) {
  const date = new Date(capturedAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23"
  }).format(date).replace(", ", " at ");
}

function stopHeadsign(name) {
  return String(name ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .pop() ?? "";
}

function distanceToCorridorMeters(point, corridor) {
  let best = Number.POSITIVE_INFINITY;
  const paths = corridor.paths?.length ? corridor.paths : [corridor.points];

  for (const path of paths) {
    for (let index = 0; index < path.length - 1; index += 1) {
      const distance = distanceToSegmentMeters(point, asCoordinate(path[index]), asCoordinate(path[index + 1]));
      if (distance < best) {
        best = distance;
      }
    }
  }

  return best;
}

function asCoordinate(point) {
  if (Array.isArray(point)) {
    return { lat: point[0], lon: point[1] };
  }

  return point;
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

function nearestStopFromList(point, stops) {
  let best = null;

  for (const stop of stops) {
    const distance = haversineMeters(point, stop);
    if (!best || distance < best.distance) {
      best = { name: stop.name, distance };
    }
  }

  return best ?? { name: "", distance: Number.POSITIVE_INFINITY };
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

function roundedMeters(value) {
  if (!Number.isFinite(value)) {
    return "";
  }

  return String(Math.round(value));
}
