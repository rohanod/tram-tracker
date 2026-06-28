import { CORRIDORS, GENEVA_BOUNDS } from "./corridors";

export const MATCH_RADIUS_METERS = 250;
export const LEG_VALUES = ["unclassified", "from_home", "to_school", "from_school", "to_home"];
export const MAIN_LINE_VALUES = ["12", "14", "17", "18"];
export const LINE_VALUES = ["unclassified", ...MAIN_LINE_VALUES];
export const OBSERVATION_VALUES = ["been_on", "seen"];

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
  const leg = normalizeLeg(entry.savedLeg ?? entry.leg);
  return "Seen before: " + lineLabelForMessage(line) + ", " + LEG_LABELS[leg] + ".";
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

export function classifyCapture(location, capturedAt) {
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

  const corridorDistances = CORRIDORS.map((corridor) => {
    const stop = nearestStop(normalizedLocation, corridor);
    const routeDistanceMeters = distanceToCorridorMeters(normalizedLocation, corridor);
    const distanceMeters = Math.min(routeDistanceMeters, stop.distance);
    return {
      corridor,
      routeDistanceMeters,
      stopDistanceMeters: stop.distance,
      distanceMeters,
      nearestStopName: stop.name
    };
  }).sort((a, b) => a.distanceMeters - b.distanceMeters);

  const matches = corridorDistances.filter((match) => match.distanceMeters <= MATCH_RADIUS_METERS);
  const nearest = corridorDistances[0];

  if (matches.length === 0) {
    return {
      ...baseClassification("outside_route"),
      routeGroup: "none",
      distanceMeters: roundedMeters(nearest.distanceMeters),
      nearestStopName: nearest.nearestStopName
    };
  }

  const priorityRouteGroups = uniqueValues(matches.map((match) => match.corridor.routeGroup).filter(isPriorityRouteGroup));
  const effectiveMatches = priorityRouteGroups.length === 1 ? matches.filter((match) => match.corridor.routeGroup === priorityRouteGroups[0]) : matches;
  const routeGroups = uniqueValues(effectiveMatches.map((match) => match.corridor.routeGroup ?? match.corridor.id));
  const matchingLines = uniqueValues(effectiveMatches.map((match) => match.corridor.line).filter(Boolean));

  if (routeGroups.length > 1) {
    return {
      ...baseClassification("ambiguous"),
      routeGroup: "multiple",
      distanceMeters: roundedMeters(nearest.distanceMeters),
      nearestStopName: nearest.nearestStopName,
      matchingLines
    };
  }

  const routeGroup = routeGroups[0];
  const suggestedLine = matchingLines.length === 1 ? matchingLines[0] : "unclassified";
  return {
    status: matchingLines.length === 1 ? "matched" : "ambiguous",
    suggestedLeg: legForRouteAndTime(routeGroup, capturedAt),
    suggestedLine,
    routeGroup,
    distanceMeters: roundedMeters(matches[0].distanceMeters),
    nearestStopName: matches[0].nearestStopName,
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

function legForRouteAndTime(routeGroup, capturedAt) {
  const beforeNoon = isBeforeGenevaNoon(capturedAt);

  if (routeGroup === "home_14_18") {
    return beforeNoon ? "from_home" : "to_home";
  }

  if (routeGroup === "school_12_17") {
    return beforeNoon ? "to_school" : "from_school";
  }

  return "unclassified";
}

function isPriorityRouteGroup(routeGroup) {
  return routeGroup === "home_14_18" || routeGroup === "school_12_17";
}

function uniqueValues(values) {
  return Array.from(new Set(values));
}

function lineLabelForMessage(line) {
  return line === "unclassified" ? LINE_LABELS.unclassified : "Line " + line;
}

function isBeforeGenevaNoon(capturedAt) {
  const date = new Date(capturedAt);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "12");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return hour < 12 || (hour === 11 && minute <= 59);
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

function nearestStop(point, corridor) {
  let best = null;

  for (const stop of corridor.points) {
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
