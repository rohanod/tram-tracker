import { storage, useMutation } from "lakebed/client";
import { useState } from "preact/hooks";
import { validateTransitPayloads } from "./transit-data";
import { AuthGate } from "./ui";
import type { TransitDataConfig, Viewer } from "./types";

type TransitDataUploadInput = TransitDataConfig & {
  stopsPayload: string;
};
type ActivationResult = {
  ok: boolean;
  reason?: string;
  previous?: TransitDataConfig | null;
  current?: TransitDataConfig;
};
type StoredFile = { key: string; url: string; size: number };

export function UploadDataPage({ authLoading, viewer, isOnline, priorAuthorized, current }: {
  authLoading: boolean;
  viewer?: Viewer;
  isOnline: boolean;
  priorAuthorized: boolean;
  current?: TransitDataConfig | null;
}) {
  const activate = useMutation<[input: TransitDataUploadInput], ActivationResult>("activateTransitData");
  const [metadata, setMetadata] = useState<File | null>(null);
  const [geometry, setGeometry] = useState<File | null>(null);
  const [stops, setStops] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  if (!viewer?.isAllowed) return <AuthGate authLoading={authLoading} viewer={viewer} isOnline={isOnline} priorAuthorized={priorAuthorized} />;

  async function upload() {
    if (!metadata || !geometry || !stops) return;
    setBusy(true);
    setStatus("Validating files…");
    let uploadedMetadata: StoredFile | null = null;
    let uploadedGeometry: StoredFile | null = null;
    try {
      const metadataJson = JSON.parse(await metadata.text());
      const geometryJson = JSON.parse(await geometry.text());
      const stopsJson = JSON.parse(await stops.text());
      validateTransitFiles(metadataJson, geometryJson, stopsJson, metadata.size, geometry.size, stops.size);
      setStatus("Uploading metadata…");
      uploadedMetadata = await storage.upload(metadata, { public: true });
      setStatus("Uploading geometry…");
      uploadedGeometry = await storage.upload(geometry, { public: true });
      setStatus("Saving stop index…");
      const result = await activate({
        version: `${String(metadataJson.generatedAt || "data")}-${Date.now()}`,
        metadataKey: uploadedMetadata.key,
        metadataUrl: uploadedMetadata.url,
        metadataSize: uploadedMetadata.size,
        geometryKey: uploadedGeometry.key,
        geometryUrl: uploadedGeometry.url,
        geometrySize: uploadedGeometry.size,
        stopsPayload: JSON.stringify(stopsJson)
      });
      if (!result.ok) throw new Error(result.reason || "Activation failed");
      setStatus("Transit data active. Return to Vehicle Tracker.");
      setMetadata(null);
      setGeometry(null);
      setStops(null);
      if (result.previous) {
        await Promise.allSettled([storage.delete(result.previous.metadataKey), storage.delete(result.previous.geometryKey)]);
      }
    } catch (error) {
      if (uploadedMetadata) await storage.delete(uploadedMetadata.key).catch(() => undefined);
      if (uploadedGeometry) await storage.delete(uploadedGeometry.key).catch(() => undefined);
      setStatus(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return <main className="upload-page"><section className="upload-panel">
    <a className="back-link" href="/">← Vehicle Tracker</a>
    <h1>Upload transit data</h1>
    <p>Private maintenance page. Upload line info, geometry, and the compact stop index together.</p>
    {current ? <p className="current-data">Active version: <code>{current.version}</code></p> : <p className="current-data">No active transit data.</p>}
    <label className="file-field"><span>Line info JSON</span><input type="file" accept="application/json,.json,.info.json" onChange={(event) => setMetadata(event.currentTarget.files?.[0] ?? null)} /></label>
    <label className="file-field"><span>Line geometry</span><input type="file" accept="application/json,.json,.geojson,.polyline.json" onChange={(event) => setGeometry(event.currentTarget.files?.[0] ?? null)} /></label>
    <label className="file-field"><span>Stop index</span><input type="file" accept="application/json,.json,.stops.json" onChange={(event) => setStops(event.currentTarget.files?.[0] ?? null)} /></label>
    <button className="button primary" type="button" disabled={busy || !metadata || !geometry || !stops} onClick={() => void upload()}>{busy ? "Uploading…" : "Upload and activate"}</button>
    <p className="upload-status" role="status">{status}</p>
  </section></main>;
}

function validateTransitFiles(metadata: any, geometry: any, stops: any, metadataSize: number, geometrySize: number, stopsSize: number) {
  const max = 5 * 1024 * 1024;
  if (metadataSize > max || geometrySize > max || stopsSize > max) throw new Error("Each file must be 5 MiB or smaller.");
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
