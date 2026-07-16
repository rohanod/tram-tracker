import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

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

test("generated transit metadata contains the full mixed-mode catalog", async () => {
  const metadata = JSON.parse(await readFile(new URL("../storage-data/transit-metadata.json", import.meta.url), "utf8"));
  const types = new Set(metadata.lines.map((line) => line.t));
  assert.equal(metadata.lines.length, 78);
  assert.equal(metadata.lines.reduce((count, line) => count + line.d.length, 0), 156);
  assert.ok(types.has("BUS"));
  assert.ok(types.has("TRAM"));
  assert.ok(types.has("TROLLEY"));
  assert.ok(metadata.lines.some((line) => line.l === "A"));
  assert.ok(metadata.lines.every((line) => /^#[0-9A-F]{6}$/i.test(line.c) && line.d.length));
});

test("server not_found means a pending delete is already settled", async () => {
  const { isDeleteSettledResult } = await loadSyncModule();

  assert.equal(isDeleteSettledResult({ ok: true }), true);
  assert.equal(isDeleteSettledResult({ ok: false, reason: "not_found" }), true);
  assert.equal(isDeleteSettledResult({ ok: false, reason: "unauthorized" }), false);
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

test("route state maps hash routes to app pages", async () => {
  const { appPageFromHash, hashForAppPage } = await loadRouteStateModule();

  assert.equal(appPageFromHash("#/saves"), "saves");
  assert.equal(appPageFromHash("#/unknown"), "saver");
  assert.equal(hashForAppPage("saves"), "#/saves");
  assert.equal(hashForAppPage("saver"), "#/");
});
