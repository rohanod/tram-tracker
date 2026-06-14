import { capsule, endpoint, mutation, query, string, table, text } from "lakebed/server";

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
    }),
    featureIdeas: table({
      clientIdeaId: string(),
      body: string(),
      capturedAt: string(),
      savedAt: string(),
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

      return ctx.db.tripEntries
        .where("ownerId", viewer.userId)
        .orderBy("capturedAt", "desc")
        .limit(80)
        .all();
    }),

    featureIdeas: query((ctx) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return [];
      }

      return ctx.db.featureIdeas
        .where("ownerId", viewer.userId)
        .orderBy("capturedAt", "desc")
        .limit(40)
        .all();
    })
  },

  mutations: {
    saveEntry: mutation((ctx, input) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return { ok: false, reason: "unauthorized" };
      }

      const vehicleNumber = normalizeVehicleNumber(input?.vehicleNumber);
      if (!isValidVehicleNumber(vehicleNumber)) {
        return { ok: false, reason: "invalid_vehicle_number" };
      }

      const clientEntryId = cleanBounded(input?.clientEntryId, 80);
      if (!clientEntryId) {
        return { ok: false, reason: "missing_client_entry_id" };
      }

      const capturedAt = normalizeIsoDate(input?.capturedAt);
      const savedAt = normalizeIsoDate(input?.savedAt || input?.capturedAt);
      const location = locationFromInput(input);
      const locationStatus = cleanBounded(input?.locationStatus, 48) || (location ? "captured" : "unavailable");
      const inferredLeg = normalizeLeg(input?.inferredLeg);
      const savedLeg = normalizeLeg(input?.savedLeg || inferredLeg);
      const inferredLine = normalizeLine(input?.inferredLine);
      const savedLine = normalizeLine(input?.savedLine || inferredLine);
      const row = {
        clientEntryId,
        vehicleNumber,
        observationType: normalizeObservationType(input?.observationType),
        capturedAt,
        savedAt,
        lat: location ? roundCoordinate(location.lat) : "",
        lon: location ? roundCoordinate(location.lon) : "",
        locationStatus,
        classificationStatus: cleanBounded(input?.classificationStatus, 48) || "unclassified",
        inferredLeg,
        savedLeg,
        inferredLine,
        savedLine,
        routeGroup: cleanBounded(input?.routeGroup, 48) || "none",
        distanceMeters: cleanBounded(input?.distanceMeters, 24),
        nearestStopName: cleanBounded(input?.nearestStopName, 120),
        ownerId: viewer.userId
      };

      const existing = ctx.db.tripEntries
        .where("clientEntryId", clientEntryId)
        .all()
        .find((entry) => entry.ownerId === viewer.userId);

      if (existing) {
        ctx.db.tripEntries.update(existing.id, row);
        return { ok: true, id: existing.id };
      }

      const inserted = ctx.db.tripEntries.insert(row);
      return { ok: true, id: inserted?.id ?? "" };
    }),

    saveFeatureIdea: mutation((ctx, input) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return { ok: false, reason: "unauthorized" };
      }

      const clientIdeaId = cleanBounded(input?.clientIdeaId, 80);
      if (!clientIdeaId) {
        return { ok: false, reason: "missing_client_idea_id" };
      }

      const body = cleanBounded(input?.body, 1000);
      if (!body) {
        return { ok: false, reason: "missing_idea" };
      }

      const capturedAt = normalizeIsoDate(input?.capturedAt);
      const savedAt = normalizeIsoDate(input?.savedAt || input?.capturedAt);
      const row = {
        clientIdeaId,
        body,
        capturedAt,
        savedAt,
        ownerId: viewer.userId
      };

      const existing = ctx.db.featureIdeas
        .where("clientIdeaId", clientIdeaId)
        .all()
        .find((idea) => idea.ownerId === viewer.userId);

      if (existing) {
        ctx.db.featureIdeas.update(existing.id, row);
        return { ok: true, id: existing.id };
      }

      const inserted = ctx.db.featureIdeas.insert(row);
      return { ok: true, id: inserted?.id ?? "" };
    }),

    updateEntryLeg: mutation((ctx, id, leg) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return { ok: false, reason: "unauthorized" };
      }

      const entry = ctx.db.tripEntries.get(String(id ?? ""));
      if (!entry || entry.ownerId !== viewer.userId) {
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
      if (!entry || entry.ownerId !== viewer.userId) {
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
          .find((candidate) => candidate.ownerId === viewer.userId);

      if (!entry || entry.ownerId !== viewer.userId) {
        return { ok: false, reason: "not_found" };
      }

      ctx.db.tripEntries.delete(entry.id);
      return { ok: true, id: entry.id };
    }),

    deleteFeatureIdea: mutation((ctx, id) => {
      const viewer = viewerFor(ctx);
      if (!viewer.isAllowed) {
        return { ok: false, reason: "unauthorized" };
      }

      const idOrClientIdeaId = String(id ?? "");
      const idea =
        ctx.db.featureIdeas.get(idOrClientIdeaId) ||
        ctx.db.featureIdeas
          .where("clientIdeaId", idOrClientIdeaId)
          .all()
          .find((candidate) => candidate.ownerId === viewer.userId);

      if (!idea || idea.ownerId !== viewer.userId) {
        return { ok: false, reason: "not_found" };
      }

      ctx.db.featureIdeas.delete(idea.id);
      return { ok: true, id: idea.id };
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
    )
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

function cleanBounded(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanVehicleNumber(value) {
  return String(value ?? "").trim();
}

function isValidVehicleNumber(value) {
  return /^\d{3,4}$/.test(cleanVehicleNumber(value));
}

function normalizeVehicleNumber(value) {
  const clean = cleanVehicleNumber(value);
  return isValidVehicleNumber(clean) ? clean : "";
}

function normalizeLeg(value) {
  const leg = String(value ?? "").trim();
  return leg === "from_home" || leg === "to_school" || leg === "from_school" || leg === "to_home" ? leg : "unclassified";
}

function normalizeLine(value) {
  const line = String(value ?? "").trim();
  return line === "12" || line === "14" || line === "17" || line === "18" ? line : "unclassified";
}

function normalizeObservationType(value) {
  const observationType = String(value ?? "").trim();
  return observationType === "seen" ? "seen" : "been_on";
}

function roundCoordinate(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }

  return (Math.round(value * 10000) / 10000).toFixed(4);
}

function normalizeIsoDate(value) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function locationFromInput(input) {
  const lat = Number(input?.lat);
  const lon = Number(input?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon };
}

const MANIFEST = {
  name: "Tram Vehicle Saver",
  short_name: "Tram Saver",
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
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Tram Saver">
  <rect width="512" height="512" rx="96" fill="#ffffff"/>
  <rect x="80" y="96" width="352" height="280" rx="44" fill="#eef3fb" stroke="#4367a1" stroke-width="18"/>
  <path d="M144 190h224M146 266h220" stroke="#4367a1" stroke-width="28" stroke-linecap="round"/>
  <circle cx="176" cy="394" r="30" fill="#4367a1"/>
  <circle cx="336" cy="394" r="30" fill="#4367a1"/>
  <path d="M176 64h160" stroke="#4367a1" stroke-width="22" stroke-linecap="round"/>
</svg>
`;
