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

test("vehicle numbers must be 3 or 4 digits", async () => {
  const { cleanVehicleNumber, isValidVehicleNumber } = await loadSharedModule();

  assert.equal(cleanVehicleNumber(" 867 "), "867");
  assert.equal(cleanVehicleNumber("1205"), "1205");
  assert.equal(isValidVehicleNumber("12"), false);
  assert.equal(isValidVehicleNumber("12345"), false);
  assert.equal(isValidVehicleNumber("12a"), false);
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
