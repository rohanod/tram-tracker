import { storage, useMutation } from "lakebed/client";
import { useEffect, useRef, useState } from "preact/hooks";
import { utf8ByteLength } from "../shared/sync";
import { validateTransitPayloads } from "./transit-data";
import { AuthGate } from "./ui";
import type { TransitDataConfig, Viewer } from "./types";

type TransitDataUploadInput = Omit<TransitDataConfig, "cleanupKeys"> & {
  stopsPayload: string;
};
type ActivationResult = {
  ok: boolean;
  reason?: string;
  current?: TransitDataConfig;
};
type CleanupResult = { ok: boolean; reason?: string; cleanupKeys?: string[] };
type StoredFile = { key: string; url: string; size: number };
type PendingActivation = { metadata: StoredFile; geometry: StoredFile; input: TransitDataUploadInput };

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
  const [pendingActivation, setPendingActivation] = useState<PendingActivation | null>(null);
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
    if (!pendingActivation && (!metadata || !geometry || !stops)) return;
    setBusy(true);
    let prepared = pendingActivation;
    let activationDispatched = false;
    let explicitRejection = false;
    try {
      if (!prepared) {
        setStatus("Validating files…");
        const metadataJson = JSON.parse(await metadata!.text());
        const geometryJson = JSON.parse(await geometry!.text());
        const stopsJson = JSON.parse(await stops!.text());
        const stopsPayload = JSON.stringify(stopsJson);
        validateTransitFiles(metadataJson, geometryJson, stopsJson, metadata!.size, geometry!.size, stops!.size, stopsPayload);
        setStatus("Uploading metadata…");
        const uploadedMetadata = await storage.upload(metadata!, { public: true });
        try {
          setStatus("Uploading geometry…");
          const uploadedGeometry = await storage.upload(geometry!, { public: true });
          prepared = {
            metadata: uploadedMetadata,
            geometry: uploadedGeometry,
            input: {
              version: `${String(metadataJson.generatedAt || "data")}-${Date.now()}`,
              metadataKey: uploadedMetadata.key,
              metadataUrl: uploadedMetadata.url,
              metadataSize: uploadedMetadata.size,
              geometryKey: uploadedGeometry.key,
              geometryUrl: uploadedGeometry.url,
              geometrySize: uploadedGeometry.size,
              stopsPayload
            }
          };
          setPendingActivation(prepared);
        } catch (error) {
          await storage.delete(uploadedMetadata.key).catch(() => undefined);
          throw error;
        }
      }

      setStatus("Activating transit data…");
      activationDispatched = true;
      const result = await activate(prepared.input);
      if (!result.ok || !result.current) {
        explicitRejection = true;
        throw new Error(result.reason || "Activation failed");
      }

      setPendingActivation(null);
      setMetadata(null);
      setGeometry(null);
      setStops(null);
      const remaining = await cleanupStaleFiles(result.current);
      setStatus(remaining ? `Transit data active. ${remaining} old file${remaining === 1 ? "" : "s"} will be retried.` : "Transit data active. Old transit data deleted.");
    } catch (error) {
      if (prepared && (!activationDispatched || explicitRejection)) {
        await Promise.allSettled([storage.delete(prepared.metadata.key), storage.delete(prepared.geometry.key)]);
        setPendingActivation(null);
      }
      setStatus(activationDispatched && !explicitRejection
        ? "Connection interrupted. The uploaded files were kept; retry activation instead of uploading them again."
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

  function replaceMetadata(file: File | null) { setMetadata(file); }
  function replaceGeometry(file: File | null) { setGeometry(file); }
  function replaceStops(file: File | null) { setStops(file); }

  return <main className="upload-page"><section className="upload-panel">
    <a className="back-link" href="/">← Vehicle Tracker</a>
    <h1>Upload transit data</h1>
    <p>Private maintenance page. Upload line info, geometry, and the compact stop index together.</p>
    {current ? <p className="current-data">Active version: <code>{current.version}</code></p> : <p className="current-data">No active transit data.</p>}
    <label className="file-field"><span>Line info JSON</span><input type="file" disabled={busy || Boolean(pendingActivation)} accept="application/json,.json,.info.json" onChange={(event) => replaceMetadata(event.currentTarget.files?.[0] ?? null)} /></label>
    <label className="file-field"><span>Line geometry</span><input type="file" disabled={busy || Boolean(pendingActivation)} accept="application/json,.json,.geojson,.polyline.json" onChange={(event) => replaceGeometry(event.currentTarget.files?.[0] ?? null)} /></label>
    <label className="file-field"><span>Stop index</span><input type="file" disabled={busy || Boolean(pendingActivation)} accept="application/json,.json,.stops.json" onChange={(event) => replaceStops(event.currentTarget.files?.[0] ?? null)} /></label>
    <button className="button primary" type="button" disabled={busy || (!pendingActivation && (!metadata || !geometry || !stops))} onClick={() => void upload()}>{busy ? "Working…" : pendingActivation ? "Retry activation" : "Upload and activate"}</button>
    <p className="upload-status" role="status">{status}</p>
  </section></main>;
}

function validateTransitFiles(metadata: any, geometry: any, stops: any, metadataSize: number, geometrySize: number, stopsSize: number, stopsPayload: string) {
  const max = 5 * 1024 * 1024;
  if (metadataSize > max || geometrySize > max || stopsSize > max) throw new Error("Each file must be 5 MiB or smaller.");
  if (utf8ByteLength(JSON.stringify(stopsPayload)) > 65_536) throw new Error("Stop index is too large for Lakebed.");
  validateTransitPayloads(metadata, geometry);
  if (stops?.v !== 1 || !Array.isArray(stops?.s) || !stops.s.length) throw new Error("Invalid stop index.");
  const ids = new Set();
  for (const stop of stops.s) {
    const id = String(stop?.[0] ?? "").trim();
    const name = String(stop?.[2] ?? "").trim();
    const lat = Number(stop?.[3]);
    const lon = Number(stop?.[4]);
    if (!id || !name || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180 || ids.has(id)) {
      throw new Error("Invalid stop index.");
    }
    ids.add(id);
  }
}
