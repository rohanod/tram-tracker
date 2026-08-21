import { storage, useMutation } from "lakebed/client";
import { useEffect, useRef, useState } from "preact/hooks";
import { utf8ByteLength } from "../shared/sync";
import { validateTransitPayloads } from "./transit-data";
import { AuthGate } from "./ui";
import type { TransitDataConfig, Viewer } from "./types";

const ACTIVATION_FRAME_LIMIT = 60 * 1024;
const RECOVERY_KEY_PREFIX = "tram-transit-upload-recovery-v1";

type TransitDataUploadInput = Omit<TransitDataConfig, "cleanupKeys"> & {
  stopsPayload: string;
  supersededKeys: string[];
};
type ActivationResult = {
  ok: boolean;
  reason?: string;
  current?: TransitDataConfig;
};
type CleanupResult = { ok: boolean; reason?: string; cleanupKeys?: string[] };
type StoredFile = { key: string; url: string; size: number };

export function UploadDataPage({ authLoading, viewer, isOnline, priorAuthorized, current }: {
  authLoading: boolean;
  viewer?: Viewer;
  isOnline: boolean;
  priorAuthorized: boolean;
  current?: TransitDataConfig | null;
}) {
  const activate = useMutation<[input: TransitDataUploadInput], ActivationResult>("activateTransitData");
  const acknowledgeCleanup = useMutation<[input: { version: string; keys: string[] }], CleanupResult>("acknowledgeTransitCleanup");
  const [metadata, setMetadata] = useState<File | null>(null);
  const [geometry, setGeometry] = useState<File | null>(null);
  const [stops, setStops] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const cleanupInFlight = useRef(false);

  useEffect(() => {
    if (!viewer?.isAllowed || !current?.cleanupKeys?.length || cleanupInFlight.current) return;
    void cleanupStaleFiles(current).then((remaining) => {
      if (remaining) setStatus(`${remaining} old transit file${remaining === 1 ? "" : "s"} could not be deleted yet. Cleanup will retry.`);
    });
  }, [viewer?.isAllowed, current?.version, current?.cleanupKeys?.join("|")]);

  if (!viewer?.isAllowed) return <AuthGate authLoading={authLoading} viewer={viewer} isOnline={isOnline} priorAuthorized={priorAuthorized} />;

  async function upload() {
    if (!metadata || !geometry || !stops) return;
    setBusy(true);
    let uploadedMetadata: StoredFile | null = null;
    let uploadedGeometry: StoredFile | null = null;
    let activationDispatched = false;
    let explicitRejection = false;
    try {
      setStatus("Validating files…");
      if (metadata.name !== "tpg-lines.info.json" || geometry.name !== "tpg-routes.polyline.json" || stops.name !== "tpg-stops.compact.json") {
        throw new Error("Select the canonical line info, polyline geometry, and compact stop files.");
      }
      const metadataJson = JSON.parse(await metadata.text());
      const geometryJson = JSON.parse(await geometry.text());
      const stopsJson = JSON.parse(await stops.text());
      const stopsPayload = validateTransitFiles(metadataJson, geometryJson, stopsJson, metadata.size, geometry.size, stops.size);

      setStatus("Uploading metadata…");
      uploadedMetadata = await storage.upload(metadata, { public: true });
      addRecoveryKeys(viewer.userId, [uploadedMetadata.key]);
      setStatus("Uploading geometry…");
      uploadedGeometry = await storage.upload(geometry, { public: true });
      addRecoveryKeys(viewer.userId, [uploadedGeometry.key]);

      const input = {
        version: `${String(metadataJson.generatedAt || "data")}-${Date.now()}`,
        metadataKey: uploadedMetadata.key,
        metadataUrl: uploadedMetadata.url,
        metadataSize: uploadedMetadata.size,
        geometryKey: uploadedGeometry.key,
        geometryUrl: uploadedGeometry.url,
        geometrySize: uploadedGeometry.size,
        stopsPayload,
        supersededKeys: readRecoveryKeys(viewer.userId)
      };
      if (activationFrameBytes(input) > ACTIVATION_FRAME_LIMIT) throw new Error("Transit activation request is too large.");

      setStatus("Activating transit data…");
      activationDispatched = true;
      const result = await activate(input);
      if (!result.ok || !result.current) {
        explicitRejection = true;
        throw new Error(result.reason || "Activation failed");
      }

      clearRecoveryKeys(viewer.userId);
      setMetadata(null);
      setGeometry(null);
      setStops(null);
      setInputKey((value) => value + 1);
      const remaining = await cleanupStaleFiles(result.current);
      setStatus(remaining ? `Transit data active. ${remaining} old file${remaining === 1 ? "" : "s"} will be retried.` : "Transit data active. Old transit data deleted.");
    } catch (error) {
      if (!activationDispatched || explicitRejection) {
        const keys = [uploadedMetadata?.key, uploadedGeometry?.key].filter(Boolean) as string[];
        await Promise.allSettled(keys.map((key) => storage.delete(key)));
        removeRecoveryKeys(viewer.userId, keys);
      }
      setStatus(activationDispatched && !explicitRejection
        ? "Connection interrupted. Files remain selected; upload again to start a new attempt."
        : error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function cleanupStaleFiles(config: TransitDataConfig) {
    const active = new Set([config.metadataKey, config.geometryKey]);
    const keys = [...new Set((config.cleanupKeys ?? []).filter((key) => key && !active.has(key)))];
    if (!keys.length || cleanupInFlight.current) return keys.length;
    cleanupInFlight.current = true;
    try {
      const results = await Promise.all(keys.map(async (key) => {
        try {
          await storage.delete(key);
          return key;
        } catch {
          return "";
        }
      }));
      const deleted = results.filter(Boolean);
      if (deleted.length) {
        try {
          const result = await acknowledgeCleanup({ version: config.version, keys: deleted });
          if (!result.ok) return keys.length;
        } catch {
          return keys.length;
        }
      }
      return keys.length - deleted.length;
    } finally {
      cleanupInFlight.current = false;
    }
  }

  return <main className="upload-page"><section className="upload-panel">
    <a className="back-link" href="/">← Vehicle Tracker</a>
    <h1>Upload transit data</h1>
    <p>Private maintenance page. Upload line info, geometry, and the compact stop index together.</p>
    {current ? <p className="current-data">Active version: <code>{current.version}</code></p> : <p className="current-data">No active transit data.</p>}
    <label className="file-field"><span>Line info JSON</span><input key={`metadata-${inputKey}`} type="file" disabled={busy} accept="application/json,.json,.info.json" onChange={(event) => setMetadata(event.currentTarget.files?.[0] ?? null)} /></label>
    <label className="file-field"><span>Line geometry</span><input key={`geometry-${inputKey}`} type="file" disabled={busy} accept="application/json,.json,.polyline.json" onChange={(event) => setGeometry(event.currentTarget.files?.[0] ?? null)} /></label>
    <label className="file-field"><span>Stop index</span><input key={`stops-${inputKey}`} type="file" disabled={busy} accept="application/json,.json,.stops.json" onChange={(event) => setStops(event.currentTarget.files?.[0] ?? null)} /></label>
    <button className="button primary" type="button" disabled={busy || !metadata || !geometry || !stops} onClick={() => void upload()}>{busy ? "Working…" : "Upload and activate"}</button>
    <p className="upload-status" role="status">{status}</p>
  </section></main>;
}

function validateTransitFiles(metadata: any, geometry: any, stops: any, metadataSize: number, geometrySize: number, stopsSize: number) {
  const max = 5 * 1024 * 1024;
  if (metadataSize > max || geometrySize > max || stopsSize > max) throw new Error("Each file must be 5 MiB or smaller.");
  validateTransitPayloads(metadata, geometry);
  if (stops?.v !== 1 || !Array.isArray(stops?.s) || !stops.s.length) throw new Error("Invalid stop index.");
  const ids = new Set();
  const compactStops = stops.s.map((stop) => {
    const id = String(stop?.[0] ?? "").trim();
    const name = String(stop?.[2] ?? "").trim();
    const lat = Number(stop?.[3]);
    const lon = Number(stop?.[4]);
    if (!id || !name || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180 || ids.has(id)) {
      throw new Error("Invalid stop index.");
    }
    ids.add(id);
    return { n: name, a: lat, o: lon };
  });
  return JSON.stringify({ stops: compactStops });
}

function activationFrameBytes(input: TransitDataUploadInput) {
  return utf8ByteLength(JSON.stringify({ id: 1, op: "mutation.run", name: "activateTransitData", args: [input] }));
}

function recoveryStorageKey(userId: string) {
  return `${RECOVERY_KEY_PREFIX}:${encodeURIComponent(userId)}`;
}

function normalizeRecoveryKeys(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((key) => String(key ?? "").trim()).filter((key) => /^public\/[A-Za-z0-9_-]+$/.test(key)))].slice(0, 24)
    : [];
}

function readRecoveryKeys(userId: string) {
  try {
    return normalizeRecoveryKeys(JSON.parse(localStorage.getItem(recoveryStorageKey(userId)) || "[]"));
  } catch {
    return [];
  }
}

function writeRecoveryKeys(userId: string, keys: string[]) {
  try {
    localStorage.setItem(recoveryStorageKey(userId), JSON.stringify(normalizeRecoveryKeys(keys)));
  } catch {
    // ponytail: recovery is best-effort; the server ledger handles confirmed activations.
  }
}

function addRecoveryKeys(userId: string, keys: string[]) {
  writeRecoveryKeys(userId, [...keys, ...readRecoveryKeys(userId)]);
}

function removeRecoveryKeys(userId: string, keys: string[]) {
  const removed = new Set(keys);
  writeRecoveryKeys(userId, readRecoveryKeys(userId).filter((key) => !removed.has(key)));
}

function clearRecoveryKeys(userId: string) {
  try {
    localStorage.removeItem(recoveryStorageKey(userId));
  } catch {
    // ponytail: recovery is best-effort; the server ledger handles confirmed activations.
  }
}
