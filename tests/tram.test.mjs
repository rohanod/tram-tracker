import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildTransitBundle, stageTransitData, TRANSIT_FILES, TRANSIT_SOURCE_DIR } from "../scripts/transit-data-source.mjs";

async function loadSharedModule() {
  const dir = await mkdtemp(join(tmpdir(), "tram-shared-"));
  const root = new URL("../shared/", import.meta.url);
  const corridors = await readFile(new URL("corridors.ts", root), "utf8");
  const tram = await readFile(new URL("tram.ts", root), "utf8");
  await writeFile(join(dir, "corridors.mjs"), corridors);
  await writeFile(join(dir, "tram.mjs"), tram.replace("./corridors", "./corridors.mjs"));
  const [tramModule, corridorModule] = await Promise.all([
    import("file://" + join(dir, "tram.mjs")),
    import("file://" + join(dir, "corridors.mjs"))
  ]);
  return { ...tramModule, setTransitData: corridorModule.setTransitData };
}

async function loadSyncModule() {
  const dir = await mkdtemp(join(tmpdir(), "tram-sync-"));
  const root = new URL("../shared/", import.meta.url);
  const sync = await readFile(new URL("sync.ts", root), "utf8");
  await writeFile(join(dir, "sync.mjs"), sync);
  return import("file://" + join(dir, "sync.mjs"));
}

async function loadReviewModule() {
  const dir = await mkdtemp(join(tmpdir(), "tram-review-"));
  const root = new URL("../shared/", import.meta.url);
  const review = await readFile(new URL("review.ts", root), "utf8");
  await writeFile(join(dir, "review.mjs"), review);
  return import("file://" + join(dir, "review.mjs"));
}

async function loadRouteStateModule() {
  const dir = await mkdtemp(join(tmpdir(), "tram-route-state-"));
  const root = new URL("../shared/", import.meta.url);
  const routeState = await readFile(new URL("route-state.ts", root), "utf8");
  await writeFile(join(dir, "route-state.mjs"), routeState);
  return import("file://" + join(dir, "route-state.mjs"));
}

async function loadAuthModule() {
  const dir = await mkdtemp(join(tmpdir(), "tram-auth-"));
  const auth = await readFile(new URL("../shared/auth.ts", import.meta.url), "utf8");
  await writeFile(join(dir, "auth.mjs"), auth);
  return import("file://" + join(dir, "auth.mjs"));
}

test("auth uses immutable identity and offline cache only while offline", async () => {
  const { canUseTracker, configuredUserId, isAllowedIdentity, legacyOwnerId } = await loadAuthModule();

  assert.equal(configuredUserId(" google:123 "), "google:123");
  assert.equal(legacyOwnerId(" Rohan@Example.com "), "allowed:rohan@example.com");
  assert.equal(isAllowedIdentity({ userId: "google:123", provider: "google", isGuest: false }, "google:123"), true);
  assert.equal(isAllowedIdentity({ userId: "google:123", provider: "google", isGuest: true }, "google:123"), false);
  assert.equal(isAllowedIdentity({ userId: "google:other", provider: "google", isGuest: false }, "google:123"), false);
  assert.equal(canUseTracker({ isLocalGuest: false, isAllowed: false, isOnline: true, priorAuthorized: true, cachedAccessAllowed: true }), false);
  assert.equal(canUseTracker({ isLocalGuest: false, isAllowed: false, isOnline: false, priorAuthorized: true, cachedAccessAllowed: true }), true);
});

test("vehicle notes trim and enforce the shared length limit", async () => {
  const { normalizeVehicleNote, VEHICLE_NOTE_MAX_LENGTH } = await loadSharedModule();

  assert.equal(VEHICLE_NOTE_MAX_LENGTH, 2000);
  assert.equal(normalizeVehicleNote("  Needs inspection  "), "Needs inspection");
  assert.equal(normalizeVehicleNote("   "), "");
  assert.equal(normalizeVehicleNote("a".repeat(2001)).length, 2000);
});

test("vehicle numbers and directions normalize", async () => {
  const { cleanVehicleNumber, directionOptionsForLine, headsignForLineAndLeg, isValidVehicleNumber, legLabelForLine, normalizeDirection, normalizeLine, normalizeObservationType, vehicleHistoryMessage } = await loadSharedModule();

  assert.equal(cleanVehicleNumber(" 867 "), "867");
  assert.equal(cleanVehicleNumber("1205"), "1205");
  assert.equal(isValidVehicleNumber("12"), false);
  assert.equal(isValidVehicleNumber("12345"), false);
  assert.equal(isValidVehicleNumber("12a"), false);
  assert.equal(normalizeObservationType("seen"), "seen");
  assert.equal(normalizeObservationType("unknown"), "been_on");
  assert.equal(normalizeLine("29"), "29");
  assert.equal(normalizeLine("01"), "1");
  assert.equal(normalizeLine("e+"), "E+");
  assert.equal(normalizeLine("too-long-line"), "unclassified");
  assert.equal(vehicleHistoryMessage(null), "");
  assert.deepEqual(directionOptionsForLine("14"), ["unclassified", "Bernex, Vailly", "Meyrin, Gravière"]);
  assert.equal(headsignForLineAndLeg("14", "from_home"), "Bernex, Vailly");
  assert.equal(headsignForLineAndLeg("18", "from_home"), "Grand-Lancy, Palettes");
  assert.equal(headsignForLineAndLeg("17", "to_school"), "Annemasse, Parc Montessuit");
  assert.equal(headsignForLineAndLeg("12", "from_school"), "Lancy-Bachet, Gare");
  assert.equal(headsignForLineAndLeg("14", "to_home"), "Meyrin, Gravière");
  assert.equal(normalizeDirection("from_home", "14"), "Bernex, Vailly");
  assert.equal(normalizeDirection("Lancy-Bachet, gare", "12"), "Lancy-Bachet, Gare");
  assert.equal(normalizeDirection("To CERN", "18"), "CERN");
  assert.equal(legLabelForLine("14", "from_home"), "To Bernex, Vailly");
  assert.equal(vehicleHistoryMessage({ savedLine: "14", savedLeg: "from_home", observationType: "seen", capturedAt: "2026-06-17T06:30:00.000Z" }), "Seen before: 17 Jun 2026 at 08:30, Line 14, To Bernex, Vailly.");
  assert.equal(vehicleHistoryMessage({ savedLine: "18", direction: "Grand-Lancy, Palettes", observationType: "been_on", capturedAt: "2026-06-17T14:45:00.000Z" }), "Been on before: 17 Jun 2026 at 16:45, Line 18, To Grand-Lancy, Palettes.");
});

test("vehicle lookup history lists every instance with counts and details", async () => {
  const { vehicleLookupHistory } = await loadSharedModule();
  const history = vehicleLookupHistory([
    {
      capturedAt: "2026-06-17T06:30:00.000Z",
      observationType: "seen",
      savedLine: "14",
      savedLeg: "from_home",
      nearestStopName: "Genève, Cornavin",
      lat: "46.2100",
      lon: "6.1420",
      distanceMeters: "18"
    },
    {
      capturedAt: "2026-06-18T14:45:00.000Z",
      observationType: "been_on",
      savedLine: "18",
      savedLeg: "Grand-Lancy, Palettes",
      nearestStopName: "Genève, Bel-Air"
    },
    {
      capturedAt: "2026-06-16T10:00:00.000Z",
      observationType: "seen",
      savedLine: "12",
      savedLeg: "unclassified",
      nearestStopName: ""
    }
  ]);

  assert.equal(history.summary, "R:1 | S:2 | T:3");
  assert.deepEqual(history.entries, [
    "18 Jun 2026 at 16:45 — Been on",
    "17 Jun 2026 at 08:30 — Seen",
    "16 Jun 2026 at 12:00 — Seen"
  ]);
  assert.equal(
    history.details["17 Jun 2026 at 08:30 — Seen"],
    "Seen\n17 Jun 2026 at 08:30\nLine 14\nTo Bernex, Vailly\nNearest stop: Genève, Cornavin\nCoordinates: 46.2100, 6.1420\nDistance to route: 18 m"
  );

  const withNote = vehicleLookupHistory([{ capturedAt: "2026-06-17T06:30:00.000Z", observationType: "seen", savedLine: "14" }], "  Watch the rear door alignment.  ");
  assert.match(withNote.details[withNote.entries[0]], /Vehicle note: Watch the rear door alignment\.$/);
});

test("vehicle lookup history keeps same-minute instances selectable", async () => {
  const { vehicleLookupHistory } = await loadSharedModule();
  const history = vehicleLookupHistory([
    { capturedAt: "2026-06-17T06:30:10.000Z", observationType: "seen", savedLine: "14", nearestStopName: "First" },
    { capturedAt: "2026-06-17T06:30:40.000Z", observationType: "seen", savedLine: "14", nearestStopName: "Second" }
  ]);

  assert.deepEqual(history.entries, [
    "17 Jun 2026 at 08:30 — Seen",
    "17 Jun 2026 at 08:30 — Seen (2)"
  ]);
  assert.match(history.details[history.entries[0]], /Nearest stop: Second/);
  assert.match(history.details[history.entries[1]], /Nearest stop: First/);
});

test("runtime transit data classifies one line and keeps overlaps manual", async () => {
  const { classifyCapture, MATCH_RADIUS_METERS, STOP_MATCH_RADIUS_METERS, setTransitData } = await loadSharedModule();
  const stop = { name: "Genève, Test", lat: 46.2, lon: 6.14 };
  const line5 = { id: "line_5", label: "Line 5", line: "5", routeGroup: "line_5", points: [stop, { ...stop, lon: 6.15 }], paths: [] };
  setTransitData([line5], [stop]);
  assert.equal(MATCH_RADIUS_METERS, 250);
  assert.equal(STOP_MATCH_RADIUS_METERS, 10);
  const exact = classifyCapture({ lat: 46.2, lon: 6.14 }, "2026-06-11T07:30:00.000Z");
  assert.equal(exact.status, "matched");
  assert.equal(exact.suggestedLine, "5");
  assert.equal(exact.nearestStopName, "Genève, Test");
  assert.equal(classifyCapture({ lat: 46.2, lon: 6.1401 }, "2026-06-11T07:30:00.000Z").nearestStopName, "Genève, Test");
  const outsideStopRadius = classifyCapture({ lat: 46.2, lon: 6.1402 }, "2026-06-11T07:30:00.000Z");
  assert.equal(outsideStopRadius.status, "matched");
  assert.equal(outsideStopRadius.nearestStopName, "");
  assert.equal(classifyCapture({ lat: 46.2, lon: 6.14 }, "2026-06-11T07:30:00.000Z", false).nearestStopName, "");

  setTransitData([line5, { ...line5, id: "line_A", line: "A", routeGroup: "line_A" }], [stop]);
  const overlap = classifyCapture({ lat: 46.2, lon: 6.14 }, "2026-06-11T07:30:00.000Z");
  assert.equal(overlap.status, "ambiguous");
  assert.deepEqual(overlap.matchingLines, ["5", "A"]);
  assert.equal(classifyCapture({ lat: 46.5, lon: 6.5 }, "2026-06-11T07:30:00.000Z").status, "outside_geneva");
});

test("nearest transit stops support compact and raw metadata without duplicate names", async () => {
  const { nearestTransitStops, transitStopsFromMetadata } = await loadSharedModule();
  const compactStops = transitStopsFromMetadata({
    v: 1,
    stops: [
      { n: "Genève, Near", a: 46.2, o: 6.14 },
      { n: "Genève, Near", a: 46.20001, o: 6.14001 },
      { n: "Genève, Far", a: 46.21, o: 6.15 }
    ],
    lines: []
  });
  const rawStops = transitStopsFromMetadata({
    lines: [{
      directions: [{
        stops: [
          { name: "Genève, Raw", lat: 46.201, lon: 6.141 },
          { name: "Genève, Invalid", lat: "no", lon: 6.141 }
        ]
      }]
    }]
  });
  const stopIndex = transitStopsFromMetadata({
    v: 1,
    s: [
      ["ch:1:sloid:1", "8510001", "Genève, Indexed", 46.202, 6.142],
      ["broken"]
    ]
  });

  assert.deepEqual(compactStops.map((stop) => stop.name), ["Genève, Near", "Genève, Near", "Genève, Far"]);
  assert.deepEqual(rawStops.map((stop) => stop.name), ["Genève, Raw"]);
  assert.deepEqual(stopIndex.map((stop) => stop.name), ["Genève, Indexed"]);
  assert.deepEqual(
    nearestTransitStops({ lat: 46.2, lon: 6.14 }, compactStops, 5).map((stop) => stop.name),
    ["Genève, Near", "Genève, Far"]
  );
});

test("local TPG line data contains the full mixed-mode catalog", async () => {
  const metadata = JSON.parse(await readFile(join(TRANSIT_SOURCE_DIR, TRANSIT_FILES.metadata), "utf8"));
  const types = new Set(metadata.lines.map((line) => line.vehicle));
  assert.equal(metadata.lines.length, 78);
  assert.equal(metadata.lines.reduce((count, line) => count + line.directions.length, 0), 156);
  assert.ok(types.has("BUS"));
  assert.ok(types.has("TRAM"));
  assert.ok(types.has("TROLLEY"));
  assert.ok(metadata.lines.some((line) => line.number === "A"));
  assert.ok(metadata.lines.every((line) => /^#[0-9A-F]{6}$/i.test(line.colour) && line.directions.length));
});

test("server not_found means a pending delete is already settled", async () => {
  const { isDeleteSettledResult } = await loadSyncModule();

  assert.equal(isDeleteSettledResult({ ok: true }), true);
  assert.equal(isDeleteSettledResult({ ok: false, reason: "not_found" }), true);
  assert.equal(isDeleteSettledResult({ ok: false, reason: "unauthorized" }), false);
});

test("transit cleanup keeps stale keys and never deletes active files", async () => {
  const { collectTransitCleanupKeys, parseCleanupKeys } = await loadSyncModule();
  const rows = [
    { metadataKey: "public/old-meta", geometryKey: "public/old-geometry", pendingDeleteKeys: '["public/retry","public/old-meta"]' },
    { metadataKey: "public/current-meta", geometryKey: "public/other-geometry", pendingDeleteKeys: "invalid" },
    { metadataKey: "public/current-meta", geometryKey: "public/current-geometry", pendingDeleteKeys: '["public/current-geometry"]' }
  ];

  assert.deepEqual(collectTransitCleanupKeys(rows, ["public/current-meta", "public/current-geometry"], ["public/recovered", "public/current-meta"]), [
    "public/recovered",
    "public/retry",
    "public/old-meta",
    "public/old-geometry",
    "public/other-geometry"
  ]);
  assert.deepEqual(parseCleanupKeys('["public/a","public/a"," public/b "]'), ["public/a", "public/b"]);
  assert.deepEqual(parseCleanupKeys("not-json"), []);
});

test("compact stop payload fits inside the activation frame budget", async () => {
  const { utf8ByteLength } = await loadSyncModule();
  const source = JSON.parse(await readFile(join(TRANSIT_SOURCE_DIR, TRANSIT_FILES.stops), "utf8"));
  const stopsPayload = JSON.stringify({ stops: source.s.map((stop) => ({ n: stop[2], a: stop[3], o: stop[4] })) });
  const key = "public/" + "x".repeat(64);
  const input = {
    version: "v".repeat(80),
    metadataKey: key,
    metadataUrl: "https://rapid-signal-1f4a040df6.lakebed.app/storage/" + key,
    metadataSize: 5 * 1024 * 1024,
    geometryKey: key,
    geometryUrl: "https://rapid-signal-1f4a040df6.lakebed.app/storage/" + key,
    geometrySize: 5 * 1024 * 1024,
    stopsPayload,
    supersededKeys: Array.from({ length: 24 }, (_, index) => `public/${index}-${"x".repeat(64)}`)
  };
  const frame = JSON.stringify({ id: 1, op: "mutation.run", name: "activateTransitData", args: [input] });

  assert.equal(utf8ByteLength("é"), 2);
  assert.ok(utf8ByteLength(stopsPayload) < 50 * 1024);
  assert.ok(utf8ByteLength(frame) < 60 * 1024);
});

test("cached transit payloads use the runtime validator", async () => {
  const source = await readFile(new URL("../client/transit-data.ts", import.meta.url), "utf8");

  assert.match(source, /validateTransitPayloads\(cached\.metadata, cached\.geometry\)/);
  assert.doesNotMatch(source, /\bvalidatePayload\(/);
});

test("canonical transit source validates and stages exactly three files", async () => {
  const first = await buildTransitBundle();
  const second = await buildTransitBundle();
  const directionIds = new Set(first.metadata.lines.flatMap((line) => line.d.map((direction) => direction.i)));
  const geometryIds = new Set(first.geometry.features.map((feature) => feature.i));
  const stage = await mkdtemp(join(tmpdir(), "tram-transit-stage-"));
  await stageTransitData(stage, { fullClientData: true });

  assert.equal(TRANSIT_SOURCE_DIR, "/Users/rohan/Documents/tpg-line-data/out-data");
  assert.deepEqual(Object.values(TRANSIT_FILES), ["tpg-lines.info.json", "tpg-routes.polyline.json", "tpg-stops.compact.json"]);
  assert.equal(Object.values(TRANSIT_FILES).some((name) => name.endsWith(".geojson")), false);
  assert.equal(first.version, second.version);
  assert.equal(first.metadata.lines.length, 78);
  assert.equal(directionIds.size, 156);
  assert.equal(geometryIds.size, 156);
  assert.deepEqual(geometryIds, directionIds);
  assert.equal(first.stops.s.length, 843);
  assert.deepEqual((await readdir(join(stage, "storage-data"))).sort(), Object.values(TRANSIT_FILES).sort());
});

test("production transit uses Storage and keeps bundled Shortcut stops as fallback", async () => {
  const [serverSource, uploadSource] = await Promise.all([
    readFile(new URL("../server/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../client/upload-data.tsx", import.meta.url), "utf8")
  ]);

  assert.doesNotMatch(serverSource, /TRANSIT_DATA_GZIP_BASE64|path: "\/api\/transit-data"/);
  assert.match(serverSource, /ctx\.db\.transitStopIndexes/);
  assert.match(serverSource, /BUNDLED_TRANSIT_STOPS/);
  assert.match(uploadSource, /tpg-lines\.info\.json/);
  assert.match(uploadSource, /tpg-routes\.polyline\.json/);
  assert.match(uploadSource, /tpg-stops\.compact\.json/);
  assert.doesNotMatch(uploadSource, /\.geojson/);
});

test("recent Trip Entries returns only the two newest captures", async () => {
  const { recentTripEntries } = await loadReviewModule();
  const entries = [
    { clientEntryId: "old", capturedAt: "2026-06-17T06:00:00.000Z" },
    { clientEntryId: "newest", capturedAt: "2026-06-17T08:00:00.000Z" },
    { clientEntryId: "middle", capturedAt: "2026-06-17T07:00:00.000Z" }
  ];

  assert.deepEqual(recentTripEntries(entries, 2).map((entry) => entry.clientEntryId), ["newest", "middle"]);
});

test("review filters combine live query line type and date", async () => {
  const { filterReviewEntries } = await loadReviewModule();
  const entries = [
    { clientEntryId: "match", savedAt: "2026-06-17T08:00:00.000Z", savedLeg: "Airport", savedLine: "5", observationType: "seen", vehicleNumber: "867", nearestStopName: "Cornavin" },
    { clientEntryId: "wrong-type", savedAt: "2026-06-17T07:00:00.000Z", savedLeg: "Airport", savedLine: "5", observationType: "been_on", vehicleNumber: "867", nearestStopName: "Cornavin" },
    { clientEntryId: "wrong-line", savedAt: "2026-06-17T06:00:00.000Z", savedLeg: "Airport", savedLine: "10", observationType: "seen", vehicleNumber: "867", nearestStopName: "Cornavin" },
    { clientEntryId: "wrong-date", savedAt: "2026-06-16T06:00:00.000Z", savedLeg: "Airport", savedLine: "5", observationType: "seen", vehicleNumber: "867", nearestStopName: "Cornavin" }
  ];

  assert.deepEqual(
    filterReviewEntries(entries, { query: "cornavin", line: "5", type: "seen", dateFrom: "2026-06-17", dateTo: "2026-06-17" }).map((entry) => entry.clientEntryId),
    ["match"]
  );
});

test("review pagination clamps pages and slices entries", async () => {
  const { paginateReviewEntries } = await loadReviewModule();
  const entries = Array.from({ length: 23 }, (_, index) => ({ clientEntryId: String(index + 1) }));

  assert.deepEqual(paginateReviewEntries(entries, 2, 10).entries.map((entry) => entry.clientEntryId), ["11", "12", "13", "14", "15", "16", "17", "18", "19", "20"]);
  assert.equal(paginateReviewEntries(entries, 99, 10).currentPage, 3);
  assert.equal(paginateReviewEntries([], 99, 10).currentPage, 1);
});

test("vehicle frequency stats use recent saves to break ties", async () => {
  const { vehicleFrequencyStats } = await loadReviewModule();
  const stats = vehicleFrequencyStats([
    { vehicleNumber: "1811", savedAt: "2026-06-17T08:00:00.000Z" },
    { vehicleNumber: "1811", savedAt: "2026-06-17T09:00:00.000Z" },
    { vehicleNumber: "1803", savedAt: "2026-06-17T10:00:00.000Z" },
    { vehicleNumber: "1803", savedAt: "2026-06-17T11:00:00.000Z" },
    { vehicleNumber: "2045", savedAt: "2026-06-17T12:00:00.000Z" },
    { vehicleNumber: "1832", savedAt: "2026-06-17T13:00:00.000Z" }
  ]);

  assert.deepEqual(stats.most, { vehicleNumber: "1803", count: 2, latest: "2026-06-17T11:00:00.000Z" });
  assert.deepEqual(stats.least, { vehicleNumber: "1832", count: 1, latest: "2026-06-17T13:00:00.000Z" });
});

test("route state maps hash routes to app pages", async () => {
  const { appPageFromHash, hashForAppPage } = await loadRouteStateModule();

  assert.equal(appPageFromHash("#/saves"), "saves");
  assert.equal(appPageFromHash("#/unknown"), "saver");
  assert.equal(hashForAppPage("saves"), "#/saves");
  assert.equal(hashForAppPage("saver"), "#/");
});
