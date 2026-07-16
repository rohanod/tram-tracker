import { storage, useMutation } from "lakebed/client";
import { useState } from "preact/hooks";
import { AuthGate } from "./ui";
import type { TransitDataConfig, Viewer } from "./types";

type ActivationResult = { ok: boolean; reason?: string; previous?: TransitDataConfig | null; current?: TransitDataConfig };

export function UploadDataPage({ authLoading, viewer, isOnline, priorAuthorized, current }: {
  authLoading: boolean;
  viewer?: Viewer;
  isOnline: boolean;
  priorAuthorized: boolean;
  current?: TransitDataConfig | null;
}) {
  const activate = useMutation<[input: TransitDataConfig], ActivationResult>("activateTransitData");
  const [metadata, setMetadata] = useState<File | null>(null);
  const [geometry, setGeometry] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  if (!viewer?.isAllowed) return <AuthGate authLoading={authLoading} viewer={viewer} isOnline={isOnline} priorAuthorized={priorAuthorized} />;

  async function upload() {
    if (!metadata || !geometry) return;
    setBusy(true);
    setStatus("Validating files…");
    let uploadedMetadata: { key: string; url: string; size: number } | null = null;
    let uploadedGeometry: { key: string; url: string; size: number } | null = null;
    try {
      const metadataJson = JSON.parse(await metadata.text());
      const geometryJson = JSON.parse(await geometry.text());
      validateTransitFiles(metadataJson, geometryJson, metadata.size, geometry.size);
      setStatus("Uploading metadata…");
      uploadedMetadata = await storage.upload(new Blob([await metadata.arrayBuffer()], { type: "application/json" }), { public: true });
      setStatus("Uploading geometry…");
      uploadedGeometry = await storage.upload(new Blob([await geometry.arrayBuffer()], { type: "application/json" }), { public: true });
      setStatus("Activating data…");
      const result = await activate({
        version: `${String(metadataJson.generatedAt || "data")}-${Date.now()}`,
        metadataKey: uploadedMetadata.key,
        metadataUrl: uploadedMetadata.url,
        metadataSize: uploadedMetadata.size,
        geometryKey: uploadedGeometry.key,
        geometryUrl: uploadedGeometry.url,
        geometrySize: uploadedGeometry.size
      });
      if (!result.ok) throw new Error(result.reason || "Activation failed");
      setStatus("Transit data active. Return to Vehicle Tracker.");
      setMetadata(null);
      setGeometry(null);
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
    <p>Private maintenance page. Upload the generated metadata and geometry files together.</p>
    {current ? <p className="current-data">Active version: <code>{current.version}</code></p> : <p className="current-data">No active transit data.</p>}
    <label className="file-field"><span>Transit metadata JSON</span><input type="file" accept="application/json,.json" onChange={(event) => setMetadata(event.currentTarget.files?.[0] ?? null)} /></label>
    <label className="file-field"><span>Transit geometry JSON</span><input type="file" accept="application/json,.json" onChange={(event) => setGeometry(event.currentTarget.files?.[0] ?? null)} /></label>
    <button className="button primary" type="button" disabled={busy || !metadata || !geometry} onClick={() => void upload()}>{busy ? "Uploading…" : "Upload and activate"}</button>
    <p className="upload-status" role="status">{status}</p>
  </section></main>;
}

function validateTransitFiles(metadata: any, geometry: any, metadataSize: number, geometrySize: number) {
  const max = 5 * 1024 * 1024;
  if (metadataSize > max || geometrySize > max) throw new Error("Each file must be 5 MiB or smaller.");
  if (metadata?.v !== 1 || !Array.isArray(metadata.lines) || !Array.isArray(metadata.stops)) throw new Error("Invalid metadata file.");
  if (geometry?.v !== 1 || !Array.isArray(geometry.features)) throw new Error("Invalid geometry file.");
  const directionIds = new Set(metadata.lines.flatMap((line) => Array.isArray(line.d) ? line.d.map((direction) => direction.i) : []));
  if (!geometry.features.length || geometry.features.some((feature) => !directionIds.has(feature.i))) throw new Error("Geometry does not match metadata.");
}
