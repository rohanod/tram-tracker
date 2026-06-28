import { classifyCapture, LEG_LABELS, MAIN_LINE_VALUES, legValuesForCapturedAt, normalizeLeg, normalizeLine } from "../shared/tram";
import type { LineInfo, LocalEntry, LocationState, MapPoint, Viewer } from "./types";

export const DEFAULT_LINE_CATALOG: Record<string, LineInfo> = {
  "12": { line: "12", color: "#f5a300", foreground: "#111111", type: "Tramways", link: "" },
  "14": { line: "14", color: "#5a1e82", foreground: "#ffffff", type: "Tramways", link: "" },
  "17": { line: "17", color: "#00ace7", foreground: "#111111", type: "Tramways", link: "" },
  "18": { line: "18", color: "#b82f89", foreground: "#ffffff", type: "Tramways", link: "" }
};
const LINE_COLORS: Record<string, string> = {
  "12": "#f5a300",
  "14": "#5a1e82",
  "17": "#00ace7",
  "18": "#b82f89"
};
const LINE_FOREGROUNDS: Record<string, string> = {
  "12": "#111111",
  "14": "#ffffff",
  "17": "#111111",
  "18": "#ffffff"
};
const CDN_LINE_DATA_URL = "https://cdn.jsdelivr.net/gh/rohanod/tram-tracker@main/cdn/tpg-lines-v1.json";

export function lineColor(line: string, catalog: Record<string, LineInfo> = DEFAULT_LINE_CATALOG) {
  const normalized = normalizeLine(line);
  return catalog[normalized]?.color ?? LINE_COLORS[normalized] ?? "#4a6fae";
}

export function lineForeground(line: string, catalog: Record<string, LineInfo> = DEFAULT_LINE_CATALOG) {
  const normalized = normalizeLine(line);
  return catalog[normalized]?.foreground ?? LINE_FOREGROUNDS[normalized] ?? "#ffffff";
}

export function lineLabel(line: string) {
  const normalized = normalizeLine(line);
  if (normalized === "unclassified") {
    return "Manual";
  }

  return "Line " + normalized;
}

export async function loadLineCatalog(): Promise<Record<string, LineInfo>> {
  const response = await fetch(CDN_LINE_DATA_URL, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error("Line data HTTP " + response.status);
  }

  const data = await response.json();
  const catalog: Record<string, LineInfo> = { ...DEFAULT_LINE_CATALOG };

  for (const entry of Array.isArray(data?.lines) ? data.lines : []) {
    const line = normalizeLine(entry?.l);
    if (line !== "unclassified") {
      catalog[line] = {
        line,
        color: normalizeHexColor(entry?.c) || lineColor(line),
        foreground: normalizeHexColor(entry?.f) || lineForeground(line),
        type: String(entry?.t ?? ""),
        link: String(entry?.u ?? "")
      };
    }
  }

  return catalog;
}

export function compareTransitLines(a: string, b: string) {
  const mainA = MAIN_LINE_VALUES.indexOf(a);
  const mainB = MAIN_LINE_VALUES.indexOf(b);
  if (mainA !== -1 || mainB !== -1) {
    return (mainA === -1 ? 999 : mainA) - (mainB === -1 ? 999 : mainB);
  }

  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function normalizeHexColor(value: unknown) {
  const color = String(value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "";
}

export function locationText(location: LocationState, classification: ReturnType<typeof classifyCapture>) {
  if (location.status === "checking") {
    return "Checking current position.";
  }
  if (location.status === "denied") {
    return "Location denied. Save manually or enable location access.";
  }
  if (location.status === "unavailable") {
    return "Location unavailable. Save manually.";
  }
  if (location.status !== "captured") {
    return "Location will be requested for route defaults.";
  }
  if (classification.status === "matched") {
    return LEG_LABELS[classification.suggestedLeg as keyof typeof LEG_LABELS] + " on " + lineLabel(classification.suggestedLine) + " near " + classification.nearestStopName;
  }
  if (classification.status === "ambiguous") {
    if (classification.suggestedLeg !== "unclassified") {
      return LEG_LABELS[classification.suggestedLeg as keyof typeof LEG_LABELS] + ". Choose the exact line.";
    }
    return "Choose the leg and line manually.";
  }
  if (classification.status === "outside_route") {
    return "Outside the configured corridors. Choose manually.";
  }
  if (classification.status === "outside_geneva") {
    return "Outside Geneva bounds. Choose manually.";
  }
  return "Choose manually.";
}

export function statusLabel(status: string) {
  if (status === "matched") return "Route matched";
  if (status === "ambiguous") return "Manual route choice";
  if (status === "outside_route") return "Outside route";
  if (status === "outside_geneva") return "Outside Geneva";
  if (status === "no_location") return "No location";
  return "Saved entry";
}

export function syncLabel(status: LocalEntry["syncStatus"]) {
  if (status === "synced") return "synced";
  if (status === "failed") return "sync failed";
  if (status === "delete_pending") return "delete pending";
  return "pending sync";
}

export function lastSyncText(lastSuccessfulSyncAt: string, syncing: boolean, pendingCount: number) {
  if (syncing) return pendingCount > 0 ? "Syncing " + pendingCount : "Syncing";
  if (pendingCount > 0) return pendingCount + " pending";
  if (!lastSuccessfulSyncAt) return "Not synced yet";
  return "Last synced " + formatShortTime(lastSuccessfulSyncAt);
}

export function accountStatusText(authLoading: boolean, viewer: Viewer | undefined, canUseSaver: boolean, priorAuthorized: boolean) {
  if (authLoading && !viewer) return "Checking account";
  if (viewer?.isAllowed) return "Signed in";
  if (!viewer?.isAllowed && canUseSaver && priorAuthorized) return "Offline access";
  if (!viewer?.isAllowed && canUseSaver) return "Access cached";
  if (viewer?.isGuest) return "Guest";
  if (viewer && !viewer.isAllowed) return "Not allowed";
  return "Signed out";
}

function formatShortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function syncButtonLabel(syncing: boolean, pendingCount: number) {
  if (syncing) {
    return "Syncing";
  }

  return pendingCount > 0 ? "Sync " + pendingCount : "Sync";
}

export function legOptionsForEntry(entry: LocalEntry, savedLeg: string) {
  const options = legValuesForCapturedAt(entry.capturedAt);
  return options.includes(savedLeg) ? options : [savedLeg, ...options];
}

export function savedTimeForEntry(entry: LocalEntry) {
  return entry.savedAt || entry.capturedAt;
}

export function savedLegForEntry(entry: LocalEntry) {
  return normalizeLeg(entry.savedLeg);
}

export function entryPoint(entry: LocalEntry): MapPoint | null {
  if (!String(entry.lat ?? "").trim() || !String(entry.lon ?? "").trim()) {
    return null;
  }
  return parsePointFromText(entry.lat, entry.lon);
}

export function parsePointFromText(latText: string, lonText: string): MapPoint | null {
  if (!String(latText ?? "").trim() || !String(lonText ?? "").trim()) {
    return null;
  }
  const lat = Number(latText);
  const lon = Number(lonText);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return { lat, lon };
}

export function clampMapZoom(zoom: number) {
  return Math.max(MIN_REVIEW_MAP_ZOOM, Math.min(MAX_REVIEW_MAP_ZOOM, zoom));
}

export function formatEntryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function requestLocation(setLocation: (location: LocationState) => void) {
  if (!navigator.geolocation) {
    setLocation({ status: "unavailable" });
    return;
  }

  setLocation({ status: "checking" });
  navigator.geolocation.getCurrentPosition(
    (position) => {
      setLocation({
        status: "captured",
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: Math.round(position.coords.accuracy)
      });
    },
    (err) => setLocation({ status: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" }),
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 9000 }
  );
}

export function installPwaAssets() {
  if (typeof document !== "undefined" && !document.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/manifest.webmanifest";
    document.head.appendChild(manifest);

    const theme = document.createElement("meta");
    theme.name = "theme-color";
    theme.content = "#4367a1";
    document.head.appendChild(theme);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }
}
