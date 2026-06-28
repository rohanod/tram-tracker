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
  return import("file://" + join(dir, "tram.mjs"));
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

test("vehicle numbers must be 3 or 4 digits", async () => {
  const { cleanVehicleNumber, isValidVehicleNumber, normalizeLine, normalizeObservationType, vehicleHistoryMessage } = await loadSharedModule();

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
  assert.equal(vehicleHistoryMessage({ savedLine: "14", savedLeg: "from_home", observationType: "seen" }), "Seen before: Line 14, From home.");
  assert.equal(vehicleHistoryMessage({ savedLine: "14", savedLeg: "from_home", observationType: "been_on" }), "Been on before: Line 14, From home.");
});

test("route classification applies Geneva noon rules", async () => {
  const { classifyCapture } = await loadSharedModule();

  const homeBefore = classifyCapture({ lat: 46.22204, lon: 6.097272 }, "2026-06-11T07:30:00.000Z");
  assert.equal(homeBefore.suggestedLeg, "from_home");
  assert.equal(homeBefore.routeGroup, "home_14_18");
  assert.equal(homeBefore.suggestedLine, "unclassified");
  assert.deepEqual([...homeBefore.matchingLines].sort(), ["14", "18"]);

  const homeAfter = classifyCapture({ lat: 46.22204, lon: 6.097272 }, "2026-06-11T12:30:00.000Z");
  assert.equal(homeAfter.suggestedLeg, "to_home");

  const schoolBefore = classifyCapture({ lat: 46.199524, lon: 6.17492 }, "2026-06-11T07:30:00.000Z");
  assert.equal(schoolBefore.suggestedLeg, "to_school");
  assert.equal(schoolBefore.routeGroup, "school_12_17");
  assert.equal(schoolBefore.suggestedLine, "unclassified");
  assert.deepEqual([...schoolBefore.matchingLines].sort(), ["12", "17"]);

  const schoolAfter = classifyCapture({ lat: 46.199524, lon: 6.17492 }, "2026-06-11T12:30:00.000Z");
  assert.equal(schoolAfter.suggestedLeg, "from_school");
});

test("weekend captures keep the normal route and time defaults", async () => {
  const { classifyCapture, legValuesForCapturedAt } = await loadSharedModule();

  const saturday = classifyCapture({ lat: 46.22204, lon: 6.097272 }, "2026-06-13T07:30:00.000Z");
  assert.equal(saturday.routeGroup, "home_14_18");
  assert.equal(saturday.suggestedLeg, "from_home");
  assert.deepEqual(legValuesForCapturedAt("2026-06-13T07:30:00.000Z"), ["unclassified", "from_home", "to_school"]);
});

test("line classification is exact only when one configured line matches", async () => {
  const { classifyCapture } = await loadSharedModule();

  const jonction = classifyCapture({ lat: 46.200687, lon: 6.129466 }, "2026-06-11T07:30:00.000Z");
  assert.equal(jonction.status, "matched");
  assert.equal(jonction.suggestedLeg, "from_home");
  assert.equal(jonction.suggestedLine, "14");
  assert.equal(jonction.routeGroup, "home_14_18");
});

test("classification stays manual when corridors overlap or location is far away", async () => {
  const { classifyCapture } = await loadSharedModule();

  const overlap = classifyCapture({ lat: 46.204251, lon: 6.143305 }, "2026-06-11T07:30:00.000Z");
  assert.equal(overlap.status, "ambiguous");
  assert.equal(overlap.suggestedLeg, "unclassified");

  const far = classifyCapture({ lat: 46.5, lon: 6.5 }, "2026-06-11T07:30:00.000Z");
  assert.equal(far.status, "outside_geneva");
  assert.equal(far.suggestedLeg, "unclassified");
});

test("route geometry and stop points within 250m match", async () => {
  const { classifyCapture, MATCH_RADIUS_METERS } = await loadSharedModule();

  assert.equal(MATCH_RADIUS_METERS, 250);

  const onRoute = classifyCapture({ lat: 46.19995, lon: 6.1723 }, "2026-06-12T05:45:00.000Z");
  assert.equal(onRoute.status, "ambiguous");
  assert.equal(onRoute.routeGroup, "school_12_17");
  assert.equal(onRoute.nearestStopName, "Chêne-Bougeries, Grange-Canal");
  assert.equal(onRoute.suggestedLeg, "to_school");
  assert.equal(onRoute.suggestedLine, "unclassified");
  assert.deepEqual([...onRoute.matchingLines].sort(), ["12", "17"]);

  const nearStopOnly = classifyCapture({ lat: 46.1981, lon: 6.1721 }, "2026-06-12T05:45:00.000Z");
  assert.equal(nearStopOnly.status, "ambiguous");
  assert.equal(nearStopOnly.routeGroup, "school_12_17");
  assert.equal(nearStopOnly.nearestStopName, "Chêne-Bougeries, Grange-Canal");
  assert.equal(nearStopOnly.suggestedLeg, "to_school");
});

test("blandonnet-adjacent points inside 250m are allowed", async () => {
  const { classifyCapture } = await loadSharedModule();

  const detected = classifyCapture({ lat: 46.2183, lon: 6.1172 }, "2026-06-12T05:45:00.000Z");
  assert.equal(detected.status, "ambiguous");
  assert.equal(detected.routeGroup, "home_14_18");
  assert.equal(detected.suggestedLeg, "from_home");
  assert.ok(Number(detected.distanceMeters) <= 250);
  assert.deepEqual([...detected.matchingLines].sort(), ["14", "18"]);
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

test("review Leg filters group home and school Trip Entries", async () => {
  const { filterReviewEntries } = await loadReviewModule();
  const entries = [
    { clientEntryId: "from-home", capturedAt: "2026-06-17T08:00:00.000Z", savedLeg: "from_home" },
    { clientEntryId: "to-home", capturedAt: "2026-06-17T07:00:00.000Z", savedLeg: "to_home" },
    { clientEntryId: "to-school", capturedAt: "2026-06-17T06:00:00.000Z", savedLeg: "to_school" },
    { clientEntryId: "from-school", capturedAt: "2026-06-17T05:00:00.000Z", savedLeg: "from_school" },
    { clientEntryId: "no-leg", capturedAt: "2026-06-17T04:00:00.000Z", savedLeg: "unclassified" }
  ];

  assert.deepEqual(filterReviewEntries(entries, { leg: "home" }).map((entry) => entry.clientEntryId), ["from-home", "to-home"]);
  assert.deepEqual(filterReviewEntries(entries, { leg: "school" }).map((entry) => entry.clientEntryId), ["to-school", "from-school"]);
  assert.deepEqual(filterReviewEntries(entries, { leg: "no_leg" }).map((entry) => entry.clientEntryId), ["no-leg"]);
});

test("review filters combine line type and vehicle number", async () => {
  const { filterReviewEntries } = await loadReviewModule();
  const entries = [
    { clientEntryId: "match-new", capturedAt: "2026-06-17T08:00:00.000Z", savedLeg: "from_home", savedLine: "14", observationType: "been_on", vehicleNumber: "867" },
    { clientEntryId: "wrong-type", capturedAt: "2026-06-17T07:00:00.000Z", savedLeg: "from_home", savedLine: "14", observationType: "seen", vehicleNumber: "867" },
    { clientEntryId: "wrong-line", capturedAt: "2026-06-17T06:00:00.000Z", savedLeg: "from_home", savedLine: "18", observationType: "been_on", vehicleNumber: "867" },
    { clientEntryId: "wrong-vehicle", capturedAt: "2026-06-17T05:00:00.000Z", savedLeg: "from_home", savedLine: "14", observationType: "been_on", vehicleNumber: "432" },
    { clientEntryId: "match-old", capturedAt: "2026-06-17T04:00:00.000Z", savedLeg: "to_home", savedLine: "14", observationType: "been_on", vehicleNumber: "8670" }
  ];

  assert.deepEqual(
    filterReviewEntries(entries, { leg: "home", line: "14", type: "been_on", vehicleNumber: "867" }).map((entry) => entry.clientEntryId),
    ["match-new", "match-old"]
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
