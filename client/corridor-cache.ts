import { setCorridors } from "../shared/corridors";
import { debugAccess, errorMessage, readMeta, writeMeta } from "./local-store";

const CORRIDORS_CACHE_KEY = "corridors-cdn-cache-v1";
const CDN_CORRIDORS_URL = "https://cdn.jsdelivr.net/gh/rohanod/tram-tracker@main/cdn/corridors-v1.json";

export async function loadCachedCorridors() {
  await readCachedCorridors();

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return;
  }

  try {
    const response = await fetch(CDN_CORRIDORS_URL, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error("Corridor data HTTP " + response.status);
    }
    const payload = await response.json();
    applyCorridors(payload);
    await writeMeta(CORRIDORS_CACHE_KEY, JSON.stringify(payload));
  } catch (err) {
    debugAccess("corridors-refresh-error", { error: errorMessage(err) });
  }
}

async function readCachedCorridors() {
  try {
    const raw = await readMeta(CORRIDORS_CACHE_KEY);
    if (raw) {
      applyCorridors(JSON.parse(raw));
    }
  } catch (err) {
    debugAccess("corridors-cache-read-error", { error: errorMessage(err) });
  }
}

function applyCorridors(payload: unknown) {
  const corridors = (payload as { corridors?: unknown[] } | null)?.corridors;
  if (Array.isArray(corridors) && corridors.length) {
    setCorridors(corridors);
  }
}
