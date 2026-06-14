import { SignInWithGoogle, signOut, useAuth, useMutation, useQuery } from "lakebed/client";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { CORRIDORS, GENEVA_BOUNDS } from "../shared/corridors";
import { isDeleteSettledResult } from "../shared/sync";
import { classifyCapture, isValidVehicleNumber, LEG_LABELS, LINE_LABELS, LINE_VALUES, OBSERVATION_LABELS, OBSERVATION_VALUES, legValuesForCapturedAt, normalizeLeg, normalizeLine, normalizeObservationType, normalizeVehicleNumber, normalizeLocation } from "../shared/tram";

type Viewer = {
  isAllowed: boolean;
  hasAllowedEmail: boolean;
  isGuest: boolean;
  provider: string;
  userId: string;
  displayName: string;
  email: string;
};

type ServerEntry = {
  id: string;
  clientEntryId: string;
  vehicleNumber: string;
  observationType: string;
  capturedAt: string;
  savedAt: string;
  lat: string;
  lon: string;
  locationStatus: string;
  classificationStatus: string;
  inferredLeg: string;
  savedLeg: string;
  inferredLine: string;
  savedLine: string;
  routeGroup: string;
  distanceMeters: string;
  nearestStopName: string;
  ownerId: string;
  updatedAt: string;
};

type LocalEntry = {
  clientEntryId: string;
  serverId: string;
  vehicleNumber: string;
  observationType: string;
  capturedAt: string;
  savedAt: string;
  lat: string;
  lon: string;
  locationStatus: string;
  classificationStatus: string;
  inferredLeg: string;
  savedLeg: string;
  inferredLine: string;
  savedLine: string;
  routeGroup: string;
  distanceMeters: string;
  nearestStopName: string;
  syncStatus: "pending" | "synced" | "failed" | "delete_pending";
  lastError: string;
  updatedAt: string;
};

type ServerFeatureIdea = {
  id: string;
  clientIdeaId: string;
  body: string;
  capturedAt: string;
  savedAt: string;
  ownerId: string;
  updatedAt: string;
};

type LocalFeatureIdea = {
  clientIdeaId: string;
  serverId: string;
  body: string;
  capturedAt: string;
  savedAt: string;
  syncStatus: "pending" | "synced" | "failed";
  lastError: string;
  updatedAt: string;
};

type MutationResult = {
  ok: boolean;
  id?: string;
  reason?: string;
};

type LocationState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "captured"; lat: number; lon: number; accuracy: number }
  | { status: "denied" }
  | { status: "unavailable" };

type MapPoint = { lat: number; lon: number };

type MapMetrics = {
  width: number;
  height: number;
  left: number;
  top: number;
  zoom: number;
  tileZoom: number;
  tileScale: number;
};

type MapLibreMap = {
  addLayer: (layer: Record<string, unknown>, beforeId?: string) => void;
  addSource: (id: string, source: Record<string, unknown>) => void;
  fitBounds: (bounds: [[number, number], [number, number]], options?: Record<string, unknown>) => void;
  getCanvas: () => HTMLCanvasElement;
  getLayer: (id: string) => unknown;
  getSource: (id: string) => { setData?: (data: Record<string, unknown>) => void } | undefined;
  getZoom: () => number;
  jumpTo: (options: Record<string, unknown>) => void;
  off: (event: string, callback: (...args: any[]) => void) => void;
  on: (event: string, callback: (...args: any[]) => void) => void;
  once: (event: string, callback: (...args: any[]) => void) => void;
  remove: () => void;
  setMaxBounds: (bounds: [[number, number], [number, number]]) => void;
  resize: () => void;
  zoomTo: (zoom: number, options?: Record<string, unknown>) => void;
};

type MapLibreMarker = {
  addTo: (map: MapLibreMap) => MapLibreMarker;
  remove: () => void;
  setLngLat: (lngLat: [number, number]) => MapLibreMarker;
  setPopup: (popup: MapLibrePopup) => MapLibreMarker;
  togglePopup: () => void;
};

type MapLibrePopup = {
  setDOMContent: (element: HTMLElement) => MapLibrePopup;
  setMaxWidth: (width: string) => MapLibrePopup;
};

type MapLibreGlobal = {
  Map: new (options: Record<string, unknown>) => MapLibreMap;
  Marker: new (options?: Record<string, unknown>) => MapLibreMarker;
  Popup: new (options?: Record<string, unknown>) => MapLibrePopup;
};

declare global {
  interface Window {
    maplibregl?: MapLibreGlobal;
  }
}

const DB_NAME = "tram-vehicle-saver";
const DB_VERSION = 3;
const ENTRY_STORE = "entries";
const IDEA_STORE = "featureIdeas";
const META_STORE = "meta";
const SYNC_STORE = "syncQueue";
const PRIOR_AUTH_KEY = "priorAuthorized";
const ACCESS_CACHE_KEY = "allowedAccess";
const ACCESS_CACHE_MIRROR_KEY = "tramAllowedAccessMirror";
const ACCESS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TILE_SIZE = 256;
const DEFAULT_REVIEW_MAP_ZOOM = 16;
const MIN_REVIEW_MAP_ZOOM = 12;
const MAX_REVIEW_MAP_ZOOM = 18;
const REVIEW_RANGE_METERS = 150;
const MAP_CENTER = { lat: 46.2044, lon: 6.1458 };
const LINE_COLORS: Record<string, string> = {
  "12": "#f5a300",
  "14": "#5a1e82",
  "17": "#00ace7",
  "18": "#b82f89"
};
const MAPLIBRE_SCRIPT_URL = "https://unpkg.com/maplibre-gl@^5.24.0/dist/maplibre-gl.js";
const MAPLIBRE_CSS_URL = "https://unpkg.com/maplibre-gl@^5.24.0/dist/maplibre-gl.css";
const REVIEW_MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "OpenStreetMap"
    }
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm"
    }
  ]
};
const AUTH_DEBUG_PREFIX = "[tram-auth-debug]";
const SYNC_DEBUG_PREFIX = "[tram-sync-debug]";
let mapLibreLoadPromise: Promise<MapLibreGlobal> | null = null;

type AccessCache = {
  allowed: boolean;
  email: string;
  userId: string;
  expiresAt: number;
};

type SyncOperation = {
  opKey: string;
  type: "upsert" | "delete";
  clientEntryId: string;
  serverId: string;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  attempts: number;
  lastError: string;
};

export function App() {
  const auth = useAuth();
  const viewer = useQuery<Viewer>("viewer") as Viewer | undefined;
  const serverEntries = (useQuery<ServerEntry[]>("entries") as ServerEntry[] | undefined) ?? [];
  const serverFeatureIdeas = (useQuery<ServerFeatureIdea[]>("featureIdeas") as ServerFeatureIdea[] | undefined) ?? [];
  const saveEntry = useMutation<[entry: LocalEntry], MutationResult>("saveEntry");
  const deleteEntry = useMutation<[id: string], MutationResult>("deleteEntry");
  const saveFeatureIdea = useMutation<[idea: LocalFeatureIdea], MutationResult>("saveFeatureIdea");
  const deleteFeatureIdea = useMutation<[id: string], MutationResult>("deleteFeatureIdea");

  const [vehicleNumber, setVehicleNumber] = useState("");
  const [observationType, setObservationType] = useState("been_on");
  const [selectedLeg, setSelectedLeg] = useState("unclassified");
  const [selectedLine, setSelectedLine] = useState("unclassified");
  const [legTouched, setLegTouched] = useState(false);
  const [lineTouched, setLineTouched] = useState(false);
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([]);
  const [priorAuthorized, setPriorAuthorized] = useState(false);
  const [cachedAccessAllowed, setCachedAccessAllowed] = useState(() => Boolean(readAccessCacheMirror()?.allowed));
  const [accessCacheHydrated, setAccessCacheHydrated] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [pendingOperationCount, setPendingOperationCount] = useState(0);
  const [localIdeas, setLocalIdeas] = useState<LocalFeatureIdea[]>([]);
  const [syncKick, setSyncKick] = useState(0);
  const [ideaDialogOpen, setIdeaDialogOpen] = useState(false);
  const [ideaBody, setIdeaBody] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [nowIso, setNowIso] = useState(new Date().toISOString());
  const [mapEntry, setMapEntry] = useState<LocalEntry | null>(null);
  const previousAccessDebug = useRef("");
  const syncInFlight = useRef(false);

  const canUseSaver = Boolean(viewer?.isAllowed || cachedAccessAllowed || (!isOnline && priorAuthorized));
  const activeSurface = canUseSaver ? "saver" : "auth_gate";
  const cleanNumber = normalizeVehicleNumber(vehicleNumber);
  const currentPoint = location.status === "captured" ? normalizeLocation({ lat: location.lat, lon: location.lon }) : null;
  const currentClassification = useMemo(() => classifyCapture(currentPoint, nowIso), [currentPoint?.lat, currentPoint?.lon, nowIso]);
  const currentLegValues = useMemo(() => legValuesForCapturedAt(nowIso), [nowIso]);
  const visibleEntries = useMemo(
    () => [...localEntries].filter((entry) => entry.syncStatus !== "delete_pending").sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)),
    [localEntries]
  );
  const visibleIdeas = useMemo(() => [...localIdeas].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)), [localIdeas]);
  const pendingIdeaCount = useMemo(() => localIdeas.filter((idea) => idea.syncStatus !== "synced").length, [localIdeas]);

  useEffect(() => {
    installPwaAssets();
    debugAccess("startup", {
      isOnline,
      mirror: accessCacheDebug(readAccessCacheMirror()),
      path: typeof window === "undefined" ? "" : window.location.pathname
    });
    void migrateLegacyDeletePendingEntries()
      .then(() => wakeFailedSyncOperations())
      .then(() => refreshLocalState(setLocalEntries, setPendingOperationCount))
      .then(() => refreshLocalIdeas(setLocalIdeas))
      .catch((err) => debugSync("startup-local-state-error", { error: errorMessage(err) }));
    void readMeta(PRIOR_AUTH_KEY).then((value) => {
      const nextPriorAuthorized = value === "true";
      debugAccess("prior-authorized-read", { priorAuthorized: nextPriorAuthorized, rawValue: value ? "present" : "empty" });
      setPriorAuthorized(nextPriorAuthorized);
    }).catch((err) => debugAccess("prior-authorized-read-error", { error: errorMessage(err) }));
    void readAccessCache().then((cache) => {
      debugAccess("access-cache-read-result", accessCacheDebug(cache));
      setCachedAccessAllowed(Boolean(cache?.allowed));
      setAccessCacheHydrated(true);
    }).catch((err) => {
      debugAccess("access-cache-read-error", { error: errorMessage(err) });
      setAccessCacheHydrated(true);
    });

    const online = () => {
      debugAccess("network-online");
      setIsOnline(true);
    };
    const offline = () => {
      debugAccess("network-offline");
      setIsOnline(false);
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowIso(new Date().toISOString()), 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (viewer?.isAllowed) {
      debugAccess("viewer-allowed-cache-write", { viewer: viewerDebug(viewer) });
      setPriorAuthorized(true);
      setCachedAccessAllowed(true);
      void writeMeta(PRIOR_AUTH_KEY, "true");
      void writeAccessCache(viewer);
    } else if (shouldClearAccessCacheForViewer(viewer, cachedAccessAllowed) && accessCacheHydrated && !auth.isLoading) {
      debugAccess("viewer-not-allowed-cache-clear", { viewer: viewerDebug(viewer) });
      setCachedAccessAllowed(false);
      void clearAccessCache();
    } else if (viewer && !viewer.isGuest && !viewer.isAllowed) {
      debugAccess("viewer-not-allowed-cache-clear-skipped", {
        accessCacheHydrated,
        authLoading: auth.isLoading,
        cachedAccessAllowed,
        viewer: viewerDebug(viewer)
      });
    } else if (viewer) {
      debugAccess("viewer-not-eligible", { viewer: viewerDebug(viewer) });
    }
  }, [viewer?.isAllowed, viewer?.isGuest, viewer?.email, viewer?.userId, cachedAccessAllowed, accessCacheHydrated, auth.isLoading]);

  useEffect(() => {
    const snapshot = {
      activeSurface,
      canUseSaver,
      cachedAccessAllowed,
      accessCacheHydrated,
      priorAuthorized,
      isOnline,
      auth: {
        isLoading: auth.isLoading,
        isGuest: auth.isGuest
      },
      viewer: viewerDebug(viewer)
    };
    const fingerprint = JSON.stringify(snapshot);
    if (previousAccessDebug.current === fingerprint) {
      return;
    }

    previousAccessDebug.current = fingerprint;
    debugAccess("access-state", snapshot);
  }, [
    activeSurface,
    canUseSaver,
    cachedAccessAllowed,
    accessCacheHydrated,
    priorAuthorized,
    isOnline,
    auth.isLoading,
    auth.isGuest,
    viewer?.isAllowed,
    viewer?.hasAllowedEmail,
    viewer?.isGuest,
    viewer?.provider,
    viewer?.userId,
    viewer?.email
  ]);

  useEffect(() => {
    if (canUseSaver && location.status === "idle") {
      requestLocation(setLocation);
    }
  }, [canUseSaver, location.status]);

  useEffect(() => {
    if (!legTouched) {
      setSelectedLeg(currentClassification.suggestedLeg);
    }
  }, [currentClassification.suggestedLeg, legTouched]);

  useEffect(() => {
    if (!lineTouched) {
      setSelectedLine(currentClassification.suggestedLine);
    }
  }, [currentClassification.suggestedLine, lineTouched]);

  useEffect(() => {
    if (!viewer?.isAllowed || serverEntries.length === 0) {
      return;
    }

    void mergeServerEntries(serverEntries).then(() => refreshLocalState(setLocalEntries, setPendingOperationCount));
  }, [viewer?.isAllowed, serverEntries.map((entry) => [entry.id, entry.clientEntryId, entry.savedLeg, entry.savedLine, entry.savedAt, entry.updatedAt].join(":")).join("|")]);

  useEffect(() => {
    if (!viewer?.isAllowed || serverFeatureIdeas.length === 0) {
      return;
    }

    void mergeServerFeatureIdeas(serverFeatureIdeas).then(() => refreshLocalIdeas(setLocalIdeas));
  }, [viewer?.isAllowed, serverFeatureIdeas.map((idea) => [idea.id, idea.clientIdeaId, idea.body, idea.savedAt, idea.updatedAt].join(":")).join("|")]);

  useEffect(() => {
    if (!viewer?.isAllowed || !isOnline || syncInFlight.current || (pendingOperationCount === 0 && pendingIdeaCount === 0)) {
      return;
    }

    void syncPendingEntries({
      saveEntry,
      deleteEntry,
      saveFeatureIdea,
      setLocalEntries,
      setLocalIdeas,
      setPendingOperationCount,
      setSyncing,
      setMessage,
      syncInFlight
    });
  }, [viewer?.isAllowed, isOnline, pendingOperationCount, pendingIdeaCount, syncKick]);

  useEffect(() => {
    if (!viewer?.isAllowed || !isOnline || (pendingOperationCount === 0 && pendingIdeaCount === 0)) {
      return;
    }

    const id = window.setInterval(() => {
      debugSync("sync-retry-timer", { pendingOperationCount, pendingIdeaCount });
      setSyncKick((value) => value + 1);
    }, 15000);
    return () => window.clearInterval(id);
  }, [viewer?.isAllowed, isOnline, pendingOperationCount, pendingIdeaCount]);

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!canUseSaver) {
      setError("Sign in with the allowed Google account before saving.");
      return;
    }

    if (!isValidVehicleNumber(vehicleNumber)) {
      setError("Enter a 3 or 4 digit vehicle number.");
      return;
    }

    const capturedAt = new Date().toISOString();
    const savedAt = capturedAt;
    const point = location.status === "captured" ? normalizeLocation({ lat: location.lat, lon: location.lon }) : null;
    const classification = classifyCapture(point, capturedAt);
    const inferredLeg = classification.suggestedLeg;
    const savedLeg = normalizeLeg(selectedLeg || inferredLeg);
    const inferredLine = classification.suggestedLine;
    const savedLine = normalizeLine(selectedLine || inferredLine);
    const entry: LocalEntry = {
      clientEntryId: createClientEntryId(),
      serverId: "",
      vehicleNumber: cleanNumber,
      observationType: normalizeObservationType(observationType),
      capturedAt,
      savedAt,
      lat: point ? point.lat.toFixed(4) : "",
      lon: point ? point.lon.toFixed(4) : "",
      locationStatus: point ? "captured" : location.status === "checking" ? "unavailable" : location.status,
      classificationStatus: classification.status,
      inferredLeg,
      savedLeg,
      inferredLine,
      savedLine,
      routeGroup: classification.routeGroup,
      distanceMeters: classification.distanceMeters,
      nearestStopName: classification.nearestStopName,
      syncStatus: "pending",
      lastError: "",
      updatedAt: capturedAt
    };

    await putLocalEntry(entry);
    await enqueueUpsertOperation(entry);
    await refreshLocalState(setLocalEntries, setPendingOperationCount);
    setVehicleNumber("");
    setLegTouched(false);
    setLineTouched(false);
    setSelectedLeg(classification.suggestedLeg);
    setSelectedLine(classification.suggestedLine);
    setMessage(isOnline && viewer?.isAllowed ? "Saved locally. Syncing now." : "Saved on this device. It will sync when online.");
    setSyncKick((value) => value + 1);
  }

  async function onSaveIdea(event: SubmitEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    const body = ideaBody.trim();
    if (!canUseSaver) {
      setError("Sign in with the allowed Google account before saving ideas.");
      return;
    }
    if (!body) {
      setError("Write the idea before saving it.");
      return;
    }

    const capturedAt = new Date().toISOString();
    const idea: LocalFeatureIdea = {
      clientIdeaId: createClientIdeaId(),
      serverId: "",
      body: body.slice(0, 1000),
      capturedAt,
      savedAt: capturedAt,
      syncStatus: "pending",
      lastError: "",
      updatedAt: capturedAt
    };

    await putLocalIdea(idea);
    await refreshLocalIdeas(setLocalIdeas);
    setIdeaBody("");
    setIdeaDialogOpen(false);
    setMessage(isOnline && viewer?.isAllowed ? "Idea saved locally. Syncing now." : "Idea saved on this device. It will sync when online.");
    setSyncKick((value) => value + 1);
  }

  async function onDeleteIdea(idea: LocalFeatureIdea) {
    await removeLocalIdea(idea.clientIdeaId);
    if (viewer?.isAllowed && isOnline && idea.serverId) {
      const result = await deleteFeatureIdea(idea.serverId);
      if (!result?.ok && result?.reason !== "not_found") {
        setError("Idea was removed locally, but the server delete will need a retry.");
      }
    }
    await refreshLocalIdeas(setLocalIdeas);
  }

  async function onEditLeg(entry: LocalEntry, leg: string) {
    const savedLeg = normalizeLeg(leg);
    const updated = { ...entry, savedLeg, syncStatus: "pending", updatedAt: new Date().toISOString(), lastError: "" } satisfies LocalEntry;

    await putLocalEntry(updated);
    await enqueueUpsertOperation(updated);
    await refreshLocalState(setLocalEntries, setPendingOperationCount);
    setSyncKick((value) => value + 1);
  }

  async function onEditLine(entry: LocalEntry, line: string) {
    const savedLine = normalizeLine(line);
    const updated = { ...entry, savedLine, syncStatus: "pending", updatedAt: new Date().toISOString(), lastError: "" } satisfies LocalEntry;

    await putLocalEntry(updated);
    await enqueueUpsertOperation(updated);
    await refreshLocalState(setLocalEntries, setPendingOperationCount);
    setSyncKick((value) => value + 1);
  }

  async function onDelete(entry: LocalEntry) {
    const pendingUpsert = await getSyncOperation(syncOpKey("upsert", entry.clientEntryId));
    await removeLocalEntry(entry.clientEntryId);
    await removeSyncOperation(syncOpKey("upsert", entry.clientEntryId));

    const mightHaveServerCopy = Boolean(entry.serverId || entry.syncStatus === "synced" || entry.syncStatus === "failed" || (pendingUpsert?.attempts ?? 0) > 0);
    if (mightHaveServerCopy) {
      await enqueueDeleteOperation(entry);
    }

    await refreshLocalState(setLocalEntries, setPendingOperationCount);
    setSyncKick((value) => value + 1);
  }

  return (
    <main className="app-shell">
      <style>{APP_CSS}</style>
      <section className="utility">
        <header className="topbar">
          <div>
            <h1>Tram saver</h1>
            <p>Save vehicle numbers with an editable route default.</p>
          </div>
          <div className="session">
            <span className={isOnline ? "status-dot online" : "status-dot"} aria-hidden="true" />
            <span>{isOnline ? "online" : "offline"}</span>
            {!auth.isLoading && !auth.isGuest ? (
              <button className="link-button" type="button" onClick={() => signOut()}>
                Sign out
              </button>
            ) : null}
          </div>
        </header>

        {!canUseSaver ? (
          <AuthGate authLoading={auth.isLoading} viewer={viewer} isOnline={isOnline} priorAuthorized={priorAuthorized} />
        ) : (
          <>
            <form className="save-panel" onSubmit={(event) => void onSubmit(event)}>
              <div className="field-row">
                <label className="field-label" htmlFor="vehicle-number">
                  Vehicle number
                </label>
                <input
                  autoComplete="off"
                  className="vehicle-input"
                  id="vehicle-number"
                  inputMode="numeric"
                  maxLength={4}
                  name="vehicle-number"
                  pattern="[0-9]{3,4}"
                  placeholder="867"
                  value={vehicleNumber}
                  onInput={(event) => setVehicleNumber(event.currentTarget.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>

              <div>
                <p className="field-label">Type</p>
                <div className="observation-grid" role="radiogroup" aria-label="Observation type">
                  {OBSERVATION_VALUES.map((value) => (
                    <button
                      className={observationType === value ? "observation-option active" : "observation-option"}
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={observationType === value}
                      onClick={() => setObservationType(value)}
                    >
                      {OBSERVATION_LABELS[value as keyof typeof OBSERVATION_LABELS]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="inset-panel">
                <div className="location-row">
                  <div>
                    <p className="field-label">Location default</p>
                    <p className="subtle">{locationText(location, currentClassification)}</p>
                  </div>
                  <button className="secondary-button" type="button" onClick={() => requestLocation(setLocation)}>
                    Refresh
                  </button>
                </div>

                <div className="leg-grid" role="radiogroup" aria-label="Leg direction">
                  {currentLegValues.map((leg) => (
                    <button
                      className={selectedLeg === leg ? "leg-option active" : "leg-option"}
                      key={leg}
                      type="button"
                      role="radio"
                      aria-checked={selectedLeg === leg}
                      onClick={() => {
                        setLegTouched(true);
                        setSelectedLeg(leg);
                      }}
                    >
                      {LEG_LABELS[leg as keyof typeof LEG_LABELS]}
                    </button>
                  ))}
                </div>

                <div>
                  <p className="field-label">Line</p>
                  <div className="line-grid" role="radiogroup" aria-label="Exact tram line">
                    {LINE_VALUES.map((line) => (
                      <button
                        className={selectedLine === line ? "line-option active" : "line-option"}
                        key={line}
                        type="button"
                        role="radio"
                        aria-checked={selectedLine === line}
                        onClick={() => {
                          setLineTouched(true);
                          setSelectedLine(line);
                        }}
                      >
                        {LINE_LABELS[line as keyof typeof LINE_LABELS]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {error ? <p className="error-text">{error}</p> : null}
              {message ? <p className="message-text">{message}</p> : null}

              <button className="primary-button" type="submit">
                Save vehicle
              </button>
            </form>

            <section className="history-panel" aria-label="Recent saved entries">
              <div className="section-heading">
                <h2>Recent saves</h2>
                <div className="heading-actions">
                  <span>{historySummaryText(visibleEntries.length, pendingOperationCount + pendingIdeaCount, syncing)}</span>
                  <button className="secondary-button small-button" type="button" onClick={() => setIdeaDialogOpen(true)}>
                    Idea
                  </button>
                </div>
              </div>
              {visibleIdeas.length > 0 ? (
                <ul className="idea-list" aria-label="Feature ideas">
                  {visibleIdeas.map((idea) => (
                    <FeatureIdeaRow idea={idea} key={idea.clientIdeaId} onDelete={onDeleteIdea} />
                  ))}
                </ul>
              ) : null}
              {visibleEntries.length === 0 ? (
                <p className="empty-state">Saved vehicle entries will appear here for review.</p>
              ) : (
                <ul className="entry-list">
                  {visibleEntries.map((entry) => (
                    <EntryRow entry={entry} key={entry.clientEntryId} onDelete={onDelete} onEditLeg={onEditLeg} onEditLine={onEditLine} onShowMap={setMapEntry} />
                  ))}
                </ul>
              )}
            </section>
            {mapEntry ? <SavedLocationDialog entry={mapEntry} onClose={() => setMapEntry(null)} /> : null}
            {ideaDialogOpen ? (
              <FeatureIdeaDialog body={ideaBody} setBody={setIdeaBody} onClose={() => setIdeaDialogOpen(false)} onSubmit={onSaveIdea} />
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}

function createMapMetricsForCenter(centerPoint: MapPoint, width: number, height: number, zoom: number): MapMetrics {
  const renderZoom = clampMapZoom(zoom);
  const tileZoom = Math.floor(renderZoom);
  const tileScale = Math.pow(2, renderZoom - tileZoom);
  const center = projectWorld(centerPoint, renderZoom);
  return {
    width,
    height,
    left: center.x - width / 2,
    top: center.y - height / 2,
    zoom: renderZoom,
    tileZoom,
    tileScale
  };
}

function createTiles(metrics: MapMetrics) {
  const renderedTileSize = TILE_SIZE * metrics.tileScale;
  const maxTile = Math.pow(2, metrics.tileZoom) - 1;
  const startX = Math.max(0, Math.floor(metrics.left / renderedTileSize));
  const endX = Math.min(maxTile, Math.floor((metrics.left + metrics.width) / renderedTileSize));
  const startY = Math.max(0, Math.floor(metrics.top / renderedTileSize));
  const endY = Math.min(maxTile, Math.floor((metrics.top + metrics.height) / renderedTileSize));
  const tiles: Array<{ key: string; z: number; x: number; y: number; left: number; top: number; size: number }> = [];

  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      tiles.push({
        key: metrics.tileZoom + "-" + x + "-" + y,
        z: metrics.tileZoom,
        x,
        y,
        left: x * renderedTileSize - metrics.left,
        top: y * renderedTileSize - metrics.top,
        size: renderedTileSize
      });
    }
  }

  return tiles;
}

function createRoutePaths(metrics: MapMetrics) {
  return CORRIDORS.flatMap((corridor) => {
    const className = "route-line line-" + corridor.line;
    const paths = corridor.paths?.length ? corridor.paths : [corridor.points];

    return paths.map((path, index) => ({
      key: corridor.id + "-" + index,
      className,
      points: path
        .map((rawPoint) => {
          const point = coordinateFromPathPoint(rawPoint);
          const pixel = projectToViewport(point, metrics);
          return pixel.x.toFixed(1) + "," + pixel.y.toFixed(1);
        })
        .join(" ")
    }));
  });
}

function createStopPoints(metrics: MapMetrics) {
  return CORRIDORS.flatMap((corridor) =>
    corridor.points.map((stop, index) => {
      const pixel = projectToViewport(stop, metrics);
      return {
        key: corridor.id + "-stop-" + index,
        className: "stop-dot line-" + corridor.line,
        name: stop.name,
        x: pixel.x,
        y: pixel.y,
        radius: 3.2
      };
    })
  );
}

function coordinateFromPathPoint(point: unknown): MapPoint {
  if (Array.isArray(point)) {
    return { lat: Number(point[0]), lon: Number(point[1]) };
  }

  const candidate = point as MapPoint;
  return { lat: candidate.lat, lon: candidate.lon };
}

function projectToViewport(point: MapPoint, metrics: MapMetrics) {
  const world = projectWorld(point, metrics.zoom);
  return {
    x: world.x - metrics.left,
    y: world.y - metrics.top
  };
}

function projectWorld(point: MapPoint, zoom: number) {
  return {
    x: lonToWorldX(point.lon, zoom),
    y: latToWorldY(point.lat, zoom)
  };
}

function lonToWorldX(lon: number, zoom: number) {
  return ((lon + 180) / 360) * worldSize(zoom);
}

function latToWorldY(lat: number, zoom: number) {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin(degreesToRadians(clampedLat));
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldSize(zoom);
}

function worldSize(zoom: number) {
  return TILE_SIZE * Math.pow(2, zoom);
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function debugAccess(event: string, payload: Record<string, unknown> = {}) {
  if (!isDebugLoggingEnabled()) {
    return;
  }

  console.log(AUTH_DEBUG_PREFIX, event, {
    at: new Date().toISOString(),
    ...payload
  });
}

function debugSync(event: string, payload: Record<string, unknown> = {}) {
  if (!isDebugLoggingEnabled()) {
    return;
  }

  console.log(SYNC_DEBUG_PREFIX, event, {
    at: new Date().toISOString(),
    ...payload
  });
}

function isDebugLoggingEnabled() {
  if (typeof console === "undefined" || typeof localStorage === "undefined" || typeof window === "undefined") {
    return false;
  }

  if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return false;
  }

  try {
    return localStorage.getItem("tramDebug") === "true";
  } catch {
    return false;
  }
}

function operationDebug(operation: SyncOperation) {
  return {
    opKey: operation.opKey,
    type: operation.type,
    clientEntryId: operation.clientEntryId,
    hasServerId: Boolean(operation.serverId),
    attempts: operation.attempts,
    nextAttemptAt: operation.nextAttemptAt || "",
    lastError: operation.lastError || ""
  };
}

function viewerDebug(viewer?: Viewer) {
  if (!viewer) {
    return null;
  }

  return {
    isAllowed: viewer.isAllowed,
    hasAllowedEmail: viewer.hasAllowedEmail,
    isGuest: viewer.isGuest,
    provider: viewer.provider,
    userId: maskIdentifier(viewer.userId),
    email: maskEmail(viewer.email)
  };
}

function accessCacheDebug(cache: AccessCache | null) {
  if (!cache) {
    return { hasCache: false };
  }

  return {
    hasCache: true,
    allowed: cache.allowed,
    email: maskEmail(cache.email),
    userId: maskIdentifier(cache.userId),
    expiresInMs: Math.max(0, cache.expiresAt - Date.now())
  };
}

function shouldClearAccessCacheForViewer(viewer: Viewer | undefined, cachedAccessAllowed: boolean) {
  if (!viewer || viewer.isGuest || viewer.isAllowed || !cachedAccessAllowed) {
    return false;
  }

  const cache = readAccessCacheMirror();
  if (!cache?.allowed || viewer.provider !== "google" || !viewer.hasAllowedEmail) {
    return false;
  }

  const viewerEmail = String(viewer.email ?? "").trim().toLowerCase();
  const viewerUserId = String(viewer.userId ?? "").trim();
  const cachedEmail = String(cache.email ?? "").trim().toLowerCase();
  const cachedUserId = String(cache.userId ?? "").trim();

  if (viewerEmail && cachedEmail && viewerEmail !== cachedEmail) {
    return true;
  }

  if (viewerUserId && cachedUserId && viewerUserId !== cachedUserId) {
    return true;
  }

  return Boolean(viewerEmail && cachedEmail && viewerEmail === cachedEmail && !viewer.isAllowed);
}

function maskEmail(value: string) {
  const email = String(value ?? "");
  if (!email) {
    return "";
  }

  const [name, domain = ""] = email.split("@");
  const visibleName = name.slice(0, 2) || "*";
  return domain ? visibleName + "***@" + domain : visibleName + "***";
}

function maskIdentifier(value: string) {
  const id = String(value ?? "");
  if (!id) {
    return "";
  }

  return id.length <= 10 ? id : id.slice(0, 10) + "...";
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function AuthGate({ authLoading, viewer, isOnline, priorAuthorized }: { authLoading: boolean; viewer?: Viewer; isOnline: boolean; priorAuthorized: boolean }) {
  if (!isOnline && !priorAuthorized) {
    return (
      <section className="auth-panel">
        <h2>Sign in online first</h2>
        <p>This device needs one successful authorized Google sign-in before offline saving is available.</p>
      </section>
    );
  }

  if (authLoading && !viewer) {
    return (
      <section className="auth-panel">
        <h2>Checking access</h2>
        <p>Confirming the current session.</p>
      </section>
    );
  }

  if (!viewer) {
    return (
      <section className="auth-panel">
        <h2>Checking access</h2>
        <p>Keeping the last allowed session active while access refreshes.</p>
      </section>
    );
  }

  if (!viewer.hasAllowedEmail) {
    return (
      <section className="auth-panel">
        <h2>Allowlist missing</h2>
        <p>Set ALLOWED_EMAIL in .env.lakebed.server, then restart Lakebed.</p>
      </section>
    );
  }

  if (viewer.isGuest) {
    return (
      <section className="auth-panel">
        <h2>Private saver</h2>
        <p>Sign in with the allowed Google account to save tram vehicles.</p>
        <SignInWithGoogle className="primary-button auth-button" />
      </section>
    );
  }

  return (
    <section className="auth-panel">
      <h2>Account not allowed</h2>
      <p>{viewer.email || "This Google account"} is not on the allowlist.</p>
      <button className="secondary-button" type="button" onClick={() => signOut()}>
        Sign out
      </button>
    </section>
  );
}

function EntryRow({
  entry,
  onEditLeg,
  onEditLine,
  onShowMap,
  onDelete
}: {
  entry: LocalEntry;
  onEditLeg: (entry: LocalEntry, leg: string) => Promise<void>;
  onEditLine: (entry: LocalEntry, line: string) => Promise<void>;
  onShowMap: (entry: LocalEntry) => void;
  onDelete: (entry: LocalEntry) => Promise<void>;
}) {
  const savedLeg = normalizeLeg(entry.savedLeg);
  const savedLine = normalizeLine(entry.savedLine);
  const observation = normalizeObservationType(entry.observationType);
  const legOptions = legOptionsForEntry(entry, savedLeg);
  const hasSavedLocation = Boolean(entry.lat && entry.lon && Number.isFinite(Number(entry.lat)) && Number.isFinite(Number(entry.lon)));

  return (
    <li className={entry.syncStatus === "delete_pending" ? "entry-row deleting" : "entry-row"}>
      <div className="entry-main">
        <div>
          <strong>{entry.vehicleNumber}</strong>
          <span>{OBSERVATION_LABELS[observation as keyof typeof OBSERVATION_LABELS]} · Saved {formatEntryDate(savedTimeForEntry(entry))}</span>
        </div>
        <p>{entry.nearestStopName || statusLabel(entry.classificationStatus)}</p>
      </div>
      <div className="entry-actions">
        <select value={savedLeg} aria-label={"Leg for vehicle " + entry.vehicleNumber} onChange={(event) => void onEditLeg(entry, event.currentTarget.value)}>
          {legOptions.map((leg) => (
            <option key={leg} value={leg}>
              {LEG_LABELS[leg as keyof typeof LEG_LABELS]}
            </option>
          ))}
        </select>
        <select value={savedLine} aria-label={"Line for vehicle " + entry.vehicleNumber} onChange={(event) => void onEditLine(entry, event.currentTarget.value)}>
          {LINE_VALUES.map((line) => (
            <option key={line} value={line}>
              {LINE_LABELS[line as keyof typeof LINE_LABELS]}
            </option>
          ))}
        </select>
        <button type="button" disabled={!hasSavedLocation} onClick={() => onShowMap(entry)}>
          Show map
        </button>
        <button type="button" onClick={() => void onDelete(entry)}>
          Delete
        </button>
      </div>
      <p className="entry-meta">
        {syncLabel(entry.syncStatus)}
        {savedLine !== "unclassified" ? " · line " + savedLine : ""}
        {entry.distanceMeters ? " · " + entry.distanceMeters + "m" : ""}
        {entry.lat && entry.lon ? " · " + entry.lat + ", " + entry.lon : ""}
        {entry.lastError ? " · " + entry.lastError : ""}
      </p>
    </li>
  );
}

function FeatureIdeaRow({ idea, onDelete }: { idea: LocalFeatureIdea; onDelete: (idea: LocalFeatureIdea) => Promise<void> }) {
  return (
    <li className="idea-row">
      <div>
        <strong>Idea</strong>
        <span>Saved {formatEntryDate(idea.savedAt || idea.capturedAt)}</span>
      </div>
      <p>{idea.body}</p>
      <div className="idea-row-footer">
        <span>
          {syncLabel(idea.syncStatus)}
          {idea.lastError ? " · " + idea.lastError : ""}
        </span>
        <button type="button" onClick={() => void onDelete(idea)}>
          Delete
        </button>
      </div>
    </li>
  );
}

function FeatureIdeaDialog({
  body,
  setBody,
  onClose,
  onSubmit
}: {
  body: string;
  setBody: (body: string) => void;
  onClose: () => void;
  onSubmit: (event: SubmitEvent) => Promise<void>;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form className="idea-dialog" role="dialog" aria-modal="true" aria-labelledby="idea-dialog-title" onSubmit={(event) => void onSubmit(event)} onClick={(event) => event.stopPropagation()}>
        <div className="map-dialog-header">
          <div>
            <h2 id="idea-dialog-title">Save feature idea</h2>
            <p className="subtle">Quick note for later coding.</p>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <label className="field-row" htmlFor="feature-idea">
          <span className="field-label">Idea</span>
          <textarea
            autoFocus
            className="idea-textarea"
            id="feature-idea"
            maxLength={1000}
            rows={5}
            value={body}
            onInput={(event) => setBody(event.currentTarget.value)}
          />
        </label>
        <button className="primary-button" type="submit">
          Save idea
        </button>
      </form>
    </div>
  );
}

function SavedLocationDialog({ entry, onClose }: { entry: LocalEntry; onClose: () => void }) {
  const point = useMemo(() => entryPoint(entry), [entry.clientEntryId, entry.lat, entry.lon]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="map-dialog" role="dialog" aria-modal="true" aria-labelledby="saved-location-title" onClick={(event) => event.stopPropagation()}>
        <div className="map-dialog-header">
          <div>
            <h2 id="saved-location-title">Saved location</h2>
            <p className="subtle">
              {entry.vehicleNumber} · {formatEntryDate(savedTimeForEntry(entry))}
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <MapCnReviewMap point={point} />

        <dl className="result-grid">
          <div>
            <dt>Saved</dt>
            <dd>{formatEntryDate(savedTimeForEntry(entry))}</dd>
          </div>
          <div>
            <dt>Leg</dt>
            <dd>{LEG_LABELS[savedLegForEntry(entry) as keyof typeof LEG_LABELS]}</dd>
          </div>
          <div>
            <dt>Line</dt>
            <dd>{LINE_LABELS[normalizeLine(entry.savedLine) as keyof typeof LINE_LABELS]}</dd>
          </div>
          <div>
            <dt>Coordinates</dt>
            <dd>{point ? point.lat.toFixed(4) + ", " + point.lon.toFixed(4) : "none"}</dd>
          </div>
          <div>
            <dt>Nearest stop</dt>
            <dd>{entry.nearestStopName || "none"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function MapCnReviewMap({ point }: { point: MapPoint | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const [mapZoom, setMapZoom] = useState(DEFAULT_REVIEW_MAP_ZOOM);
  const [isMapLibreReady, setIsMapLibreReady] = useState(false);
  const [mapLibreFailed, setMapLibreFailed] = useState(false);
  const [mapMode, setMapMode] = useState<"default" | "fallback">("default");
  const center = point ?? MAP_CENTER;
  const useFallbackMap = !point || mapLibreFailed || mapMode === "fallback";

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !point || mapMode === "fallback") {
      setIsMapLibreReady(false);
      return;
    }

    let disposed = false;

    loadMapLibre()
      .then(() => {
        if (disposed || !containerRef.current) {
          return;
        }

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: REVIEW_MAP_STYLE,
          center: [center.lon, center.lat],
          zoom: mapZoom,
          minZoom: MIN_REVIEW_MAP_ZOOM,
          maxZoom: MAX_REVIEW_MAP_ZOOM,
          renderWorldCopies: false,
          attributionControl: { compact: true }
        });

        mapRef.current = map;
        map.setMaxBounds([
          [GENEVA_BOUNDS.minLon, GENEVA_BOUNDS.minLat],
          [GENEVA_BOUNDS.maxLon, GENEVA_BOUNDS.maxLat]
        ]);

        const syncZoom = () => setMapZoom(Math.round(map.getZoom()));
        map.on("zoom", syncZoom);

        map.once("load", () => {
          if (disposed) {
            return;
          }
          addMapCnReviewLayers(map);
          setSavedLocationRange(map, point);
          map.fitBounds(boundsAroundPoint(point, REVIEW_RANGE_METERS), {
            padding: 92,
            maxZoom: DEFAULT_REVIEW_MAP_ZOOM,
            duration: 0
          });
          setIsMapLibreReady(true);
        });
      })
      .catch((err) => {
        debugAccess("maplibre-fallback", { error: errorMessage(err) });
        if (!disposed) {
          setMapLibreFailed(true);
        }
      });

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            mapRef.current?.resize();
          });
    resizeObserver?.observe(element);

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [point?.lat, point?.lon, mapMode]);

  useEffect(() => {
    if (!mapRef.current || !isMapLibreReady) {
      return;
    }
    const nextZoom = clampMapZoom(mapZoom);
    mapRef.current.zoomTo(nextZoom, { duration: 180 });
  }, [mapZoom, isMapLibreReady]);

  if (useFallbackMap) {
    return <FallbackReviewMap point={point} mapZoom={mapZoom} mapMode={mapLibreFailed ? "fallback" : mapMode} setMapMode={setMapMode} setMapZoom={setMapZoom} />;
  }

  return (
    <div className="mapcn-shell">
      <div className="mapcn-map" ref={containerRef} aria-label="Saved location map">
        <MapModeToggle mode={mapMode} setMode={setMapMode} />
        {!isMapLibreReady ? (
          <div className="mapcn-loader" aria-live="polite">
            <span />
            <span />
            <span />
          </div>
        ) : null}
        <MapCnControls mapZoom={mapZoom} setMapZoom={setMapZoom} />
        <div className="mapcn-range-label">{REVIEW_RANGE_METERS}m review range</div>
      </div>
    </div>
  );
}

function MapModeToggle({ mode, setMode }: { mode: "default" | "fallback"; setMode: (mode: "default" | "fallback") => void }) {
  return (
    <div className="map-mode-toggle" aria-label="Map renderer">
      <button type="button" className={mode === "default" ? "active" : ""} onClick={() => setMode("default")}>
        Default
      </button>
      <button type="button" className={mode === "fallback" ? "active" : ""} onClick={() => setMode("fallback")}>
        Fallback
      </button>
    </div>
  );
}

function MapCnControls({ mapZoom, setMapZoom, step = 1 }: { mapZoom: number; setMapZoom: (updater: (zoom: number) => number) => void; step?: number }) {
  return (
    <div className="mapcn-controls" aria-label="Map zoom controls">
      <button type="button" disabled={mapZoom >= MAX_REVIEW_MAP_ZOOM} onClick={() => setMapZoom((zoom) => clampMapZoom(zoom + step))} aria-label="Zoom in">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button type="button" disabled={mapZoom <= MIN_REVIEW_MAP_ZOOM} onClick={() => setMapZoom((zoom) => clampMapZoom(zoom - step))} aria-label="Zoom out">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 12h14" />
        </svg>
      </button>
    </div>
  );
}

function FallbackReviewMap({
  point,
  mapZoom,
  mapMode,
  setMapMode,
  setMapZoom
}: {
  point: MapPoint | null;
  mapZoom: number;
  mapMode: "default" | "fallback";
  setMapMode: (mode: "default" | "fallback") => void;
  setMapZoom: (updater: (zoom: number) => number) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ width: 680, height: 420 });
  const renderZoom = useSmoothMapZoom(mapZoom);
  const metrics = useMemo(() => createMapMetricsForCenter(point ?? MAP_CENTER, mapSize.width, mapSize.height, renderZoom), [point?.lat, point?.lon, mapSize.width, mapSize.height, renderZoom]);
  const tiles = useMemo(() => createTiles(metrics), [metrics.left, metrics.top, metrics.width, metrics.height, metrics.zoom]);
  const paths = useMemo(() => createRoutePaths(metrics), [metrics.left, metrics.top, metrics.zoom]);
  const stops = useMemo(() => createStopPoints(metrics), [metrics.left, metrics.top, metrics.zoom]);
  const marker = point ? projectToViewport(point, metrics) : null;
  const rangeRadius = point ? metersToPixels(REVIEW_RANGE_METERS, point.lat, metrics.zoom) : 0;

  useEffect(() => {
    const element = mapRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) {
        return;
      }

      const width = Math.max(280, Math.round(rect.width));
      const height = Math.max(300, Math.round(rect.height));
      setMapSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="review-map"
      ref={mapRef}
      aria-label="Saved location map"
      onWheel={(event) => {
        event.preventDefault();
        setMapZoom((zoom) => clampMapZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25)));
      }}
    >
      {tiles.map((tile) => (
        <img
          alt=""
          aria-hidden="true"
          className="map-tile"
          draggable={false}
          key={tile.key}
          src={"https://tile.openstreetmap.org/" + tile.z + "/" + tile.x + "/" + tile.y + ".png"}
          style={{ left: tile.left + "px", top: tile.top + "px", width: tile.size + "px", height: tile.size + "px" }}
        />
      ))}
      <svg className="map-overlay" viewBox={"0 0 " + metrics.width + " " + metrics.height} aria-hidden="true">
        {paths.map((path) => (
          <polyline className={path.className} key={path.key} points={path.points} />
        ))}
        {stops.map((stop) => (
          <circle className={stop.className} key={stop.key} cx={stop.x} cy={stop.y} r={stop.radius}>
            <title>{stop.name}</title>
          </circle>
        ))}
        {marker ? (
          <>
            <circle className="capture-range-halo" cx={marker.x} cy={marker.y} r={rangeRadius} />
            <circle className="capture-range" cx={marker.x} cy={marker.y} r={rangeRadius} />
          </>
        ) : null}
      </svg>
      <MapModeToggle mode={mapMode} setMode={setMapMode} />
      <div className="map-attribution">
        <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
      </div>
      <MapCnControls mapZoom={mapZoom} setMapZoom={setMapZoom} step={0.5} />
      <div className="mapcn-range-label fallback">{REVIEW_RANGE_METERS}m review range</div>
    </div>
  );
}

function loadMapLibre(): Promise<MapLibreGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("MapLibre requires a browser."));
  }
  if (window.maplibregl) {
    ensureStyleSheet(MAPLIBRE_CSS_URL);
    return Promise.resolve(window.maplibregl);
  }
  if (mapLibreLoadPromise) {
    return mapLibreLoadPromise;
  }

  ensureStyleSheet(MAPLIBRE_CSS_URL);
  mapLibreLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-tram-maplibre="true"]');
    if (existing) {
      existing.addEventListener("load", () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error("MapLibre loaded without global."))), { once: true });
      existing.addEventListener("error", () => reject(new Error("MapLibre script failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = MAPLIBRE_SCRIPT_URL;
    script.async = true;
    script.dataset.tramMaplibre = "true";
    script.addEventListener("load", () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error("MapLibre loaded without global."))), { once: true });
    script.addEventListener("error", () => reject(new Error("MapLibre script failed to load.")), { once: true });
    document.head.appendChild(script);
  });

  return mapLibreLoadPromise;
}

function ensureStyleSheet(href: string) {
  if (typeof document === "undefined" || document.querySelector('link[href="' + href + '"]')) {
    return;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function addMapCnReviewLayers(map: MapLibreMap) {
  map.addSource("tram-review-routes", {
    type: "geojson",
    data: buildRouteFeatureCollection()
  });
  map.addLayer({
    id: "tram-review-route-shadow",
    type: "line",
    source: "tram-review-routes",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#111827",
      "line-width": 7,
      "line-opacity": 0.16
    }
  });
  map.addLayer({
    id: "tram-review-routes",
    type: "line",
    source: "tram-review-routes",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": 4,
      "line-opacity": 0.92
    }
  });

  map.addSource("tram-review-stops", {
    type: "geojson",
    data: buildStopFeatureCollection()
  });
  map.addLayer({
    id: "tram-review-stops",
    type: "circle",
    source: "tram-review-stops",
    paint: {
      "circle-color": ["get", "color"],
      "circle-radius": 4.6,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
      "circle-opacity": 0.96
    }
  });

  map.addSource("tram-review-range", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: []
    }
  });
  map.addLayer({
    id: "tram-review-range",
    type: "fill",
    source: "tram-review-range",
    paint: {
      "fill-color": "#2563eb",
      "fill-opacity": 0.28,
      "fill-outline-color": "#1d4ed8"
    }
  });
  map.addLayer({
    id: "tram-review-range-outline",
    type: "line",
    source: "tram-review-range",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#1d4ed8",
      "line-width": 2.5,
      "line-opacity": 0.94
    }
  });
}

function setSavedLocationRange(map: MapLibreMap, point: MapPoint) {
  const rangeSource = map.getSource("tram-review-range");
  rangeSource?.setData?.(buildCircleFeatureCollection(point, REVIEW_RANGE_METERS));
}

function buildRouteFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: CORRIDORS.flatMap((corridor) => {
      const paths = corridor.paths?.length ? corridor.paths : [corridor.points];
      return paths.map((path, index) => ({
        type: "Feature",
        properties: {
          id: corridor.id + "-" + index,
          line: corridor.line,
          color: lineColor(corridor.line)
        },
        geometry: {
          type: "LineString",
          coordinates: path.map((rawPoint) => {
            const point = coordinateFromPathPoint(rawPoint);
            return [point.lon, point.lat];
          })
        }
      }));
    })
  };
}

function buildStopFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: CORRIDORS.flatMap((corridor) =>
      corridor.points.map((stop, index) => ({
        type: "Feature",
        properties: {
          id: corridor.id + "-stop-" + index,
          name: stop.name,
          line: corridor.line,
          color: lineColor(corridor.line)
        },
        geometry: {
          type: "Point",
          coordinates: [stop.lon, stop.lat]
        }
      }))
    )
  };
}

function buildCircleFeatureCollection(center: MapPoint, radiusMeters: number) {
  const coordinates: Array<[number, number]> = [];
  const latRadians = degreesToRadians(center.lat);
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = Math.max(1, Math.cos(latRadians) * 111320);

  for (let angle = 0; angle <= 360; angle += 8) {
    const radians = degreesToRadians(angle);
    coordinates.push([
      center.lon + (Math.cos(radians) * radiusMeters) / metersPerDegreeLon,
      center.lat + (Math.sin(radians) * radiusMeters) / metersPerDegreeLat
    ]);
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [coordinates]
        }
      }
    ]
  };
}

function boundsAroundPoint(point: MapPoint, radiusMeters: number): [[number, number], [number, number]] {
  const latRadians = degreesToRadians(point.lat);
  const latDelta = radiusMeters / 111320;
  const lonDelta = radiusMeters / Math.max(1, Math.cos(latRadians) * 111320);
  return [
    [point.lon - lonDelta, point.lat - latDelta],
    [point.lon + lonDelta, point.lat + latDelta]
  ];
}

function metersToPixels(meters: number, lat: number, zoom: number) {
  const metersPerPixel = (156543.03392 * Math.cos(degreesToRadians(lat))) / Math.pow(2, zoom);
  return meters / metersPerPixel;
}

function useSmoothMapZoom(targetZoom: number) {
  const [renderZoom, setRenderZoom] = useState(targetZoom);
  const renderZoomRef = useRef(targetZoom);

  useEffect(() => {
    renderZoomRef.current = renderZoom;
  }, [renderZoom]);

  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      renderZoomRef.current = targetZoom;
      setRenderZoom(targetZoom);
      return;
    }

    let animationFrame = 0;
    const startZoom = renderZoomRef.current;
    const zoomDelta = targetZoom - startZoom;
    const duration = 220;
    const startedAt = window.performance.now();

    const tick = (time: number) => {
      const progress = Math.min(1, (time - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      const nextZoom = startZoom + zoomDelta * eased;
      renderZoomRef.current = nextZoom;
      setRenderZoom(nextZoom);
      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [targetZoom]);

  return renderZoom;
}

function lineColor(line: string) {
  return LINE_COLORS[line] ?? "#4a6fae";
}

function locationText(location: LocationState, classification: ReturnType<typeof classifyCapture>) {
  if (location.status === "checking") {
    return "Checking current position.";
  }
  if (location.status === "denied") {
    return "Location denied. Save manually or enable location access.";
  }
  if (location.status === "unavailable") {
    return "Location unavailable. Save manually.";
  }
  if (location.status !== "captured") {
    return "Location will be requested for route defaults.";
  }
  if (classification.status === "matched") {
    return LEG_LABELS[classification.suggestedLeg as keyof typeof LEG_LABELS] + " on " + LINE_LABELS[classification.suggestedLine as keyof typeof LINE_LABELS] + " near " + classification.nearestStopName;
  }
  if (classification.status === "ambiguous") {
    if (classification.suggestedLeg !== "unclassified") {
      return LEG_LABELS[classification.suggestedLeg as keyof typeof LEG_LABELS] + ". Choose the exact line.";
    }
    return "Multiple route groups nearby. Choose manually.";
  }
  if (classification.status === "outside_route") {
    return "Outside the configured corridors. Choose manually.";
  }
  if (classification.status === "outside_geneva") {
    return "Outside Geneva bounds. Choose manually.";
  }
  return "Choose manually.";
}

function statusLabel(status: string) {
  if (status === "matched") return "Route matched";
  if (status === "ambiguous") return "Manual route choice";
  if (status === "outside_route") return "Outside route";
  if (status === "outside_geneva") return "Outside Geneva";
  if (status === "no_location") return "No location";
  return "Saved entry";
}

function syncLabel(status: LocalEntry["syncStatus"]) {
  if (status === "synced") return "synced";
  if (status === "failed") return "sync failed";
  if (status === "delete_pending") return "delete pending";
  return "pending sync";
}

function historySummaryText(localCount: number, pendingOperationCount: number, syncing: boolean) {
  const parts = [localCount + " local"];
  if (pendingOperationCount > 0) {
    parts.push(pendingOperationCount + (syncing ? " syncing" : " queued"));
  } else if (syncing) {
    parts.push("syncing");
  }

  return parts.join(" · ");
}

function legOptionsForEntry(entry: LocalEntry, savedLeg: string) {
  const options = legValuesForCapturedAt(entry.capturedAt);
  return options.includes(savedLeg) ? options : [savedLeg, ...options];
}

function savedTimeForEntry(entry: LocalEntry) {
  return entry.savedAt || entry.capturedAt;
}

function savedLegForEntry(entry: LocalEntry) {
  return normalizeLeg(entry.savedLeg);
}

function entryPoint(entry: LocalEntry): MapPoint | null {
  const lat = Number(entry.lat);
  const lon = Number(entry.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return { lat, lon };
}

function clampMapZoom(zoom: number) {
  return Math.max(MIN_REVIEW_MAP_ZOOM, Math.min(MAX_REVIEW_MAP_ZOOM, zoom));
}

function formatEntryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function requestLocation(setLocation: (location: LocationState) => void) {
  if (!navigator.geolocation) {
    setLocation({ status: "unavailable" });
    return;
  }

  setLocation({ status: "checking" });
  navigator.geolocation.getCurrentPosition(
    (position) => {
      setLocation({
        status: "captured",
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: Math.round(position.coords.accuracy)
      });
    },
    (err) => setLocation({ status: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" }),
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 9000 }
  );
}

function installPwaAssets() {
  if (typeof document !== "undefined" && !document.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/manifest.webmanifest";
    document.head.appendChild(manifest);

    const theme = document.createElement("meta");
    theme.name = "theme-color";
    theme.content = "#4367a1";
    document.head.appendChild(theme);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }
}

async function syncPendingEntries(args: {
  saveEntry: (entry: LocalEntry) => Promise<MutationResult>;
  deleteEntry: (id: string) => Promise<MutationResult>;
  saveFeatureIdea: (idea: LocalFeatureIdea) => Promise<MutationResult>;
  setLocalEntries: (entries: LocalEntry[]) => void;
  setLocalIdeas: (ideas: LocalFeatureIdea[]) => void;
  setPendingOperationCount: (count: number) => void;
  setSyncing: (value: boolean) => void;
  setMessage: (value: string) => void;
  syncInFlight: { current: boolean };
}) {
  if (args.syncInFlight.current) {
    debugSync("sync-skip-in-flight");
    return;
  }

  args.syncInFlight.current = true;
  args.setSyncing(true);
  try {
    const operations = await getSyncOperations();
    const dueOperations = operations.filter((operation) => isOperationDue(operation));
    let completed = 0;
    let failed = 0;

    debugSync("sync-start", {
      queued: operations.length,
      due: dueOperations.length
    });

    for (const operation of dueOperations) {
      if (operation.type === "delete") {
        const result = await runDeleteOperation(operation, args.deleteEntry);
        completed += result === "completed" ? 1 : 0;
        failed += result === "failed" ? 1 : 0;
        continue;
      }

      const result = await runUpsertOperation(operation, args.saveEntry);
      completed += result === "completed" ? 1 : 0;
      failed += result === "failed" ? 1 : 0;
    }

    const ideaResult = await syncPendingFeatureIdeas(args.saveFeatureIdea);
    completed += ideaResult.completed;
    failed += ideaResult.failed;

    if (completed > 0 || failed > 0) {
      args.setMessage(failed > 0 ? "Some changes did not sync. They will retry." : "Sync updated.");
    }

    await refreshLocalState(args.setLocalEntries, args.setPendingOperationCount);
    await refreshLocalIdeas(args.setLocalIdeas);
    debugSync("sync-finish", {
      completed,
      failed,
      remaining: (await getSyncOperations()).length
    });
  } finally {
    args.setSyncing(false);
    args.syncInFlight.current = false;
  }
}

async function syncPendingFeatureIdeas(saveFeatureIdea: (idea: LocalFeatureIdea) => Promise<MutationResult>) {
  const ideas = await getLocalIdeas();
  let completed = 0;
  let failed = 0;

  for (const idea of ideas) {
    if (idea.syncStatus === "synced") {
      continue;
    }

    try {
      const result = await saveFeatureIdea(idea);
      if (result?.ok) {
        await putLocalIdea({
          ...idea,
          serverId: result.id ?? idea.serverId,
          syncStatus: "synced",
          lastError: "",
          updatedAt: new Date().toISOString()
        });
        completed += 1;
        continue;
      }

      await putLocalIdea({ ...idea, syncStatus: "failed", lastError: result?.reason ?? "idea sync failed", updatedAt: new Date().toISOString() });
      failed += 1;
    } catch (err) {
      await putLocalIdea({ ...idea, syncStatus: "failed", lastError: errorMessage(err), updatedAt: new Date().toISOString() });
      failed += 1;
    }
  }

  return { completed, failed };
}

async function mergeServerEntries(serverEntries: ServerEntry[]) {
  const localEntries = await getLocalEntries();
  const localByClientId = new Map(localEntries.map((entry) => [entry.clientEntryId, entry]));
  const pendingDeleteIds = await getPendingDeleteClientIds();

  for (const serverEntry of serverEntries) {
    if (pendingDeleteIds.has(serverEntry.clientEntryId)) {
      debugSync("merge-skip-pending-delete", { clientEntryId: serverEntry.clientEntryId });
      continue;
    }

    const existing = localByClientId.get(serverEntry.clientEntryId);
    if (existing && existing.syncStatus !== "synced") {
      debugSync("merge-skip-local-pending", {
        clientEntryId: serverEntry.clientEntryId,
        syncStatus: existing.syncStatus
      });
      continue;
    }

    await putLocalEntry({
      clientEntryId: serverEntry.clientEntryId,
      serverId: serverEntry.id,
      vehicleNumber: serverEntry.vehicleNumber,
      observationType: normalizeObservationType(serverEntry.observationType),
      capturedAt: serverEntry.capturedAt,
      savedAt: serverEntry.savedAt || serverEntry.capturedAt,
      lat: serverEntry.lat,
      lon: serverEntry.lon,
      locationStatus: serverEntry.locationStatus,
      classificationStatus: serverEntry.classificationStatus,
      inferredLeg: serverEntry.inferredLeg,
      savedLeg: serverEntry.savedLeg,
      inferredLine: normalizeLine(serverEntry.inferredLine),
      savedLine: normalizeLine(serverEntry.savedLine),
      routeGroup: serverEntry.routeGroup,
      distanceMeters: serverEntry.distanceMeters,
      nearestStopName: serverEntry.nearestStopName,
      syncStatus: "synced",
      lastError: "",
      updatedAt: serverEntry.updatedAt || serverEntry.capturedAt || new Date().toISOString()
    });
  }
}

async function mergeServerFeatureIdeas(serverFeatureIdeas: ServerFeatureIdea[]) {
  const localIdeas = await getLocalIdeas();
  const localByClientId = new Map(localIdeas.map((idea) => [idea.clientIdeaId, idea]));

  for (const serverIdea of serverFeatureIdeas) {
    const existing = localByClientId.get(serverIdea.clientIdeaId);
    if (existing && existing.syncStatus !== "synced") {
      continue;
    }

    await putLocalIdea({
      clientIdeaId: serverIdea.clientIdeaId,
      serverId: serverIdea.id,
      body: serverIdea.body,
      capturedAt: serverIdea.capturedAt,
      savedAt: serverIdea.savedAt || serverIdea.capturedAt,
      syncStatus: "synced",
      lastError: "",
      updatedAt: serverIdea.updatedAt || serverIdea.capturedAt || new Date().toISOString()
    });
  }
}

async function runUpsertOperation(operation: SyncOperation, saveEntry: (entry: LocalEntry) => Promise<MutationResult>) {
  const entry = await getLocalEntry(operation.clientEntryId);
  if (!entry) {
    debugSync("upsert-drop-missing-entry", operationDebug(operation));
    await removeSyncOperation(operation.opKey);
    return "completed";
  }

  try {
    debugSync("upsert-attempt", operationDebug(operation));
    const result = await saveEntry(entry);
    if (result?.ok) {
      await putLocalEntry({
        ...entry,
        serverId: result.id ?? entry.serverId,
        syncStatus: "synced",
        lastError: "",
        updatedAt: new Date().toISOString()
      });
      await removeSyncOperation(operation.opKey);
      debugSync("upsert-complete", {
        ...operationDebug(operation),
        serverId: result.id ?? entry.serverId
      });
      return "completed";
    }

    await failOperation(operation, result?.reason ?? "sync failed");
    await putLocalEntry({ ...entry, syncStatus: "failed", lastError: result?.reason ?? "sync failed", updatedAt: new Date().toISOString() });
    return "failed";
  } catch (err) {
    const message = errorMessage(err);
    await failOperation(operation, message);
    await putLocalEntry({ ...entry, syncStatus: "failed", lastError: message, updatedAt: new Date().toISOString() });
    return "failed";
  }
}

async function runDeleteOperation(operation: SyncOperation, deleteEntry: (id: string) => Promise<MutationResult>) {
  try {
    debugSync("delete-attempt", operationDebug(operation));
    const result = await deleteEntry(operation.serverId || operation.clientEntryId);
    if (isDeleteSettledResult(result)) {
      await removeLocalEntry(operation.clientEntryId);
      await removeSyncOperation(operation.opKey);
      debugSync("delete-complete", operationDebug(operation));
      return "completed";
    }

    await failOperation(operation, result?.reason ?? "delete sync failed");
    return "failed";
  } catch (err) {
    await failOperation(operation, errorMessage(err));
    return "failed";
  }
}

async function failOperation(operation: SyncOperation, reason: string) {
  const attempts = operation.attempts + 1;
  const retryDelayMs = Math.min(5 * 60 * 1000, Math.max(5000, attempts * 10000));
  const failedOperation = {
    ...operation,
    attempts,
    lastError: reason,
    updatedAt: new Date().toISOString(),
    nextAttemptAt: new Date(Date.now() + retryDelayMs).toISOString()
  };
  debugSync("operation-failed", {
    ...operationDebug(failedOperation),
    retryDelayMs
  });
  await putSyncOperation(failedOperation);
}

function isOperationDue(operation: SyncOperation) {
  if (!operation.nextAttemptAt) {
    return true;
  }

  const retryAt = Date.parse(operation.nextAttemptAt);
  return Number.isNaN(retryAt) || retryAt <= Date.now();
}

async function refreshLocalState(setLocalEntries: (entries: LocalEntry[]) => void, setPendingOperationCount: (count: number) => void) {
  const [entries, operations] = await Promise.all([getLocalEntries(), getSyncOperations()]);
  setLocalEntries(entries);
  setPendingOperationCount(operations.length);
}

async function refreshLocalIdeas(setLocalIdeas: (ideas: LocalFeatureIdea[]) => void) {
  setLocalIdeas(await getLocalIdeas());
}

function createClientEntryId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return "entry-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function createClientIdeaId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return "idea-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ENTRY_STORE)) {
        db.createObjectStore(ENTRY_STORE, { keyPath: "clientEntryId" });
      }
      if (!db.objectStoreNames.contains(IDEA_STORE)) {
        db.createObjectStore(IDEA_STORE, { keyPath: "clientIdeaId" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        db.createObjectStore(SYNC_STORE, { keyPath: "opKey" });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function migrateLegacyDeletePendingEntries(): Promise<void> {
  const entries = await getLocalEntries();
  for (const entry of entries) {
    if (entry.syncStatus !== "delete_pending") {
      continue;
    }

    debugSync("legacy-delete-pending-migrate", {
      clientEntryId: entry.clientEntryId,
      hasServerId: Boolean(entry.serverId)
    });

    await removeLocalEntry(entry.clientEntryId);
    await removeSyncOperation(syncOpKey("upsert", entry.clientEntryId));
    await enqueueDeleteOperation(entry);
  }
}

async function wakeFailedSyncOperations(): Promise<void> {
  const operations = await getSyncOperations();
  for (const operation of operations) {
    if (!operation.nextAttemptAt && !operation.lastError) {
      continue;
    }

    const awakeOperation = {
      ...operation,
      nextAttemptAt: "",
      updatedAt: new Date().toISOString()
    } satisfies SyncOperation;
    debugSync("wake-failed-operation", operationDebug(awakeOperation));
    await putSyncOperation(awakeOperation);
  }
}

async function getLocalEntries(): Promise<LocalEntry[]> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(ENTRY_STORE, "readonly").objectStore(ENTRY_STORE).getAll();
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve((request.result as LocalEntry[]).map(normalizeLocalEntry));
    };
  });
}

async function getLocalEntry(clientEntryId: string): Promise<LocalEntry | null> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(ENTRY_STORE, "readonly").objectStore(ENTRY_STORE).get(clientEntryId);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve(request.result ? normalizeLocalEntry(request.result as LocalEntry) : null);
    };
  });
}

async function putLocalEntry(entry: LocalEntry): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(ENTRY_STORE, "readwrite").objectStore(ENTRY_STORE).put(normalizeLocalEntry(entry));
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

async function removeLocalEntry(clientEntryId: string): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(ENTRY_STORE, "readwrite").objectStore(ENTRY_STORE).delete(clientEntryId);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

async function getLocalIdeas(): Promise<LocalFeatureIdea[]> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(IDEA_STORE, "readonly").objectStore(IDEA_STORE).getAll();
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve((request.result as LocalFeatureIdea[]).map(normalizeLocalIdea));
    };
  });
}

async function putLocalIdea(idea: LocalFeatureIdea): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(IDEA_STORE, "readwrite").objectStore(IDEA_STORE).put(normalizeLocalIdea(idea));
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

async function removeLocalIdea(clientIdeaId: string): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(IDEA_STORE, "readwrite").objectStore(IDEA_STORE).delete(clientIdeaId);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

function normalizeLocalEntry(entry: LocalEntry): LocalEntry {
  return {
    ...entry,
    observationType: normalizeObservationType(entry.observationType),
    savedAt: entry.savedAt || entry.capturedAt,
    savedLeg: normalizeLeg(entry.savedLeg),
    savedLine: normalizeLine(entry.savedLine),
    inferredLine: normalizeLine(entry.inferredLine),
    syncStatus: entry.syncStatus ?? "synced",
    lastError: entry.lastError ?? "",
    updatedAt: entry.updatedAt || entry.capturedAt || new Date().toISOString()
  };
}

function normalizeLocalIdea(idea: LocalFeatureIdea): LocalFeatureIdea {
  return {
    clientIdeaId: idea.clientIdeaId,
    serverId: idea.serverId || "",
    body: String(idea.body ?? "").trim().slice(0, 1000),
    capturedAt: idea.capturedAt || new Date().toISOString(),
    savedAt: idea.savedAt || idea.capturedAt || new Date().toISOString(),
    syncStatus: idea.syncStatus ?? "pending",
    lastError: idea.lastError ?? "",
    updatedAt: idea.updatedAt || idea.capturedAt || new Date().toISOString()
  };
}

async function enqueueUpsertOperation(entry: LocalEntry): Promise<void> {
  const opKey = syncOpKey("upsert", entry.clientEntryId);
  const existing = await getSyncOperation(opKey);
  const operation = {
    opKey,
    type: "upsert",
    clientEntryId: entry.clientEntryId,
    serverId: entry.serverId,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextAttemptAt: "",
    attempts: existing?.attempts ?? 0,
    lastError: ""
  } satisfies SyncOperation;

  debugSync("enqueue-upsert", operationDebug(operation));
  await putSyncOperation(operation);
}

async function enqueueDeleteOperation(entry: LocalEntry): Promise<void> {
  const opKey = syncOpKey("delete", entry.clientEntryId);
  const existing = await getSyncOperation(opKey);
  const operation = {
    opKey,
    type: "delete",
    clientEntryId: entry.clientEntryId,
    serverId: entry.serverId,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextAttemptAt: "",
    attempts: existing?.attempts ?? 0,
    lastError: ""
  } satisfies SyncOperation;

  debugSync("enqueue-delete", operationDebug(operation));
  await putSyncOperation(operation);
}

async function getSyncOperations(): Promise<SyncOperation[]> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SYNC_STORE, "readonly").objectStore(SYNC_STORE).getAll();
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve((request.result as SyncOperation[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    };
  });
}

async function getSyncOperation(opKey: string): Promise<SyncOperation | null> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SYNC_STORE, "readonly").objectStore(SYNC_STORE).get(opKey);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve((request.result as SyncOperation | undefined) ?? null);
    };
  });
}

async function putSyncOperation(operation: SyncOperation): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SYNC_STORE, "readwrite").objectStore(SYNC_STORE).put(operation);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

async function removeSyncOperation(opKey: string): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SYNC_STORE, "readwrite").objectStore(SYNC_STORE).delete(opKey);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

async function getPendingDeleteClientIds(): Promise<Set<string>> {
  const operations = await getSyncOperations();
  return new Set(operations.filter((operation) => operation.type === "delete").map((operation) => operation.clientEntryId));
}

function syncOpKey(type: SyncOperation["type"], clientEntryId: string) {
  return type + ":" + clientEntryId;
}

async function readMeta(key: string): Promise<string> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(META_STORE, "readonly").objectStore(META_STORE).get(key);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve(String(request.result?.value ?? ""));
    };
  });
}

async function readAccessCache(): Promise<AccessCache | null> {
  const raw = await readMeta(ACCESS_CACHE_KEY);
  if (!raw) {
    debugAccess("access-cache-empty");
    return null;
  }

  try {
    const cache = JSON.parse(raw) as AccessCache;
    if (!cache.allowed || !cache.expiresAt || cache.expiresAt <= Date.now()) {
      debugAccess("access-cache-expired-or-invalid", {
        allowed: Boolean(cache.allowed),
        hasExpiresAt: Boolean(cache.expiresAt),
        expiresInMs: Number(cache.expiresAt ?? 0) - Date.now()
      });
      await clearAccessCache();
      return null;
    }

    writeAccessCacheMirror(cache);
    debugAccess("access-cache-hit", accessCacheDebug(cache));
    return cache;
  } catch {
    debugAccess("access-cache-json-error");
    await clearAccessCache();
    return null;
  }
}

async function writeAccessCache(viewer: Viewer): Promise<void> {
  const cache = {
    allowed: true,
    email: viewer.email,
    userId: viewer.userId,
    expiresAt: Date.now() + ACCESS_CACHE_TTL_MS
  } satisfies AccessCache;
  debugAccess("access-cache-write", accessCacheDebug(cache));
  writeAccessCacheMirror(cache);
  await writeMeta(ACCESS_CACHE_KEY, JSON.stringify(cache));
}

async function clearAccessCache(): Promise<void> {
  debugAccess("access-cache-clear");
  clearAccessCacheMirror();
  await writeMeta(ACCESS_CACHE_KEY, "");
}

function readAccessCacheMirror(): AccessCache | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(ACCESS_CACHE_MIRROR_KEY);
    if (!raw) {
      return null;
    }

    const cache = JSON.parse(raw) as AccessCache;
    if (!cache.allowed || !cache.expiresAt || cache.expiresAt <= Date.now()) {
      localStorage.removeItem(ACCESS_CACHE_MIRROR_KEY);
      return null;
    }

    return cache;
  } catch {
    localStorage.removeItem(ACCESS_CACHE_MIRROR_KEY);
    return null;
  }
}

function writeAccessCacheMirror(cache: AccessCache) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(ACCESS_CACHE_MIRROR_KEY, JSON.stringify(cache));
  } catch {
    // The IndexedDB copy is authoritative for offline use; the mirror only avoids auth-gate flicker.
  }
}

function clearAccessCacheMirror() {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(ACCESS_CACHE_MIRROR_KEY);
  } catch {
    // Ignore storage failures during cleanup.
  }
}

async function writeMeta(key: string, value: string): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(META_STORE, "readwrite").objectStore(META_STORE).put({ key, value });
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

const APP_CSS = `
:root {
  --page: oklch(0.985 0.003 255);
  --inset: oklch(0.967 0.004 255);
  --surface: oklch(1 0 0);
  --surface-raised: oklch(0.996 0.001 255);
  --accent: oklch(0.47 0.115 259.6);
  --accent-strong: oklch(0.39 0.12 259.6);
  --accent-soft: oklch(0.94 0.018 259.8);
  --school: oklch(0.48 0.105 166);
  --school-soft: oklch(0.95 0.025 166);
  --line-12: #f5a300;
  --line-14: #5a1e82;
  --line-17: #00ace7;
  --line-18: #b82f89;
  --text: oklch(0.18 0.006 255);
  --text-secondary: oklch(0.36 0.008 255);
  --text-muted: oklch(0.50 0.007 255);
  --border: oklch(0.75 0.006 255 / 0.58);
  --border-strong: oklch(0.63 0.01 255 / 0.7);
  --danger: oklch(0.48 0.16 28);
  --focus: oklch(0.514 0.101 259.6 / 0.24);
  color-scheme: light;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button,
input,
select {
  font: inherit;
}

button,
select,
input {
  -webkit-tap-highlight-color: transparent;
}

.app-shell {
  min-height: 100vh;
  background: var(--page);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  padding: 20px;
}

.utility {
  width: min(100%, 720px);
  margin: 0 auto;
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  background: var(--surface);
  padding: 18px;
}

.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 16px;
  margin-bottom: 16px;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size: 1.72rem;
  line-height: 1.1;
  letter-spacing: -0.018em;
  font-weight: 720;
}

h2 {
  font-size: 1rem;
  line-height: 1.3;
  font-weight: 650;
}

.topbar p,
.subtle,
.entry-main p,
.entry-meta,
.empty-state,
.auth-panel p {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.45;
}

.session {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-raised);
  color: var(--text-secondary);
  font-size: 0.86rem;
  min-height: 34px;
  padding: 0 10px;
  white-space: nowrap;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--text-muted);
}

.status-dot.online {
  background: var(--accent);
}

.save-panel,
.auth-panel,
.history-panel {
  background: var(--inset);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
}

.save-panel {
  display: grid;
  gap: 12px;
}

.auth-panel {
  display: grid;
  gap: 12px;
}

.history-panel {
  margin-top: 12px;
}

.field-row {
  display: grid;
  gap: 6px;
}

.field-label {
  color: var(--text-secondary);
  font-size: 0.74rem;
  font-weight: 700;
}

.vehicle-input,
.entry-actions select {
  width: 100%;
  min-height: 48px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  outline: none;
}

.vehicle-input {
  min-height: 58px;
  padding: 0 14px;
  font-size: 1.9rem;
  font-weight: 720;
  letter-spacing: 0.02em;
}

.vehicle-input::placeholder {
  color: oklch(0.55 0 0);
}

.vehicle-input:focus,
.entry-actions select:focus {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
  border-color: var(--accent);
}

button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.inset-panel {
  display: grid;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  padding: 12px;
}

.location-row,
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-heading {
  margin-bottom: 9px;
}

.section-heading span {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.observation-grid,
.leg-grid,
.line-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(106px, 1fr));
  gap: 6px;
}

.observation-option,
.leg-option,
.line-option,
.secondary-button,
.link-button,
.entry-actions button {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  min-height: 40px;
  padding: 0 11px;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
}

.observation-option,
.leg-option,
.line-option {
  min-height: 40px;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 640;
}

.observation-option.active,
.leg-option.active,
.line-option.active,
.primary-button {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.primary-button {
  min-height: 50px;
  border-radius: 10px;
  border: 1px solid var(--accent);
  cursor: pointer;
  font-weight: 720;
  transition: background-color 140ms ease, border-color 140ms ease;
}

.primary-button:hover {
  border-color: var(--accent-strong);
  background: var(--accent-strong);
}

.auth-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.secondary-button:hover,
.observation-option:hover,
.leg-option:hover,
.line-option:hover,
.idea-row-footer button:hover,
.entry-actions button:hover {
  background: var(--surface-raised);
  border-color: var(--border-strong);
  color: var(--text);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.link-button {
  min-height: auto;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--accent);
  text-decoration: none;
}

.message-text,
.error-text {
  font-size: 0.9rem;
  line-height: 1.4;
}

.message-text {
  color: var(--accent);
}

.error-text {
  color: var(--danger);
}

.entry-list {
  list-style: none;
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
}

.heading-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.small-button {
  min-height: 32px;
  border-radius: 8px;
  font-size: 0.8rem;
}

.idea-list {
  list-style: none;
  display: grid;
  gap: 7px;
  margin: 0 0 10px;
  padding: 0;
}

.idea-row {
  display: grid;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  padding: 10px;
}

.idea-row div:first-child,
.idea-row-footer {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.idea-row strong {
  font-size: 0.9rem;
}

.idea-row span,
.idea-row-footer span {
  color: var(--text-muted);
  font-size: 0.78rem;
}

.idea-row p {
  color: var(--text-secondary);
  font-size: 0.92rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.idea-row-footer button {
  min-height: 30px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-secondary);
  padding: 0 9px;
  cursor: pointer;
}

.idea-dialog {
  width: min(100%, 520px);
  display: grid;
  gap: 12px;
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  background: var(--surface);
  padding: 14px;
}

.idea-textarea {
  width: 100%;
  resize: vertical;
  min-height: 140px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  padding: 10px;
  line-height: 1.45;
  outline: none;
}

.idea-textarea:focus {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
  border-color: var(--accent);
}

.entry-row {
  display: grid;
  gap: 9px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--surface);
  padding: 11px;
}

.entry-row.deleting {
  opacity: 0.55;
}

.entry-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.entry-main div {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.entry-main strong {
  font-size: 1.4rem;
  letter-spacing: 0.02em;
  line-height: 1;
}

.entry-main span {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.entry-main p {
  max-width: 50%;
  text-align: right;
  overflow-wrap: anywhere;
}

.entry-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 106px auto auto;
  gap: 6px;
}

.entry-actions select {
  min-height: 38px;
  padding: 0 9px;
  font-size: 0.9rem;
}

.empty-state {
  border: 1px dashed var(--border);
  border-radius: 11px;
  background: var(--surface);
  padding: 16px;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  background: oklch(0.16 0.006 255 / 0.34);
  padding: 16px;
}

.map-dialog {
  width: min(100%, 740px);
  max-height: min(88vh, 760px);
  overflow: auto;
  display: grid;
  gap: 12px;
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  background: var(--surface);
  padding: 14px;
}

.map-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.review-map {
  position: relative;
  min-height: 320px;
  height: min(52vh, 440px);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: oklch(0.91 0.01 240);
  touch-action: manipulation;
}

.mapcn-shell {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--inset);
}

.mapcn-map {
  position: relative;
  min-height: 320px;
  height: min(52vh, 460px);
  background: oklch(0.94 0.008 247);
}

.mapcn-loader {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  background: oklch(1 0 0 / 0.58);
  backdrop-filter: blur(3px);
}

.mapcn-loader span {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--text-muted);
  animation: mapcn-pulse 900ms ease-in-out infinite;
}

.mapcn-loader span:nth-child(2) {
  animation-delay: 140ms;
}

.mapcn-loader span:nth-child(3) {
  animation-delay: 280ms;
}

.map-mode-toggle {
  position: absolute;
  left: 10px;
  top: 10px;
  z-index: 6;
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: oklch(1 0 0 / 0.96);
}

.map-mode-toggle button {
  min-height: 32px;
  border: 0;
  border-right: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  padding: 0 10px;
  font-size: 0.74rem;
  font-weight: 650;
  cursor: pointer;
}

.map-mode-toggle button:last-child {
  border-right: 0;
}

.map-mode-toggle button:hover {
  background: var(--surface-raised);
}

.map-mode-toggle button.active {
  background: var(--accent);
  color: white;
}

.map-tile {
  position: absolute;
  width: 256px;
  height: 256px;
  user-select: none;
}

.map-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.route-line {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 4;
  opacity: 0.9;
}

.stop-dot {
  stroke: var(--surface);
  stroke-width: 1.4;
  opacity: 0.95;
}

.route-line.line-14 { stroke: var(--line-14); }
.route-line.line-18 { stroke: var(--line-18); }
.route-line.line-12 { stroke: var(--line-12); }
.route-line.line-17 { stroke: var(--line-17); }

.stop-dot.line-14 { fill: var(--line-14); }
.stop-dot.line-18 { fill: var(--line-18); }
.stop-dot.line-12 { fill: var(--line-12); }
.stop-dot.line-17 { fill: var(--line-17); }

.capture-range {
  fill: oklch(0.52 0.19 264 / 0.28);
  stroke: oklch(0.42 0.18 264);
  stroke-width: 2.4;
}

.capture-range-halo {
  fill: none;
  stroke: oklch(1 0 0 / 0.82);
  stroke-width: 5;
}

.saved-marker circle:first-child {
  fill: oklch(1 0 0 / 0.65);
  stroke: var(--accent);
  stroke-width: 3;
}

.saved-marker circle:last-child {
  fill: var(--accent);
}

.map-attribution {
  position: absolute;
  right: 6px;
  bottom: 6px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: oklch(1 0 0 / 0.88);
  padding: 2px 6px;
  font-size: 0.66rem;
}

.map-attribution a {
  color: var(--text-secondary);
}

.map-controls {
  position: absolute;
  left: 8px;
  top: 8px;
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: oklch(1 0 0 / 0.94);
}

.map-controls button,
.map-controls span {
  width: 36px;
  min-height: 34px;
  border: 0;
  border-right: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 650;
}

.map-controls button {
  cursor: pointer;
}

.map-controls button:hover {
  background: var(--surface-raised);
}

.map-controls span {
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 650;
}

.map-controls button:last-child {
  border-right: 0;
}

.mapcn-controls {
  position: absolute;
  right: 10px;
  bottom: 36px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: oklch(1 0 0 / 0.96);
}

.mapcn-controls button {
  width: 34px;
  height: 34px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.mapcn-controls button:last-child {
  border-bottom: 0;
}

.mapcn-controls button:hover {
  background: var(--surface-raised);
}

.mapcn-controls button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -3px;
}

.mapcn-controls button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.mapcn-controls svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
}

.mapcn-marker {
  position: relative;
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  cursor: pointer;
  transform: translateY(-1px);
}

.mapcn-marker-pulse,
.mapcn-marker-dot {
  position: absolute;
  inset: 0;
  border-radius: 999px;
}

.mapcn-marker-pulse {
  background: oklch(0.514 0.101 259.6 / 0.18);
  border: 2px solid oklch(1 0 0 / 0.78);
}

.mapcn-marker-dot {
  inset: 7px;
  background: var(--accent);
}

.mapcn-popup {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: oklch(1 0 0 / 0.96);
  color: var(--text);
  padding: 8px 10px;
  font-size: 0.84rem;
  font-weight: 650;
}

.maplibregl-popup-content {
  background: transparent !important;
  box-shadow: none !important;
  padding: 0 !important;
}

.maplibregl-popup-tip {
  display: none !important;
}

.mapcn-range-label {
  position: absolute;
  left: 10px;
  bottom: 10px;
  z-index: 5;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: oklch(1 0 0 / 0.94);
  color: var(--text-secondary);
  padding: 5px 9px;
  font-size: 0.72rem;
  font-weight: 650;
}

.mapcn-range-label.fallback {
  pointer-events: none;
}

.map-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.map-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.legend-line {
  width: 24px;
  height: 4px;
  border-radius: 999px;
}

.legend-line.line-14 { background: var(--line-14); }
.legend-line.line-18 { background: var(--line-18); }
.legend-line.line-12 { background: var(--line-12); }
.legend-line.line-17 { background: var(--line-17); }

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--text-muted);
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 8px;
  margin: 0;
}

.result-grid div {
  min-width: 0;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}

.result-grid dt {
  color: var(--text-muted);
  font-size: 0.68rem;
  font-weight: 650;
}

.result-grid dd {
  margin: 2px 0 0;
  color: var(--text);
  font-size: 0.86rem;
  overflow-wrap: anywhere;
}

@media (max-width: 560px) {
  .app-shell {
    padding: 0;
  }

  .utility {
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    min-height: 100vh;
    padding: 14px;
  }

  .topbar,
  .entry-main,
  .location-row {
    display: grid;
  }

  .topbar {
    gap: 10px;
    padding-bottom: 13px;
  }

  h1 {
    font-size: 1.55rem;
  }

  .session {
    justify-content: start;
    width: fit-content;
  }

  .vehicle-input {
    min-height: 56px;
    font-size: 1.75rem;
  }

  .leg-grid,
  .line-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .entry-main p {
    max-width: none;
    text-align: left;
  }

  .entry-actions {
    grid-template-columns: 1fr;
  }

  .entry-actions select,
  .entry-actions button {
    width: 100%;
  }

  .map-dialog-header {
    display: grid;
  }

  .map-dialog {
    width: 100%;
    max-height: 94vh;
    padding: 12px;
  }

  .review-map {
    min-height: 300px;
    height: 50vh;
  }

  .mapcn-map {
    min-height: 300px;
    height: 50vh;
  }

  .result-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@keyframes mapcn-pulse {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.45;
  }
  50% {
    transform: translateY(-3px);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
`;
