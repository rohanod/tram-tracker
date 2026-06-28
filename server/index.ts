import { capsule, endpoint, json, mutation, query, string, table, text } from "lakebed/server";
import {
  classifyCapture,
  isValidVehicleNumber,
  normalizeLeg,
  normalizeLine,
  normalizeLocation,
  normalizeObservationType,
  normalizeVehicleNumber,
  roundCoordinate,
  vehicleHistoryMessage
} from "../shared/tram";

const APP_NAME = "tram-tracker";

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
  },

  queries: {
    viewer: query((ctx) => viewerFor(ctx)),

    entries: query((ctx) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return [];
      }

      return rowsForOwners(ctx.db.tripEntries, ownerIdsFor(ctx, viewer))
        .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))
        .slice(0, 80);
    })
  },

  mutations: {
    saveEntry: mutation((ctx, input) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return { ok: false, reason: "unauthorized" };
      }

      const prepared = prepareEntryRow(ctx, input, primaryOwnerIdFor(ctx, viewer));
      if (!prepared.ok) {
        return prepared;
      }

      const existing = ctx.db.tripEntries
        .where("clientEntryId", prepared.clientEntryId)
        .all()
        .find((entry) => ownsRow(ctx, viewer, entry));

      if (existing) {
        ctx.db.tripEntries.update(existing.id, prepared.row);
        return { ok: true, id: existing.id };
      }

      const inserted = ctx.db.tripEntries.insert(prepared.row);
      return { ok: true, id: inserted?.id ?? "" };
    }),

    updateEntryLeg: mutation((ctx, id, leg) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return { ok: false, reason: "unauthorized" };
      }

      const entry = ctx.db.tripEntries.get(String(id ?? ""));
      if (!entry || !ownsRow(ctx, viewer, entry)) {
        return { ok: false, reason: "not_found" };
      }

      ctx.db.tripEntries.update(entry.id, { savedLeg: normalizeLeg(leg) });
      return { ok: true, id: entry.id };
    }),

    updateEntryLine: mutation((ctx, id, line) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return { ok: false, reason: "unauthorized" };
      }

      const entry = ctx.db.tripEntries.get(String(id ?? ""));
      if (!entry || !ownsRow(ctx, viewer, entry)) {
        return { ok: false, reason: "not_found" };
      }

      ctx.db.tripEntries.update(entry.id, { savedLine: normalizeLine(line) });
      return { ok: true, id: entry.id };
    }),

    deleteEntry: mutation((ctx, id) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return { ok: false, reason: "unauthorized" };
      }

      const idOrClientEntryId = String(id ?? "");
      const entry =
        ctx.db.tripEntries.get(idOrClientEntryId) ||
        ctx.db.tripEntries
          .where("clientEntryId", idOrClientEntryId)
          .all()
          .find((candidate) => ownsRow(ctx, viewer, candidate));

      if (!entry || !ownsRow(ctx, viewer, entry)) {
        return { ok: false, reason: "not_found" };
      }

      ctx.db.tripEntries.delete(entry.id);
      return { ok: true, id: entry.id };
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

function rowsForOwners(tableRef, ownerIds) {
  const seen = new Set();
  const rows = [];

  for (const ownerId of ownerIds) {
    for (const row of tableRef.where("ownerId", ownerId).all()) {
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
  const classification = classifyCapture(point, capturedAt);
  const locationStatus = cleanBounded(input?.locationStatus, 48) || (point ? "captured" : "unavailable");
  const inferredLeg = normalizeLeg(input?.inferredLeg || classification.suggestedLeg);
  const savedLeg = normalizeSavedLegOverride(input?.savedLeg ?? input?.leg, inferredLeg);
  const inferredLine = normalizeLine(input?.inferredLine || classification.suggestedLine);
  const savedLine = normalizeLine(input?.savedLine || input?.line || inferredLine);

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
      nearestStopName: cleanBounded(input?.nearestStopName, 120) || String(classification.nearestStopName ?? ""),
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
  const priorEntry = latestVehicleEntry(ctx, ownerId, prepared.row.vehicleNumber, prepared.clientEntryId);

  const existing = ctx.db.tripEntries
    .where("clientEntryId", prepared.clientEntryId)
    .all()
    .find((entry) => entry.ownerId === ownerId);

  if (existing) {
    ctx.db.tripEntries.update(existing.id, prepared.row);
    return json(shortcutEntryResponse(existing.id, prepared, priorEntry), jsonOptions(200));
  }

  const inserted = ctx.db.tripEntries.insert(prepared.row);
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
      message: vehicleHistoryMessage(latestVehicleEntry(ctx, ownerId, vehicleNumber, ""))
    },
    jsonOptions(200)
  );
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

function latestVehicleEntry(ctx, ownerId, vehicleNumber, excludedClientEntryId) {
  return ctx.db.tripEntries
    .where("ownerId", ownerId)
    .all()
    .filter(
      (entry) =>
        String(entry.vehicleNumber ?? "") === vehicleNumber &&
        String(entry.clientEntryId ?? "") !== String(excludedClientEntryId ?? "")
    )
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

function normalizeSavedLegOverride(value, inferredLeg) {
  const leg = String(value ?? "").trim().toLowerCase();
  if (!leg || leg === "auto" || leg === "detect" || leg === "detected") {
    return normalizeLeg(inferredLeg);
  }

  return normalizeLeg(leg);
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
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
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
