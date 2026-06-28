import { normalizeLeg, normalizeLine, normalizeObservationType } from "../shared/tram";

export function shortcutPrefillFromSearch(search: string) {
  const params = new URLSearchParams(search);
  const vehicleRaw = firstSearchParam(params, ["vehicleNumber", "vehicle", "number", "v"]);
  const lineRaw = firstSearchParam(params, ["savedLine", "line", "route"]);
  const legRaw = firstSearchParam(params, ["savedLeg", "leg"]);
  const observationRaw = firstSearchParam(params, ["observationType", "type", "capture"]);
  const latRaw = firstSearchParam(params, ["lat", "latitude"]);
  const lonRaw = firstSearchParam(params, ["lon", "lng", "longitude"]);
  const accuracyRaw = firstSearchParam(params, ["accuracy", "horizontalAccuracy"]);
  const vehicleNumber = String(vehicleRaw ?? "").replace(/\D/g, "").slice(0, 4);
  const line = lineRaw ? normalizeLine(lineRaw) : "";
  const leg = legRaw ? normalizePrefillLeg(legRaw) : "";
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  const accuracy = Number(accuracyRaw);
  const location = Number.isFinite(lat) && Number.isFinite(lon)
    ? { lat, lon, accuracy: Number.isFinite(accuracy) ? Math.max(0, accuracy) : 0 }
    : null;

  return {
    hasAny: Boolean(vehicleRaw || lineRaw || legRaw || observationRaw || location),
    vehicleNumber,
    observationType: observationRaw ? normalizeObservationType(observationRaw) : "",
    leg,
    line,
    location
  };
}

function firstSearchParam(params: URLSearchParams, names: string[]) {
  for (const name of names) {
    const value = params.get(name);
    if (value !== null && value.trim() !== "") {
      return value;
    }
  }

  return "";
}

function normalizePrefillLeg(value: string) {
  const leg = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (leg === "none" || leg === "no_leg" || leg === "manual" || leg === "weekend") {
    return "unclassified";
  }

  return normalizeLeg(leg);
}
