export const GENEVA_BOUNDS = { minLat: 46.05, maxLat: 46.4, minLon: 5.85, maxLon: 6.35 };

export let CORRIDORS = [];
export let TRANSIT_STOPS = [];

export function setTransitData(corridors, stops = []) {
  CORRIDORS = Array.isArray(corridors) ? corridors : [];
  TRANSIT_STOPS = Array.isArray(stops) ? stops : [];
}

export function setCorridors(corridors) {
  setTransitData(corridors, TRANSIT_STOPS);
}
