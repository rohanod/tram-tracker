import { signOut, useAuth, useMutation, useQuery } from "lakebed/client";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { canUseTracker as trackerAccessAllowed } from "../shared/auth";
import { classifyCapture, isValidVehicleNumber, normalizeDirection, normalizeLine, normalizeLocation, normalizeObservationType, normalizeVehicleNumber, vehicleHistoryMessage } from "../shared/tram";
import { DEFAULT_REVIEW_FILTERS } from "../shared/review";
import { APP_CSS } from "./app-styles";
import { DESIGN_SYSTEM_CSS } from "./design-system";
import { EntryDetailsDialog, EntryDialog, FiltersDialog, SettingsDialog, type EntryFormValue } from "./entry-ui";
import { DEFAULT_LINE_CATALOG, installPwaAssets, lastSyncText, requestLocation } from "./format";
import {
  LAST_SYNC_META_KEY, PRIOR_AUTH_KEY, clearAccessCache, createClientEntryId, debugSync, enqueueDeleteOperation,
  enqueueUpsertOperation, errorMessage, getSyncOperation, migrateLegacyDeletePendingEntries, migrateLegacyDirections,
  putLocalEntry, readAccessCache, readAccessCacheMirror, readMeta, removeLocalEntry, removeSyncOperation,
  shouldClearAccessCacheForViewer, syncOpKey, wakeFailedSyncOperations, writeAccessCache, writeMeta
} from "./local-store";
import { localEntryFromServerEntry, mergeServerEntries, refreshLocalState, syncPendingEntries } from "./local-sync";
import { shortcutPrefillFromSearch } from "./prefill";
import { TrackerScreen, type ReviewFilters } from "./screens";
import { loadTransitData } from "./transit-data";
import type { LineInfo, LocalEntry, LocationState, MutationResult, ServerEntry, TransitDataConfig, UserSettings, Viewer } from "./types";
import { AuthGate, Toast } from "./ui";
import { UploadDataPage } from "./upload-data";

const DEFAULT_LINES = ["14", "18", "12", "17"];
const SETTINGS_KEY = "default-lines-local-v1";
const SETTINGS_PENDING_KEY = "default-lines-pending-v1";

export function App() {
  const auth = useAuth();
  if (auth.isLoading) {
    const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;
    return <><style>{DESIGN_SYSTEM_CSS + APP_CSS}</style><AuthGate authLoading viewer={undefined} isOnline={isOnline} priorAuthorized={false} /></>;
  }
  return <TrackerApp auth={auth} />;
}

function TrackerApp({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const viewer = useQuery<Viewer>("viewer") as Viewer | undefined;
  const serverEntries = (useQuery<ServerEntry[]>("entries") as ServerEntry[] | undefined) ?? [];
  const serverSettings = useQuery<UserSettings>("settings") as UserSettings | undefined;
  const transitConfig = useQuery<TransitDataConfig | null>("transitData") as TransitDataConfig | null | undefined;
  const saveEntry = useMutation<[entry: LocalEntry], MutationResult>("saveEntry");
  const deleteEntry = useMutation<[id: string], MutationResult>("deleteEntry");
  const saveSettings = useMutation<[settings: UserSettings], MutationResult & UserSettings>("saveSettings");
  const migrateLegacyOwner = useMutation<[], MutationResult>("migrateLegacyOwner");
  const migrateDirections = useMutation<[], MutationResult>("migrateDirections");

  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([]);
  const [localHydrated, setLocalHydrated] = useState(false);
  const [lineCatalog, setLineCatalog] = useState<Record<string, LineInfo>>(DEFAULT_LINE_CATALOG);
  const [defaultLines, setDefaultLines] = useState(DEFAULT_LINES);
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [priorAuthorized, setPriorAuthorized] = useState(false);
  const [cachedAccessAllowed, setCachedAccessAllowed] = useState(() => Boolean(readAccessCacheMirror()?.allowed));
  const [accessCacheHydrated, setAccessCacheHydrated] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncKick, setSyncKick] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [filters, setFilters] = useState<ReviewFilters>({ ...DEFAULT_REVIEW_FILTERS });
  const [dialog, setDialog] = useState<"create" | "edit" | "details" | "settings" | "filters" | "">("");
  const [activeEntry, setActiveEntry] = useState<LocalEntry | null>(null);
  const [createSeed, setCreateSeed] = useState<Partial<EntryFormValue>>({});
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const syncInFlight = useRef(false);
  const ownerMigrationStarted = useRef(false);
  const directionsMigrated = useRef(false);
  const prefillApplied = useRef(false);

  const isLocalGuest = Boolean(viewer?.isGuest && isLocalHostname(window.location.hostname));
  const offlineAccessAllowed = !isOnline && priorAuthorized && cachedAccessAllowed;
  const canUseTracker = trackerAccessAllowed({
    isLocalGuest,
    isAllowed: Boolean(viewer?.isAllowed),
    isOnline,
    priorAuthorized,
    cachedAccessAllowed
  });
  const visibleEntries = useMemo(() => mergeVisibleEntries(serverEntries, localEntries), [serverEntries, localEntries]);

  useEffect(() => {
    installPwaAssets();
    void Promise.allSettled([migrateLegacyDeletePendingEntries(), migrateLegacyDirections(), wakeFailedSyncOperations()])
      .then(() => refreshLocalState(setLocalEntries, setPendingCount))
      .then(() => setLocalHydrated(true))
      .catch((error) => { setLoadError(errorMessage(error)); setLocalHydrated(true); });
    void readMeta(PRIOR_AUTH_KEY).then((value) => setPriorAuthorized(value === "true"));
    void readMeta(LAST_SYNC_META_KEY).then(setLastSyncAt);
    void readAccessCache().then((cache) => { setCachedAccessAllowed(Boolean(cache?.allowed)); setAccessCacheHydrated(true); }).catch(() => setAccessCacheHydrated(true));
    void readMeta(SETTINGS_KEY).then((value) => { if (value) setDefaultLines(parseLines(value)); });
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  useEffect(() => {
    void loadTransitData(transitConfig).then((catalog) => {
      if (catalog) setLineCatalog({ ...DEFAULT_LINE_CATALOG, ...catalog });
      else if (transitConfig?.metadataUrl && transitConfig?.geometryUrl) setLoadError("Transit data could not be loaded. Cached entries remain available.");
    });
  }, [transitConfig?.version, transitConfig?.metadataUrl, transitConfig?.geometryUrl, isOnline]);

  useEffect(() => {
    if (!Array.isArray(serverSettings?.defaultLines)) return;
    void readMeta(SETTINGS_PENDING_KEY).then((pending) => {
      if (pending !== "true") {
        setDefaultLines(serverSettings.defaultLines);
        void writeMeta(SETTINGS_KEY, JSON.stringify(serverSettings.defaultLines));
      }
    });
  }, [serverSettings?.defaultLines?.join("|")]);

  useEffect(() => {
    if (viewer?.isAllowed) {
      setPriorAuthorized(true);
      setCachedAccessAllowed(true);
      void writeMeta(PRIOR_AUTH_KEY, "true");
      void writeAccessCache(viewer);
    } else if (shouldClearAccessCacheForViewer(viewer, cachedAccessAllowed, isOnline) && accessCacheHydrated && !auth.isLoading) {
      setCachedAccessAllowed(false);
      void clearAccessCache();
    }
  }, [viewer?.isAllowed, viewer?.isGuest, viewer?.userId, viewer?.hasAllowedUserId, cachedAccessAllowed, accessCacheHydrated, auth.isLoading, isOnline]);

  useEffect(() => {
    if (!viewer?.isAllowed) return;
    void mergeServerEntries(serverEntries).then(() => refreshLocalState(setLocalEntries, setPendingCount));
  }, [viewer?.isAllowed, serverEntries.map((entry) => `${entry.id}:${entry.updatedAt}:${entry.savedLine}:${entry.savedLeg}`).join("|")]);

  useEffect(() => {
    if (!viewer?.isAllowed || ownerMigrationStarted.current) return;
    ownerMigrationStarted.current = true;
    void migrateLegacyOwner().then((result) => {
      if (!result.ok || directionsMigrated.current) return;
      directionsMigrated.current = true;
      return migrateDirections();
    }).catch((error) => {
      ownerMigrationStarted.current = false;
      debugSync("owner-migration-error", { error: errorMessage(error) });
    });
  }, [viewer?.isAllowed]);

  useEffect(() => {
    if (!viewer?.isAllowed || !isOnline || syncInFlight.current || pendingCount === 0) return;
    void runSync(false);
  }, [viewer?.isAllowed, isOnline, pendingCount, syncKick]);

  useEffect(() => {
    if (!viewer?.isAllowed || !isOnline) return;
    void readMeta(SETTINGS_PENDING_KEY).then(async (pending) => {
      if (pending !== "true") return;
      const result = await saveSettings({ defaultLines });
      if (result.ok) await writeMeta(SETTINGS_PENDING_KEY, "false");
    });
  }, [viewer?.isAllowed, isOnline]);

  useEffect(() => {
    if (prefillApplied.current) return;
    prefillApplied.current = true;
    const prefill = shortcutPrefillFromSearch(window.location.search);
    if (!prefill.hasAny) return;
    setCreateSeed({ vehicleNumber: prefill.vehicleNumber, observationType: prefill.observationType, savedLine: prefill.line, savedLeg: prefill.leg });
    if (prefill.location) setLocation({ status: "captured", ...prefill.location });
    else requestLocation(setLocation);
    setDialog("create");
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function runSync(force: boolean) {
    await syncPendingEntries({ saveEntry, deleteEntry, setLocalEntries, setPendingOperationCount: setPendingCount, setSyncing, setMessage: setToast, setLastSuccessfulSyncAt: setLastSyncAt, syncInFlight, force })
      .catch((error) => { debugSync("sync-error", { error: errorMessage(error) }); setToast("Sync failed. Try again."); });
  }

  function openCreate() {
    setCreateSeed({});
    setDialogError("");
    requestLocation(setLocation);
    setDialog("create");
  }

  async function createEntry(value: EntryFormValue) {
    if (!canUseTracker || !isValidVehicleNumber(value.vehicleNumber) || !lineCatalog[value.savedLine]) return;
    const currentPoint = location.status === "captured" ? normalizeLocation({ lat: location.lat, lon: location.lon }) : null;
    if (!currentPoint) { setDialogError("Wait a moment before saving."); return; }
    setBusy(true);
    setDialogError("");
    try {
      const capturedAt = new Date().toISOString();
      const currentClassification = classifyCapture(currentPoint, capturedAt, false);
      const number = normalizeVehicleNumber(value.vehicleNumber);
      const prior = visibleEntries.find((entry) => entry.vehicleNumber === number);
      const entry: LocalEntry = {
        clientEntryId: createClientEntryId(), serverId: "", vehicleNumber: number,
        observationType: normalizeObservationType(value.observationType), capturedAt, savedAt: capturedAt,
        lat: currentPoint.lat.toFixed(4), lon: currentPoint.lon.toFixed(4),
        locationStatus: "captured",
        classificationStatus: currentClassification.status, inferredLeg: currentClassification.suggestedLeg,
        savedLeg: normalizeDirection(value.savedLeg, value.savedLine), inferredLine: currentClassification.suggestedLine,
        savedLine: normalizeLine(value.savedLine), routeGroup: `line_${normalizeLine(value.savedLine)}`,
        distanceMeters: currentClassification.distanceMeters, nearestStopName: value.nearestStopName,
        syncStatus: "pending", lastError: "", updatedAt: capturedAt
      };
      await persistEntry(entry);
      setDialog("");
      setToast(prior ? vehicleHistoryMessage(prior) : isOnline ? "Entry saved. Syncing now." : "Entry saved offline.");
    } catch (error) {
      setDialogError(errorMessage(error));
    } finally { setBusy(false); }
  }

  async function updateEntry(value: EntryFormValue) {
    if (!activeEntry) return;
    setBusy(true);
    setDialogError("");
    try {
      const updated: LocalEntry = {
        ...activeEntry,
        vehicleNumber: normalizeVehicleNumber(value.vehicleNumber),
        observationType: normalizeObservationType(value.observationType),
        savedLine: normalizeLine(value.savedLine),
        savedLeg: normalizeDirection(value.savedLeg, value.savedLine),
        nearestStopName: value.nearestStopName,
        routeGroup: `line_${normalizeLine(value.savedLine)}`,
        syncStatus: "pending",
        lastError: "",
        updatedAt: new Date().toISOString()
      };
      await persistEntry(updated);
      setActiveEntry(updated);
      setDialog("details");
      setToast("Entry updated.");
    } catch (error) { setDialogError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function persistEntry(entry: LocalEntry) {
    await putLocalEntry(entry);
    await enqueueUpsertOperation(entry);
    await refreshLocalState(setLocalEntries, setPendingCount);
    setSyncKick((value) => value + 1);
  }

  async function removeEntry(entry: LocalEntry) {
    const pendingUpsert = await getSyncOperation(syncOpKey("upsert", entry.clientEntryId));
    await removeLocalEntry(entry.clientEntryId);
    await removeSyncOperation(syncOpKey("upsert", entry.clientEntryId));
    if (entry.serverId || entry.syncStatus === "synced" || (pendingUpsert?.attempts ?? 0) > 0) await enqueueDeleteOperation(entry);
    await refreshLocalState(setLocalEntries, setPendingCount);
    setDialog("");
    setActiveEntry(null);
    setSyncKick((value) => value + 1);
    setToast("Entry deleted.");
  }

  async function updateDefaults(lines: string[]) {
    setBusy(true);
    setDefaultLines(lines);
    await writeMeta(SETTINGS_KEY, JSON.stringify(lines));
    await writeMeta(SETTINGS_PENDING_KEY, "true");
    if (viewer?.isAllowed && isOnline) {
      const result = await saveSettings({ defaultLines: lines });
      if (!result.ok) { setToast("Defaults saved locally. Account sync failed."); setBusy(false); return; }
      await writeMeta(SETTINGS_PENDING_KEY, "false");
    }
    setBusy(false);
    setDialog("");
    setToast("Default lines saved.");
  }

  const styles = <style>{DESIGN_SYSTEM_CSS + APP_CSS}</style>;
  if (window.location.pathname === "/upload-data" || window.location.hash === "#/upload-data") {
    return <>{styles}<UploadDataPage authLoading={auth.isLoading} viewer={viewer} isOnline={isOnline} priorAuthorized={priorAuthorized} current={transitConfig} /></>;
  }
  if (!canUseTracker) return <>{styles}<AuthGate authLoading={auth.isLoading} viewer={viewer} isOnline={isOnline} priorAuthorized={offlineAccessAllowed} /></>;

  return <>{styles}
    <TrackerScreen
      entries={visibleEntries} filters={filters} lineCatalog={lineCatalog} isOnline={isOnline}
      isLoading={!localHydrated || (!viewer && auth.isLoading)} loadError={loadError}
      lastSyncLabel={lastSyncText(lastSyncAt, syncing, pendingCount)} pendingCount={pendingCount}
      onChangeFilters={setFilters} onNew={openCreate}
      onOpen={(entry) => { setActiveEntry(entry); setDialog("details"); }}
      onOpenFilters={() => setDialog("filters")} onOpenSettings={() => setDialog("settings")}
      onRetry={() => { setLoadError(""); setSyncKick((value) => value + 1); void loadTransitData(transitConfig).then((catalog) => catalog && setLineCatalog({ ...DEFAULT_LINE_CATALOG, ...catalog })); }}
    />
    {dialog === "create" ? <EntryDialog mode="create" initialValue={createSeed} location={location} lineCatalog={lineCatalog} defaultLines={defaultLines} busy={busy} error={dialogError} onClose={() => setDialog("")} onSubmit={(value) => void createEntry(value)} /> : null}
    {dialog === "edit" && activeEntry ? <EntryDialog mode="edit" entry={activeEntry} location={location} lineCatalog={lineCatalog} defaultLines={defaultLines} busy={busy} error={dialogError} onClose={() => setDialog("details")} onSubmit={(value) => void updateEntry(value)} /> : null}
    {dialog === "details" && activeEntry ? <EntryDetailsDialog entry={activeEntry} lineCatalog={lineCatalog} onClose={() => setDialog("")} onEdit={() => { setDialogError(""); setDialog("edit"); }} onDelete={() => void removeEntry(activeEntry)} /> : null}
    {dialog === "settings" ? <SettingsDialog defaultLines={defaultLines} lineCatalog={lineCatalog} busy={busy} syncing={syncing} lastSyncLabel={lastSyncText(lastSyncAt, syncing, pendingCount)} onClose={() => setDialog("")} onSave={(lines) => void updateDefaults(lines)} onSync={() => isLocalGuest ? setToast("Local guest entries stay on this device.") : void runSync(true)} onSignOut={() => signOut()} /> : null}
    {dialog === "filters" ? <FiltersDialog filters={filters} lineCatalog={lineCatalog} onClose={() => setDialog("")} onApply={(next) => { setFilters(next); setDialog(""); }} /> : null}
    {toast ? <Toast message={toast} onClose={() => setToast("")} /> : null}
  </>;
}

function mergeVisibleEntries(serverEntries: ServerEntry[], localEntries: LocalEntry[]) {
  const pendingDeletes = new Set(localEntries.filter((entry) => entry.syncStatus === "delete_pending").map((entry) => entry.clientEntryId));
  const merged = new Map<string, LocalEntry>();
  for (const entry of serverEntries) if (!pendingDeletes.has(entry.clientEntryId)) merged.set(entry.clientEntryId, localEntryFromServerEntry(entry));
  for (const entry of localEntries) if (entry.syncStatus !== "delete_pending") merged.set(entry.clientEntryId, entry);
  return Array.from(merged.values()).sort((a, b) => String(b.savedAt || b.capturedAt).localeCompare(String(a.savedAt || a.capturedAt)));
}

function parseLines(value: string) {
  try {
    const lines = JSON.parse(value);
    return Array.isArray(lines) ? lines.map(normalizeLine).filter((line) => line !== "unclassified").slice(0, 4) : DEFAULT_LINES;
  } catch { return DEFAULT_LINES; }
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".localhost");
}
