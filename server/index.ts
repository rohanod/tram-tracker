import { capsule, endpoint, json, mutation, query, string, table, text } from "lakebed/server";
import { configuredUserId, isAllowedIdentity, legacyOwnerId } from "../shared/auth";
import { collectTransitCleanupKeys, parseCleanupKeys, utf8ByteLength } from "../shared/sync";
import {
  classifyCapture,
  isValidVehicleNumber,
  normalizeDirection,
  normalizeLine,
  normalizeLocation,
  normalizeObservationType,
  normalizeVehicleNote,
  normalizeVehicleNumber,
  nearestTransitStops,
  roundCoordinate,
  transitStopsFromMetadata,
  vehicleHistoryMessage,
  vehicleLookupHistory
} from "../shared/tram";

const APP_NAME = "tram-tracker";
const DEFAULT_LINES = ["14", "18", "12", "17"];

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
    vehicleNotes: table({
      ownerId: string(),
      vehicleNumber: string(),
      note: string()
    })
      .index("by_owner", ["ownerId"])
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
      geometrySize: string(),
      pendingDeleteKeys: string().default("[]")
    }).index("by_owner", ["ownerId"]),
    transitStopIndexes: table({
      ownerId: string(),
      version: string(),
      payload: string()
    }).index("by_owner", ["ownerId"])
  },

  queries: {
    viewer: query((ctx) => viewerFor(ctx)),

    entries: query(async (ctx) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return [];
      }

      return (await rowsForOwners(ctx.db.tripEntries, [primaryOwnerIdFor(ctx, viewer)]))
        .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)));
    }),

    vehicleNotes: query(async (ctx) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) return { items: [] };
      const items = (await rowsForOwners(ctx.db.vehicleNotes, [primaryOwnerIdFor(ctx, viewer)]))
        .map((row) => ({
          id: String(row.id ?? ""),
          vehicleNumber: String(row.vehicleNumber ?? ""),
          note: String(row.note ?? ""),
          updatedAt: String(row.updatedAt ?? row.createdAt ?? "")
        }))
        .sort((a, b) => a.vehicleNumber.localeCompare(b.vehicleNumber, undefined, { numeric: true }));
      return { items };
    }),

    settings: query(async (ctx) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) return { defaultLines: DEFAULT_LINES };
      const row = await firstForOwners(ctx.db.userSettings, [primaryOwnerIdFor(ctx, viewer)]);
      return { defaultLines: parseDefaultLines(row?.defaultLines) };
    }),

    transitData: query(async (ctx) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) return null;
      const row = await firstForOwners(ctx.db.transitData, [primaryOwnerIdFor(ctx, viewer)]);
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

      const existing = await entryByClientId(ctx, [primaryOwnerIdFor(ctx, viewer)], prepared.clientEntryId);

      if (existing) {
        await ctx.db.tripEntries.update(existing.id, prepared.row);
        return { ok: true, id: existing.id };
      }

      const inserted = await ctx.db.tripEntries.insert(prepared.row);
      return { ok: true, id: inserted?.id ?? "" };
    }),

    saveVehicleNote: mutation(async (ctx, vehicleNumberValue, noteValue) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) return { ok: false, reason: "unauthorized" };

      const vehicleNumber = normalizeVehicleNumber(vehicleNumberValue);
      if (!isValidVehicleNumber(vehicleNumber)) return { ok: false, reason: "invalid_vehicle_number" };

      const ownerId = primaryOwnerIdFor(ctx, viewer);
      const note = normalizeVehicleNote(noteValue);
      const existing = await vehicleNoteFor(ctx, ownerId, vehicleNumber);

      if (!note) {
        if (existing) await ctx.db.vehicleNotes.delete(existing.id);
        return { ok: true, id: "" };
      }

      if (existing) {
        await ctx.db.vehicleNotes.update(existing.id, { note });
        return { ok: true, id: existing.id };
      }

      const inserted = await ctx.db.vehicleNotes.insert({ ownerId, vehicleNumber, note });
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

    migrateLegacyOwner: mutation(async (ctx) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) return { ok: false, reason: "unauthorized" };

      const fromOwnerId = legacyOwnerIdFor(ctx);
      const toOwnerId = primaryOwnerIdFor(ctx, viewer);
      if (!fromOwnerId || fromOwnerId === toOwnerId) return { ok: true, moved: 0, merged: 0 };

      return { ok: true, ...(await migrateLegacyOwnerRows(ctx, fromOwnerId, toOwnerId)) };
    }),

    migrateDirections: mutation(async (ctx) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return { ok: false, reason: "unauthorized" };
      }

      return { ok: true, updated: await migrateDirectionRows(ctx, [primaryOwnerIdFor(ctx, viewer)]) };
    }),

    deleteEntry: mutation(async (ctx, id) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return { ok: false, reason: "unauthorized" };
      }

      const idOrClientEntryId = String(id ?? "");
      const byId = await ctx.db.tripEntries.get(idOrClientEntryId);
      const entry = byId || await entryByClientId(ctx, [primaryOwnerIdFor(ctx, viewer)], idOrClientEntryId);

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
      const stopIndexPayload = normalizeTransitStopIndexPayload(input?.stopsPayload);
      if (!next || !stopIndexPayload) return { ok: false, reason: "invalid_transit_data" };
      const ownerId = primaryOwnerIdFor(ctx, viewer);
      const existing = await rowsForOwners(ctx.db.transitData, [ownerId]);
      const existingStopIndexes = await rowsForOwners(ctx.db.transitStopIndexes, [ownerId]);
      const pendingDeleteKeys = collectTransitCleanupKeys(existing, [next.metadataKey, next.geometryKey]).map(cleanStorageKey).filter(Boolean);

      for (const row of existing) await ctx.db.transitData.delete(row.id);
      for (const row of existingStopIndexes) await ctx.db.transitStopIndexes.delete(row.id);
      await ctx.db.transitData.insert({ ownerId, ...next, pendingDeleteKeys: JSON.stringify(pendingDeleteKeys) });
      await ctx.db.transitStopIndexes.insert({ ownerId, version: next.version, payload: stopIndexPayload });
      return { ok: true, current: { ...next, cleanupKeys: pendingDeleteKeys } };
    }),

    acknowledgeTransitCleanup: mutation(async (ctx, input) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) return { ok: false, reason: "unauthorized" };
      const ownerId = primaryOwnerIdFor(ctx, viewer);
      const current = await firstForOwners(ctx.db.transitData, [ownerId]);
      const version = cleanBounded(input?.version, 80);
      if (!current || current.version !== version) return { ok: false, reason: "stale_transit_data" };
      const deleted = new Set(parseCleanupKeys(input?.keys).map(cleanStorageKey).filter(Boolean));
      const pendingDeleteKeys = parseCleanupKeys(current.pendingDeleteKeys).filter((key) => !deleted.has(key));
      await ctx.db.transitData.update(current.id, { pendingDeleteKeys: JSON.stringify(pendingDeleteKeys) });
      return { ok: true, cleanupKeys: pendingDeleteKeys };
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
  const allowedUserId = configuredUserId(ctx.env.ALLOWED_USER_ID);
  const identity = {
    isGuest: Boolean(ctx.auth.isGuest),
    provider: String(ctx.auth.provider ?? ""),
    userId: configuredUserId(ctx.auth.userId)
  };

  return {
    isAllowed: isAllowedIdentity(identity, allowedUserId),
    hasAllowedUserId: Boolean(allowedUserId),
    isGuest: identity.isGuest,
    provider: identity.provider,
    userId: identity.userId,
    displayName: String(ctx.auth.displayName ?? ""),
    email: String(ctx.auth.email ?? "").trim().toLowerCase()
  };
}

function primaryOwnerIdFor(_ctx, viewer) {
  return configuredUserId(viewer?.userId);
}

function legacyOwnerIdFor(ctx) {
  return legacyOwnerId(ctx.env.LEGACY_OWNER_EMAIL);
}

function ownerKeyFor(ctx) {
  return configuredUserId(ctx.env.ALLOWED_USER_ID);
}

function ownsRow(ctx, viewer, row) {
  return Boolean(row && String(row.ownerId ?? "") === primaryOwnerIdFor(ctx, viewer));
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

async function migrateLegacyOwnerRows(ctx, fromOwnerId, toOwnerId) {
  let moved = 0;
  let merged = 0;

  for (const entry of await rowsForOwners(ctx.db.tripEntries, [fromOwnerId])) {
    const existing = await ctx.db.tripEntries
      .withIndex("by_owner_client", (q) => q.eq("ownerId", toOwnerId).eq("clientEntryId", entry.clientEntryId))
      .first();
    if (!existing) {
      await ctx.db.tripEntries.update(entry.id, { ownerId: toOwnerId });
      moved += 1;
      continue;
    }

    if (rowTimestamp(entry) > rowTimestamp(existing)) {
      await ctx.db.tripEntries.update(existing.id, { ...rowData(entry), ownerId: toOwnerId });
    }
    await ctx.db.tripEntries.delete(entry.id);
    merged += 1;
  }

  for (const tableRef of [ctx.db.userSettings, ctx.db.transitData, ctx.db.transitStopIndexes]) {
    const result = await migrateSingletonOwner(tableRef, fromOwnerId, toOwnerId);
    moved += result.moved;
    merged += result.merged;
  }

  return { moved, merged };
}

async function migrateSingletonOwner(tableRef, fromOwnerId, toOwnerId) {
  const legacyRows = await rowsForOwners(tableRef, [fromOwnerId]);
  let target = await firstForOwners(tableRef, [toOwnerId]);
  let moved = 0;
  let merged = 0;

  for (const row of legacyRows) {
    if (!target) {
      await tableRef.update(row.id, { ownerId: toOwnerId });
      target = row;
      moved += 1;
      continue;
    }

    if (rowTimestamp(row) > rowTimestamp(target)) {
      await tableRef.update(target.id, { ...rowData(row), ownerId: toOwnerId });
      target = row;
    }
    await tableRef.delete(row.id);
    merged += 1;
  }

  return { moved, merged };
}

function rowData(row) {
  const data = { ...row };
  delete data.id;
  delete data.createdAt;
  delete data.updatedAt;
  return data;
}

function rowTimestamp(row) {
  return String(row?.updatedAt ?? row?.savedAt ?? row?.capturedAt ?? row?.createdAt ?? "");
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

function normalizeTransitStopIndexPayload(value) {
  const payload = String(value ?? "");
  if (!payload || utf8ByteLength(JSON.stringify(payload)) > 65_536) return "";
  try {
    const parsed = JSON.parse(payload);
    if (parsed?.v !== 1 || !Array.isArray(parsed?.s) || !parsed.s.length) return "";
    const ids = new Set();
    for (const stop of parsed.s) {
      const id = String(stop?.[0] ?? "").trim();
      const name = String(stop?.[2] ?? "").trim();
      const lat = Number(stop?.[3]);
      const lon = Number(stop?.[4]);
      if (
        !id ||
        !name ||
        ids.has(id) ||
        !Number.isFinite(lat) ||
        lat < -90 ||
        lat > 90 ||
        !Number.isFinite(lon) ||
        lon < -180 ||
        lon > 180
      ) return "";
      ids.add(id);
    }
    return payload;
  } catch {
    return "";
  }
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
    geometrySize: Number(row.geometrySize ?? 0),
    cleanupKeys: parseCleanupKeys(row.pendingDeleteKeys)
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
    return json({ ok: false, reason: "allowed_user_id_missing" }, jsonOptions(503));
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
    return json({ ok: false, reason: "allowed_user_id_missing", message: "" }, jsonOptions(503));
  }

  const input = await inputFromRequest(req);
  const vehicleNumber = normalizeVehicleNumber(input?.vehicleNumber ?? input?.vehicle ?? input?.number);
  if (!vehicleNumber) {
    return json({ ok: false, reason: "invalid_vehicle_number", message: "" }, jsonOptions(400));
  }

  const entries = await vehicleEntries(ctx, ownerId, vehicleNumber, "");
  const vehicleNote = await vehicleNoteFor(ctx, ownerId, vehicleNumber);
  return json(
    {
      ok: true,
      vehicleNumber,
      message: vehicleHistoryMessage(entries[0]),
      ...vehicleLookupHistory(entries, vehicleNote?.note)
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
    return json({ ok: false, reason: "allowed_user_id_missing", stops: [] }, jsonOptions(503));
  }

  const stopIndex = await firstForOwners(ctx.db.transitStopIndexes, [ownerId]);
  if (!stopIndex?.payload) {
    return json({ ok: true, stops: ["Other"], dataAvailable: false }, jsonOptions(200));
  }

  try {
    const stops = transitStopsFromMetadata(JSON.parse(stopIndex.payload));
    const nearest = nearestTransitStops(location, stops, 5).map((stop) => stop.name);
    return json({ ok: true, stops: [...nearest, "Other"], dataAvailable: Boolean(nearest.length) }, jsonOptions(200));
  } catch {
    return json({ ok: true, stops: ["Other"], dataAvailable: false }, jsonOptions(200));
  }
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

async function vehicleNoteFor(ctx, ownerId, vehicleNumber) {
  return ctx.db.vehicleNotes
    .withIndex("by_owner_vehicle", (q) => q.eq("ownerId", ownerId).eq("vehicleNumber", vehicleNumber))
    .first();
}

async function vehicleEntries(ctx, ownerId, vehicleNumber, excludedClientEntryId) {
  const entries = await ctx.db.tripEntries
    .withIndex("by_owner_vehicle", (q) => q.eq("ownerId", ownerId).eq("vehicleNumber", vehicleNumber))
    .collect();
  return entries
    .filter((entry) => String(entry.clientEntryId ?? "") !== String(excludedClientEntryId ?? ""))
    .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)));
}

async function latestVehicleEntry(ctx, ownerId, vehicleNumber, excludedClientEntryId) {
  return (await vehicleEntries(ctx, ownerId, vehicleNumber, excludedClientEntryId))[0];
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
const CACHE_NAME = "tram-saver-v2";
const CORE_URLS = ["/", "/manifest.webmanifest", "/pwa/icon.svg"];
const STATIC_DESTINATIONS = new Set(["font", "image", "manifest", "script", "style"]);
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
      .then((keys) => Promise.allSettled(keys.filter((key) => key.startsWith("tram-saver-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener(NETWORK_EVENT, (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/storage/") || url.pathname.startsWith("/__lakebed/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      networkRequest(request)
        .then((response) => {
          if (url.search || !response.ok || response.type !== "basic") return response;
          return caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())).then(() => response);
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")).then((response) => response || Response.error()))
    );
    return;
  }

  if (url.search || !STATIC_DESTINATIONS.has(request.destination)) return;
  event.respondWith(
    networkRequest(request)
      .then((response) => {
        if (!response.ok || response.type !== "basic") return response;
        return caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())).then(() => response);
      })
      .catch(() => caches.match(request).then((response) => response || Response.error()))
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
