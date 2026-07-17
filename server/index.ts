import { capsule, endpoint, json, mutation, query, string, table, text } from "lakebed/server";
import {
  classifyCapture,
  isValidVehicleNumber,
  normalizeDirection,
  normalizeLine,
  normalizeLocation,
  normalizeObservationType,
  normalizeVehicleNumber,
  nearestTransitStops,
  roundCoordinate,
  transitStopsFromMetadata,
  vehicleHistoryMessage
} from "../shared/tram";

const APP_NAME = "tram-tracker";
const DEFAULT_LINES = ["14", "18", "12", "17"];
let shortcutStopCache = { version: "", metadataUrl: "", stops: [] };

export default capsule({
  name: APP_NAME,

  schema: {
    tripEntries: table({
      clientEntryId: string(),
      vehicleNumber: string(),
      observationType: string(),
      capturedAt: string(),
      savedAt: string(),
      lat: string(),
      lon: string(),
      locationStatus: string(),
      classificationStatus: string(),
      inferredLeg: string(),
      savedLeg: string(),
      inferredLine: string(),
      savedLine: string(),
      routeGroup: string(),
      distanceMeters: string(),
      nearestStopName: string(),
      ownerId: string()
    })
      .index("by_owner", ["ownerId"])
      .index("by_owner_client", ["ownerId", "clientEntryId"])
      .index("by_owner_vehicle", ["ownerId", "vehicleNumber"]),
    userSettings: table({
      ownerId: string(),
      defaultLines: string()
    }).index("by_owner", ["ownerId"]),
    transitData: table({
      ownerId: string(),
      version: string(),
      metadataKey: string(),
      metadataUrl: string(),
      metadataSize: string(),
      geometryKey: string(),
      geometryUrl: string(),
      geometrySize: string()
    }).index("by_owner", ["ownerId"])
  },

  queries: {
    viewer: query((ctx) => viewerFor(ctx)),

    entries: query(async (ctx) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return [];
      }

      return (await rowsForOwners(ctx.db.tripEntries, ownerIdsFor(ctx, viewer)))
        .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)));
    }),

    settings: query(async (ctx) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) return { defaultLines: DEFAULT_LINES };
      const row = await firstForOwners(ctx.db.userSettings, ownerIdsFor(ctx, viewer));
      return { defaultLines: parseDefaultLines(row?.defaultLines) };
    }),

    transitData: query(async (ctx) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) return null;
      const row = await firstForOwners(ctx.db.transitData, ownerIdsFor(ctx, viewer));
      return row ? transitDataResponse(row) : null;
    })
  },

  mutations: {
    saveEntry: mutation(async (ctx, input) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return { ok: false, reason: "unauthorized" };
      }

      const prepared = prepareEntryRow(ctx, input, primaryOwnerIdFor(ctx, viewer));
      if (!prepared.ok) {
        return prepared;
      }

      const existing = await entryByClientId(ctx, ownerIdsFor(ctx, viewer), prepared.clientEntryId);

      if (existing) {
        await ctx.db.tripEntries.update(existing.id, prepared.row);
        return { ok: true, id: existing.id };
      }

      const inserted = await ctx.db.tripEntries.insert(prepared.row);
      return { ok: true, id: inserted?.id ?? "" };
    }),

    updateEntryLeg: mutation(async (ctx, id, leg) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return { ok: false, reason: "unauthorized" };
      }

      const entry = await ctx.db.tripEntries.get(String(id ?? ""));
      if (!entry || !ownsRow(ctx, viewer, entry)) {
        return { ok: false, reason: "not_found" };
      }

      await ctx.db.tripEntries.update(entry.id, { savedLeg: normalizeDirection(leg, entry.savedLine) });
      return { ok: true, id: entry.id };
    }),

    updateEntryLine: mutation(async (ctx, id, line) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return { ok: false, reason: "unauthorized" };
      }

      const entry = await ctx.db.tripEntries.get(String(id ?? ""));
      if (!entry || !ownsRow(ctx, viewer, entry)) {
        return { ok: false, reason: "not_found" };
      }

      await ctx.db.tripEntries.update(entry.id, { savedLine: normalizeLine(line) });
      return { ok: true, id: entry.id };
    }),

    migrateDirections: mutation(async (ctx) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return { ok: false, reason: "unauthorized" };
      }

      return { ok: true, updated: await migrateDirectionRows(ctx, ownerIdsFor(ctx, viewer)) };
    }),

    deleteEntry: mutation(async (ctx, id) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return { ok: false, reason: "unauthorized" };
      }

      const idOrClientEntryId = String(id ?? "");
      const byId = await ctx.db.tripEntries.get(idOrClientEntryId);
      const entry = byId || await entryByClientId(ctx, ownerIdsFor(ctx, viewer), idOrClientEntryId);

      if (!entry || !ownsRow(ctx, viewer, entry)) {
        return { ok: false, reason: "not_found" };
      }

      await ctx.db.tripEntries.delete(entry.id);
      return { ok: true, id: entry.id };
    }),

    saveSettings: mutation(async (ctx, input) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) return { ok: false, reason: "unauthorized" };
      const defaultLines = normalizeDefaultLines(input?.defaultLines);
      if (!defaultLines) return { ok: false, reason: "invalid_default_lines" };
      const ownerId = primaryOwnerIdFor(ctx, viewer);
      const existing = await ctx.db.userSettings
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .first();
      if (existing) {
        await ctx.db.userSettings.update(existing.id, { defaultLines: JSON.stringify(defaultLines) });
      } else {
        await ctx.db.userSettings.insert({ ownerId, defaultLines: JSON.stringify(defaultLines) });
      }
      return { ok: true, defaultLines };
    }),

    activateTransitData: mutation(async (ctx, input) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) return { ok: false, reason: "unauthorized" };
      const next = normalizeTransitDataInput(input);
      if (!next) return { ok: false, reason: "invalid_transit_data" };
      const ownerId = primaryOwnerIdFor(ctx, viewer);
      const existing = await ctx.db.transitData
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .first();
      const previous = existing ? transitDataResponse(existing) : null;
      if (existing) {
        await ctx.db.transitData.update(existing.id, { ownerId, ...next });
      } else {
        await ctx.db.transitData.insert({ ownerId, ...next });
      }
      return { ok: true, previous, current: next };
    })
  },

  endpoints: {
    manifest: endpoint({ method: "GET", path: "/manifest.webmanifest" }, () =>
      text(JSON.stringify(MANIFEST), {
        headers: {
          "Content-Type": "application/manifest+json; charset=utf-8",
          "Cache-Control": "public, max-age=3600"
        }
      })
    ),

    serviceWorker: endpoint({ method: "GET", path: "/sw.js" }, () =>
      text(SERVICE_WORKER_SOURCE, {
        headers: {
          "Content-Type": "text/javascript; charset=utf-8",
          "Cache-Control": "no-store"
        }
      })
    ),

    pwaIcon: endpoint({ method: "GET", path: "/pwa/icon.svg" }, () =>
      text(PWA_ICON_SOURCE, {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, max-age=86400"
        }
      })
    ),

    shortcutSaveGet: endpoint({ method: "GET", path: "/api/shortcut/save" }, (ctx, req) => saveShortcutEntry(ctx, req)),

    shortcutSavePost: endpoint({ method: "POST", path: "/api/shortcut/save" }, (ctx, req) => saveShortcutEntry(ctx, req)),

    shortcutLookupGet: endpoint({ method: "GET", path: "/api/shortcut/lookup" }, (ctx, req) => lookupShortcutEntry(ctx, req)),

    shortcutLookupPost: endpoint({ method: "POST", path: "/api/shortcut/lookup" }, (ctx, req) => lookupShortcutEntry(ctx, req)),

    shortcutStopsPost: endpoint({ method: "POST", path: "/api/shortcut/stops" }, (ctx, req) => nearestShortcutStops(ctx, req)),

    apiEntryPost: endpoint({ method: "POST", path: "/api/entries" }, (ctx, req) => saveShortcutEntry(ctx, req))
  }
});

function viewerFor(ctx) {
  const allowedEmail = String(ctx.env.ALLOWED_EMAIL ?? "").trim().toLowerCase();
  const email = String(ctx.auth.email ?? "").trim().toLowerCase();
  const isGoogle = ctx.auth.provider === "google";
  const isAllowed = Boolean(allowedEmail && email && isGoogle && email === allowedEmail);

  return {
    isAllowed,
    hasAllowedEmail: Boolean(allowedEmail),
    isGuest: Boolean(ctx.auth.isGuest),
    provider: String(ctx.auth.provider ?? ""),
    userId: String(ctx.auth.userId ?? ""),
    displayName: String(ctx.auth.displayName ?? ""),
    email
  };
}

function ownerKeyFor(ctx) {
  const allowedEmail = String(ctx.env.ALLOWED_EMAIL ?? "").trim().toLowerCase();
  return allowedEmail ? "allowed:" + allowedEmail : "";
}

function primaryOwnerIdFor(ctx, viewer) {
  return ownerKeyFor(ctx) || String(viewer?.userId ?? "");
}

function ownerIdsFor(ctx, viewer) {
  const ids = [ownerKeyFor(ctx), String(viewer?.userId ?? "")].filter(Boolean);
  return Array.from(new Set(ids));
}

function ownsRow(ctx, viewer, row) {
  return Boolean(row && ownerIdsFor(ctx, viewer).includes(String(row.ownerId ?? "")));
}

async function rowsForOwners(tableRef, ownerIds) {
  const seen = new Set();
  const rows = [];

  for (const ownerId of ownerIds) {
    const ownerRows = await tableRef
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    for (const row of ownerRows) {
      const id = String(row.id ?? row.clientEntryId ?? "");
      if (seen.has(id)) {
        continue;
      }

      seen.add(id);
      rows.push(row);
    }
  }

  return rows;
}

async function firstForOwners(tableRef, ownerIds) {
  for (const ownerId of ownerIds) {
    const row = await tableRef
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .first();
    if (row) return row;
  }
  return null;
}

async function entryByClientId(ctx, ownerIds, clientEntryId) {
  for (const ownerId of ownerIds) {
    const entry = await ctx.db.tripEntries
      .withIndex("by_owner_client", (q) => q.eq("ownerId", ownerId).eq("clientEntryId", clientEntryId))
      .first();
    if (entry) return entry;
  }
  return null;
}

async function migrateDirectionRows(ctx, ownerIds) {
  let updated = 0;
  for (const entry of await rowsForOwners(ctx.db.tripEntries, ownerIds)) {
    const inferredLine = normalizeLine(entry.inferredLine);
    const savedLine = normalizeLine(entry.savedLine);
    const inferredLeg = normalizeDirection(entry.inferredLeg, inferredLine);
    const savedLeg = normalizeDirection(entry.savedLeg, savedLine);
    if (inferredLeg !== entry.inferredLeg || savedLeg !== entry.savedLeg) {
      await ctx.db.tripEntries.update(entry.id, { inferredLeg, savedLeg });
      updated += 1;
    }
  }

  return updated;
}

function parseDefaultLines(value) {
  try {
    return normalizeDefaultLines(JSON.parse(String(value ?? ""))) ?? DEFAULT_LINES;
  } catch {
    return DEFAULT_LINES;
  }
}

function normalizeDefaultLines(value) {
  if (!Array.isArray(value) || value.length > 4) return null;
  const lines = value.map(normalizeLine);
  if (lines.some((line) => line === "unclassified") || new Set(lines).size !== lines.length) return null;
  return lines;
}

function normalizeTransitDataInput(input) {
  const version = cleanBounded(input?.version, 80);
  const metadataKey = cleanStorageKey(input?.metadataKey);
  const metadataUrl = cleanStorageUrl(input?.metadataUrl, metadataKey);
  const geometryKey = cleanStorageKey(input?.geometryKey);
  const geometryUrl = cleanStorageUrl(input?.geometryUrl, geometryKey);
  const metadataSize = cleanSize(input?.metadataSize);
  const geometrySize = cleanSize(input?.geometrySize);
  if (!version || !metadataKey || !metadataUrl || !geometryKey || !geometryUrl || !metadataSize || !geometrySize) return null;
  return { version, metadataKey, metadataUrl, metadataSize, geometryKey, geometryUrl, geometrySize };
}

function cleanStorageKey(value) {
  const key = cleanBounded(value, 160);
  return /^public\/[A-Za-z0-9_-]+$/.test(key) ? key : "";
}

function cleanStorageUrl(value, key) {
  const url = cleanBounded(value, 500);
  try {
    const parsed = new URL(url);
    const localHttp = parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    return (parsed.protocol === "https:" || localHttp) && parsed.pathname === "/storage/" + key ? url : "";
  } catch {
    return "";
  }
}

function cleanSize(value) {
  const size = Number(value);
  return Number.isInteger(size) && size > 0 && size <= 5 * 1024 * 1024 ? String(size) : "";
}

function transitDataResponse(row) {
  return {
    version: String(row.version ?? ""),
    metadataKey: String(row.metadataKey ?? ""),
    metadataUrl: String(row.metadataUrl ?? ""),
    metadataSize: Number(row.metadataSize ?? 0),
    geometryKey: String(row.geometryKey ?? ""),
    geometryUrl: String(row.geometryUrl ?? ""),
    geometrySize: Number(row.geometrySize ?? 0)
  };
}

function prepareEntryRow(ctx, input, ownerId) {
  const vehicleNumber = normalizeVehicleNumber(input?.vehicleNumber ?? input?.vehicle ?? input?.number);
  if (!isValidVehicleNumber(vehicleNumber)) {
    return { ok: false, reason: "invalid_vehicle_number" };
  }

  const clientEntryId = cleanBounded(input?.clientEntryId, 80);
  if (!clientEntryId) {
    return { ok: false, reason: "missing_client_entry_id" };
  }

  if (!ownerId) {
    return { ok: false, reason: "missing_owner" };
  }

  const capturedAt = normalizeIsoDate(input?.capturedAt ?? input?.time ?? input?.datetime ?? input?.date);
  const savedAt = normalizeIsoDate(input?.savedAt || capturedAt);
  const location = locationFromInput(input);
  const point = location ? normalizeLocation(location) : null;
  const classification = classifyCapture(point, capturedAt, false);
  const locationStatus = cleanBounded(input?.locationStatus, 48) || (point ? "captured" : "unavailable");
  const inferredLine = normalizeLine(input?.inferredLine || classification.suggestedLine);
  const savedLine = normalizeLine(input?.savedLine || input?.line || inferredLine);
  const inferredLeg = normalizeDirection(input?.inferredDirection ?? input?.inferredLeg ?? classification.suggestedLeg, inferredLine, classification.suggestedLeg);
  const savedLeg = normalizeSavedDirectionOverride(input?.customDirection || input?.savedDirection || input?.direction || input?.savedLeg || input?.leg, savedLine, inferredLeg);

  return {
    ok: true,
    clientEntryId,
    classification,
    row: {
      clientEntryId,
      vehicleNumber,
      observationType: normalizeObservationType(input?.observationType ?? input?.type),
      capturedAt,
      savedAt,
      lat: point ? roundCoordinate(point.lat) : "",
      lon: point ? roundCoordinate(point.lon) : "",
      locationStatus,
      classificationStatus: cleanBounded(input?.classificationStatus, 48) || classification.status,
      inferredLeg,
      savedLeg,
      inferredLine,
      savedLine,
      routeGroup: cleanBounded(input?.routeGroup, 48) || classification.routeGroup || "none",
      distanceMeters: cleanBounded(input?.distanceMeters, 24) || String(classification.distanceMeters ?? ""),
      nearestStopName: cleanBounded(input?.nearestStopName, 120),
      ownerId
    }
  };
}

async function saveShortcutEntry(ctx, req) {
  const auth = shortcutAuthorization(ctx, req);
  if (!auth.ok) {
    return json({ ok: false, reason: auth.reason }, jsonOptions(auth.status));
  }

  const ownerId = ownerKeyFor(ctx);
  if (!ownerId) {
    return json({ ok: false, reason: "allowed_email_missing" }, jsonOptions(503));
  }

  const rawInput = await inputFromRequest(req);
  const input = {
    ...rawInput,
    clientEntryId: cleanBounded(rawInput.clientEntryId, 80) || createShortcutEntryId()
  };
  const prepared = prepareEntryRow(ctx, input, ownerId);
  if (!prepared.ok) {
    return json({ ok: false, reason: prepared.reason }, jsonOptions(400));
  }
  const priorEntry = await latestVehicleEntry(ctx, ownerId, prepared.row.vehicleNumber, prepared.clientEntryId);

  const existing = await ctx.db.tripEntries
    .withIndex("by_owner_client", (q) => q.eq("ownerId", ownerId).eq("clientEntryId", prepared.clientEntryId))
    .first();

  if (existing) {
    await ctx.db.tripEntries.update(existing.id, prepared.row);
    return json(shortcutEntryResponse(existing.id, prepared, priorEntry), jsonOptions(200));
  }

  const inserted = await ctx.db.tripEntries.insert(prepared.row);
  return json(shortcutEntryResponse(inserted?.id ?? "", prepared, priorEntry), jsonOptions(201));
}

async function lookupShortcutEntry(ctx, req) {
  const auth = shortcutAuthorization(ctx, req);
  if (!auth.ok) {
    return json({ ok: false, reason: auth.reason, message: "" }, jsonOptions(auth.status));
  }

  const ownerId = ownerKeyFor(ctx);
  if (!ownerId) {
    return json({ ok: false, reason: "allowed_email_missing", message: "" }, jsonOptions(503));
  }

  const input = await inputFromRequest(req);
  const vehicleNumber = normalizeVehicleNumber(input?.vehicleNumber ?? input?.vehicle ?? input?.number);
  if (!vehicleNumber) {
    return json({ ok: false, reason: "invalid_vehicle_number", message: "" }, jsonOptions(400));
  }

  return json(
    {
      ok: true,
      vehicleNumber,
      message: vehicleHistoryMessage(await latestVehicleEntry(ctx, ownerId, vehicleNumber, ""))
    },
    jsonOptions(200)
  );
}

async function nearestShortcutStops(ctx, req) {
  const auth = shortcutAuthorization(ctx, req);
  if (!auth.ok) {
    return json({ ok: false, reason: auth.reason, stops: [] }, jsonOptions(auth.status));
  }

  const location = locationFromInput(await inputFromRequest(req));
  if (!location) {
    return json({ ok: false, reason: "invalid_location", stops: [] }, jsonOptions(400));
  }

  const ownerId = ownerKeyFor(ctx);
  if (!ownerId) {
    return json({ ok: false, reason: "allowed_email_missing", stops: [] }, jsonOptions(503));
  }

  const transitData = await firstForOwners(ctx.db.transitData, [ownerId]);
  if (!transitData?.metadataUrl) {
    return json({ ok: true, stops: ["Other"], dataAvailable: false }, jsonOptions(200));
  }

  try {
    const stops = await shortcutTransitStops(transitData);
    const nearest = nearestTransitStops(location, stops, 5).map((stop) => stop.name);
    return json({ ok: true, stops: [...nearest, "Other"], dataAvailable: Boolean(nearest.length) }, jsonOptions(200));
  } catch {
    return json({ ok: true, stops: ["Other"], dataAvailable: false }, jsonOptions(200));
  }
}

async function shortcutTransitStops(transitData) {
  const version = String(transitData.version ?? "");
  const metadataUrl = String(transitData.metadataUrl ?? "");
  if (
    shortcutStopCache.version === version &&
    shortcutStopCache.metadataUrl === metadataUrl &&
    shortcutStopCache.stops.length
  ) {
    return shortcutStopCache.stops;
  }

  const response = await fetch(metadataUrl, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error("transit_metadata_unavailable");
  }

  const stops = transitStopsFromMetadata(await response.json());
  if (!stops.length) {
    throw new Error("transit_stops_missing");
  }

  shortcutStopCache = { version, metadataUrl, stops };
  return stops;
}

function shortcutAuthorization(ctx, req) {
  const expected = cleanBounded(ctx.env.SHORTCUT_TOKEN, 300);
  if (!expected) {
    return { ok: false, reason: "shortcut_token_missing", status: 503 };
  }

  const authHeader = String(req.headers.get("authorization") ?? "");
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const token = bearerToken || String(req.headers.get("x-tram-token") ?? "").trim() || String(req.query.get("token") ?? "").trim();

  if (token !== expected) {
    return { ok: false, reason: "unauthorized", status: 401 };
  }

  return { ok: true, reason: "", status: 200 };
}

async function inputFromRequest(req) {
  const queryInput = Object.fromEntries(req.query.entries());
  if (req.method === "GET") {
    return queryInput;
  }

  const bodyText = (await req.text()).trim();
  if (!bodyText) {
    return queryInput;
  }

  const contentType = String(req.headers.get("content-type") ?? "");
  const bodyInput = contentType.includes("application/x-www-form-urlencoded")
    ? Object.fromEntries(new URLSearchParams(bodyText).entries())
    : parseJsonObject(bodyText);

  return { ...queryInput, ...bodyInput };
}

function parseJsonObject(bodyText) {
  try {
    const value = JSON.parse(bodyText);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function shortcutEntryResponse(id, prepared, priorEntry) {
  const row = prepared.row;
  return {
    ok: true,
    id,
    clientEntryId: row.clientEntryId,
    vehicleNumber: row.vehicleNumber,
    observationType: row.observationType,
    capturedAt: row.capturedAt,
    savedAt: row.savedAt,
    savedLeg: row.savedLeg,
    savedLine: row.savedLine,
    classificationStatus: row.classificationStatus,
    routeGroup: row.routeGroup,
    distanceMeters: row.distanceMeters,
    nearestStopName: row.nearestStopName,
    lat: row.lat,
    lon: row.lon,
    message: vehicleHistoryMessage(priorEntry)
  };
}

async function latestVehicleEntry(ctx, ownerId, vehicleNumber, excludedClientEntryId) {
  const entries = await ctx.db.tripEntries
    .withIndex("by_owner_vehicle", (q) => q.eq("ownerId", ownerId).eq("vehicleNumber", vehicleNumber))
    .collect();
  return entries
    .filter((entry) => String(entry.clientEntryId ?? "") !== String(excludedClientEntryId ?? ""))
    .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))[0];
}

function jsonOptions(status) {
  return {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  };
}

function createShortcutEntryId() {
  return "shortcut-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function cleanBounded(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeSavedDirectionOverride(value, line, inferredDirection) {
  const direction = String(value ?? "").trim().toLowerCase();
  if (!direction || direction === "auto" || direction === "detect" || direction === "detected") {
    return normalizeDirection(inferredDirection, line);
  }

  return normalizeDirection(value, line);
}

function normalizeIsoDate(value) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function locationFromInput(input) {
  const rawLat = input?.lat ?? input?.latitude;
  const rawLon = input?.lon ?? input?.lng ?? input?.longitude;
  if (String(rawLat ?? "").trim() === "" || String(rawLon ?? "").trim() === "") {
    return null;
  }

  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon };
}

const MANIFEST = {
  name: "Vehicle Tracker",
  short_name: "Vehicle Tracker",
  description: "A private saver for tram vehicle numbers.",
  id: "/",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#4367a1",
  prefer_related_applications: false,
  icons: [
    {
      src: "/pwa/icon.svg",
      sizes: "192x192",
      type: "image/svg+xml",
      purpose: "any"
    },
    {
      src: "/pwa/icon.svg",
      sizes: "512x512",
      type: "image/svg+xml",
      purpose: "any maskable"
    }
  ]
};

const SERVICE_WORKER_SOURCE = `
const CACHE_NAME = "tram-saver-v1";
const CORE_URLS = ["/", "/manifest.webmanifest", "/pwa/icon.svg"];
const NETWORK_EVENT = "fet" + "ch";
const networkRequest = self[NETWORK_EVENT].bind(self);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.allSettled(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener(NETWORK_EVENT, (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    networkRequest(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});
`;

const PWA_ICON_SOURCE = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Vehicle Tracker">
  <rect width="512" height="512" rx="96" fill="#ffffff"/>
  <rect x="80" y="96" width="352" height="280" rx="44" fill="#eef3fb" stroke="#4367a1" stroke-width="18"/>
  <path d="M144 190h224M146 266h220" stroke="#4367a1" stroke-width="28" stroke-linecap="round"/>
  <circle cx="176" cy="394" r="30" fill="#4367a1"/>
  <circle cx="336" cy="394" r="30" fill="#4367a1"/>
  <path d="M176 64h160" stroke="#4367a1" stroke-width="22" stroke-linecap="round"/>
</svg>
`;
