import { SignInWithGoogle, signOut, useAuth, useMutation, useQuery } from "lakebed/client";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { DESIGN_SYSTEM_CSS } from "./design-system";
import { APP_CSS } from "./app-styles";
import { loadCachedCorridors } from "./corridor-cache";
import type { LineInfo, LocalEntry, LocationState, MutationResult, ServerEntry, Viewer } from "./types";
import { DEFAULT_LINE_CATALOG, accountStatusText, compareTransitLines, installPwaAssets, lastSyncText, lineColor, lineLabel, loadLineCatalog, locationText, requestLocation, syncButtonLabel } from "./format";
import { LAST_SYNC_META_KEY, PRIOR_AUTH_KEY, accessCacheDebug, clearAccessCache, createClientEntryId, debugAccess, debugSync, enqueueDeleteOperation, enqueueUpsertOperation, errorMessage, getSyncOperation, migrateLegacyDeletePendingEntries, putLocalEntry, readAccessCache, readAccessCacheMirror, readMeta, removeLocalEntry, removeSyncOperation, shouldClearAccessCacheForViewer, syncOpKey, viewerDebug, wakeFailedSyncOperations, writeAccessCache, writeMeta } from "./local-store";
import { localEntryFromServerEntry, mergeServerEntries, refreshLocalState, syncPendingEntries } from "./local-sync";
import { AuthGate, LocationPermissionWarning, PageTabs, Toast } from "./ui";
import { EntryEditDialog, EntryRow, OtherLineChip, SavedLocationDialog } from "./entry-ui";
import { shortcutPrefillFromSearch } from "./prefill";
import { DEFAULT_REVIEW_FILTERS, filterReviewEntries, paginateReviewEntries, recentTripEntries } from "../shared/review";
import { appPageFromHash, hashForAppPage } from "../shared/route-state";
import { classifyCapture, isValidVehicleNumber, LEG_LABELS, MAIN_LINE_VALUES, OBSERVATION_LABELS, OBSERVATION_VALUES, legValuesForCapturedAt, normalizeLine, normalizeObservationType, normalizeVehicleNumber, normalizeLocation } from "../shared/tram";




export function App() {
  const auth = useAuth();
  const viewer = useQuery<Viewer>("viewer") as Viewer | undefined;
  const serverEntries = (useQuery<ServerEntry[]>("entries") as ServerEntry[] | undefined) ?? [];
  const saveEntry = useMutation<[entry: LocalEntry], MutationResult>("saveEntry");
  const deleteEntry = useMutation<[id: string], MutationResult>("deleteEntry");

  const [vehicleNumber, setVehicleNumber] = useState("");
  const [observationType, setObservationType] = useState("been_on");
  const [selectedLeg, setSelectedLeg] = useState("unclassified");
  const [selectedLine, setSelectedLine] = useState("unclassified");
  const [legTouched, setLegTouched] = useState(false);
  const [lineTouched, setLineTouched] = useState(false);
  const [showOtherLine, setShowOtherLine] = useState(false);
  const [allLineOptions, setAllLineOptions] = useState<string[]>([...MAIN_LINE_VALUES]);
  const [lineCatalog, setLineCatalog] = useState<Record<string, LineInfo>>(DEFAULT_LINE_CATALOG);
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([]);
  const [priorAuthorized, setPriorAuthorized] = useState(false);
  const [cachedAccessAllowed, setCachedAccessAllowed] = useState(() => Boolean(readAccessCacheMirror()?.allowed));
  const [accessCacheHydrated, setAccessCacheHydrated] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [pendingOperationCount, setPendingOperationCount] = useState(0);
  const [syncKick, setSyncKick] = useState(0);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState("");
  const [appPage, setAppPage] = useState(() => (typeof window === "undefined" ? "saver" : appPageFromHash(window.location.hash)));
  const [reviewFilters, setReviewFilters] = useState(DEFAULT_REVIEW_FILTERS);
  const [reviewPage, setReviewPage] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [nowIso, setNowIso] = useState(new Date().toISOString());
  const [mapEntry, setMapEntry] = useState<LocalEntry | null>(null);
  const [editEntry, setEditEntry] = useState<LocalEntry | null>(null);
  const previousAccessDebug = useRef("");
  const prefillApplied = useRef(false);
  const syncInFlight = useRef(false);

  const canUseSaver = Boolean(viewer?.isAllowed || cachedAccessAllowed || (!isOnline && priorAuthorized));
  const activeSurface = canUseSaver ? "saver" : "auth_gate";
  const cleanNumber = normalizeVehicleNumber(vehicleNumber);
  const currentPoint = location.status === "captured" ? normalizeLocation({ lat: location.lat, lon: location.lon }) : null;
  const currentClassification = useMemo(() => classifyCapture(currentPoint, nowIso), [currentPoint?.lat, currentPoint?.lon, nowIso]);
  const currentLegValues = useMemo(() => legValuesForCapturedAt(nowIso), [nowIso]);
  const selectedLineIsMain = MAIN_LINE_VALUES.includes(selectedLine);
  const otherLineOptions = useMemo(() => allLineOptions.filter((line) => !MAIN_LINE_VALUES.includes(line)), [allLineOptions]);
  const selectedLineInfo = lineCatalog[normalizeLine(selectedLine)];
  const visibleEntries = useMemo(() => {
    const pendingDeleteIds = new Set(localEntries.filter((entry) => entry.syncStatus === "delete_pending").map((entry) => entry.clientEntryId));
    const merged = new Map<string, LocalEntry>();

    for (const serverEntry of serverEntries) {
      if (!pendingDeleteIds.has(serverEntry.clientEntryId)) {
        merged.set(serverEntry.clientEntryId, localEntryFromServerEntry(serverEntry));
      }
    }

    for (const localEntry of localEntries) {
      if (localEntry.syncStatus !== "delete_pending") {
        merged.set(localEntry.clientEntryId, localEntry);
      }
    }

    return Array.from(merged.values()).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  }, [localEntries, serverEntries]);
  const recentEntries = useMemo(() => recentTripEntries(visibleEntries, 2), [visibleEntries]);
  const reviewEntries = useMemo(() => filterReviewEntries(visibleEntries, reviewFilters), [visibleEntries, reviewFilters]);
  const pagedReviewEntries = useMemo(() => paginateReviewEntries(reviewEntries, reviewPage, 10), [reviewEntries, reviewPage]);

  useEffect(() => {
    setReviewPage(1);
  }, [reviewFilters.leg, reviewFilters.line, reviewFilters.type, reviewFilters.vehicleNumber]);

  useEffect(() => {
    if (reviewPage !== pagedReviewEntries.currentPage) {
      setReviewPage(pagedReviewEntries.currentPage);
    }
  }, [pagedReviewEntries.currentPage, reviewPage]);

  useEffect(() => {
    installPwaAssets();
    void loadCachedCorridors();
    debugAccess("startup", {
      isOnline,
      mirror: accessCacheDebug(readAccessCacheMirror()),
      path: typeof window === "undefined" ? "" : window.location.pathname
    });
    void migrateLegacyDeletePendingEntries()
      .then(() => wakeFailedSyncOperations())
      .then(() => refreshLocalState(setLocalEntries, setPendingOperationCount))
      .catch((err) => debugSync("startup-local-state-error", { error: errorMessage(err) }));
    void readMeta(PRIOR_AUTH_KEY).then((value) => {
      const nextPriorAuthorized = value === "true";
      debugAccess("prior-authorized-read", { priorAuthorized: nextPriorAuthorized, rawValue: value ? "present" : "empty" });
      setPriorAuthorized(nextPriorAuthorized);
    }).catch((err) => debugAccess("prior-authorized-read-error", { error: errorMessage(err) }));
    void readMeta(LAST_SYNC_META_KEY).then(setLastSuccessfulSyncAt).catch((err) => debugSync("last-sync-read-error", { error: errorMessage(err) }));
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
    const onHashChange = () => setAppPage(appPageFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowIso(new Date().toISOString()), 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const id = window.setTimeout(() => setToast(""), 5200);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    void loadLineCatalog()
      .then((catalog) => {
        setLineCatalog(catalog);
        setAllLineOptions(Object.keys(catalog).sort(compareTransitLines));
      })
      .catch((err) => debugSync("line-options-load-failed", { error: errorMessage(err) }));
  }, []);

  useEffect(() => {
    if (prefillApplied.current || typeof window === "undefined") {
      return;
    }

    prefillApplied.current = true;
    const prefill = shortcutPrefillFromSearch(window.location.search);
    if (!prefill.hasAny) {
      return;
    }

    if (prefill.vehicleNumber) {
      setVehicleNumber(prefill.vehicleNumber);
    }
    if (prefill.observationType) {
      setObservationType(prefill.observationType);
    }
    if (prefill.leg) {
      setLegTouched(true);
      setSelectedLeg(prefill.leg);
    }
    if (prefill.line) {
      setLineTouched(true);
      setSelectedLine(prefill.line);
      setShowOtherLine(!MAIN_LINE_VALUES.includes(prefill.line) && prefill.line !== "unclassified");
    }
    if (prefill.location) {
      setLocation({ status: "captured", lat: prefill.location.lat, lon: prefill.location.lon, accuracy: prefill.location.accuracy });
    }

    setMessage("Details loaded from the URL. Review and save.");
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
      setShowOtherLine(!MAIN_LINE_VALUES.includes(currentClassification.suggestedLine) && currentClassification.suggestedLine !== "unclassified");
    }
  }, [currentClassification.suggestedLine, lineTouched]);

  useEffect(() => {
    if (!viewer?.isAllowed) {
      return;
    }

    void mergeServerEntries(serverEntries).then(() => refreshLocalState(setLocalEntries, setPendingOperationCount));
  }, [viewer?.isAllowed, serverEntries.map((entry) => [entry.id, entry.clientEntryId, entry.savedLeg, entry.savedLine, entry.savedAt, entry.updatedAt].join(":")).join("|")]);


  useEffect(() => {
    if (!viewer?.isAllowed || !isOnline || syncInFlight.current || pendingOperationCount === 0) {
      return;
    }

    void syncPendingEntries({
      saveEntry,
      deleteEntry,
      setLocalEntries,
      setPendingOperationCount,
      setSyncing,
      setMessage,
      setLastSuccessfulSyncAt,
      syncInFlight
    }).catch((err) => {
      debugSync("auto-sync-error", { error: errorMessage(err) });
      setMessage("Sync could not run. Use Sync to retry.");
    });
  }, [viewer?.isAllowed, isOnline, pendingOperationCount, syncKick]);

  useEffect(() => {
    if (!viewer?.isAllowed || !isOnline || pendingOperationCount === 0) {
      return;
    }

    const id = window.setInterval(() => {
      debugSync("sync-retry-timer", { pendingOperationCount });
      setSyncKick((value) => value + 1);
    }, 15000);
    return () => window.clearInterval(id);
  }, [viewer?.isAllowed, isOnline, pendingOperationCount]);

  async function onManualSync() {
    setError("");
    setMessage("");

    if (!viewer?.isAllowed) {
      setError("Sign in with the allowed account before syncing.");
      return;
    }

    if (!isOnline) {
      setError("You are offline. Sync will be available when the connection returns.");
      return;
    }

    await syncPendingEntries({
      saveEntry,
      deleteEntry,
      setLocalEntries,
      setPendingOperationCount,
      setSyncing,
      setMessage,
      setLastSuccessfulSyncAt,
      syncInFlight,
      force: true
    }).catch((err) => {
      debugSync("manual-sync-error", { error: errorMessage(err) });
      setMessage("Sync failed. Try again.");
    });
  }

  function navigateTo(page: string) {
    setAppPage(page);
    if (typeof window !== "undefined") {
      window.location.hash = hashForAppPage(page);
    }
  }

  function updateReviewFilter(name: string, value: string) {
    setReviewFilters((filters) => ({ ...filters, [name]: value }));
  }

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setToast("");

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
    const priorBeenOnCount = visibleEntries.filter((entry) => entry.vehicleNumber === cleanNumber && normalizeObservationType(entry.observationType) === "been_on").length;
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
    setShowSaveDialog(false);
    setMessage(isOnline && viewer?.isAllowed ? "Saved locally. Syncing now." : "Saved on this device. It will sync when online.");
    if (priorBeenOnCount > 0) {
      setToast("You have been on vehicle " + cleanNumber + " before. " + priorBeenOnCount + " previous " + (priorBeenOnCount === 1 ? "save" : "saves") + ".");
    }
    setSyncKick((value) => value + 1);
  }

  async function onSaveEntryEdit(entry: LocalEntry) {
    await putLocalEntry(entry);
    await enqueueUpsertOperation(entry);
    await refreshLocalState(setLocalEntries, setPendingOperationCount);
    setEditEntry(null);
    setMessage(isOnline && viewer?.isAllowed ? "Updated locally. Syncing now." : "Updated on this device. It will sync when online.");
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
      <style>{DESIGN_SYSTEM_CSS + APP_CSS}</style>
      <section className="utility">
        <header className="topbar topbar-compact">
          <div className="rail-title" aria-hidden="true">
            <strong>Vehicle Tracker</strong>
            <span>Private field log</span>
          </div>
          <div className="topbar-status">
            <div className="session">
              <span className={isOnline ? "status-dot online" : "status-dot"} aria-hidden="true" />
              <span>{isOnline ? "Online" : "Offline"}</span>
            </div>
            <span className="sync-summary">{lastSyncText(lastSuccessfulSyncAt, syncing, pendingOperationCount )}</span>
            <span className="account-summary">{accountStatusText(auth.isLoading, viewer, canUseSaver, priorAuthorized)}</span>
          </div>
          <div className="topbar-actions">
            <button
              className="topbar-action"
              type="button"
              disabled={!canUseSaver || !isOnline || syncing}
              onClick={() => void onManualSync()}
            >
              {syncButtonLabel(syncing, pendingOperationCount )}
            </button>
            {!auth.isLoading && !auth.isGuest ? (
              <button className="topbar-action" type="button" onClick={() => signOut()}>
                Sign out
              </button>
            ) : canUseSaver && auth.isGuest ? (
              <SignInWithGoogle className="topbar-action" />
            ) : null}
          </div>
        </header>
        <PageTabs appPage={appPage} disabled={!canUseSaver} onNavigate={navigateTo} />

        <section className="workspace" aria-label="Vehicle Tracker workspace">
        {!canUseSaver ? (
          <AuthGate authLoading={auth.isLoading} viewer={viewer} isOnline={isOnline} priorAuthorized={priorAuthorized} cachedAccessAllowed={cachedAccessAllowed} />
        ) : appPage === "saves" ? (
          <>
            <section className="review-panel" aria-label="Saved trip entries">
              <div className="review-header">
                <div>
                  <h2>Saved Trip Entries</h2>
                  <p className="subtle">Filter recent saves without changing any data.</p>
                </div>
              </div>

              <div className="review-filters" aria-label="Review filters">
                <label>
                  <span>Vehicle</span>
                  <input
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="Any"
                    value={reviewFilters.vehicleNumber}
                    onInput={(event) => updateReviewFilter("vehicleNumber", event.currentTarget.value.replace(/\D/g, "").slice(0, 4))}
                  />
                </label>
                <label>
                  <span>Leg</span>
                  <select value={reviewFilters.leg} onChange={(event) => updateReviewFilter("leg", event.currentTarget.value)}>
                    <option value="all">All legs</option>
                    <option value="home">Home</option>
                    <option value="school">School</option>
                    <option value="no_leg">No leg</option>
                  </select>
                </label>
                <label>
                  <span>Line</span>
                  <select value={reviewFilters.line} onChange={(event) => updateReviewFilter("line", event.currentTarget.value)}>
                    <option value="all">All lines</option>
                    {allLineOptions.map((line) => (
                      <option key={line} value={line}>
                        {lineLabel(line)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Type</span>
                  <select value={reviewFilters.type} onChange={(event) => updateReviewFilter("type", event.currentTarget.value)}>
                    <option value="all">All types</option>
                    <option value="been_on">Been on</option>
                    <option value="seen">Seen</option>
                  </select>
                </label>
              </div>

              <div className="review-results">
                <span>
                  {reviewEntries.length} {reviewEntries.length === 1 ? "save" : "saves"}
                  {reviewEntries.length ? ` · page ${pagedReviewEntries.currentPage} of ${pagedReviewEntries.totalPages}` : ""}
                </span>
                <button className="secondary-button small-button" type="button" onClick={() => setReviewFilters(DEFAULT_REVIEW_FILTERS)}>
                  Clear filters
                </button>
              </div>

              {reviewEntries.length === 0 ? (
                <p className="empty-state">No Trip Entries match these filters.</p>
              ) : (
                <>
                  <ul className="entry-list review-list">
                    {pagedReviewEntries.entries.map((entry) => (
                      <EntryRow entry={entry} key={entry.clientEntryId} onDelete={onDelete} onEdit={setEditEntry} onShowMap={setMapEntry} />
                    ))}
                  </ul>
                  <nav className="pagination" aria-label="Saved entries pagination">
                    <button className="secondary-button small-button" type="button" disabled={pagedReviewEntries.currentPage <= 1} onClick={() => setReviewPage((page) => Math.max(1, page - 1))}>
                      Previous
                    </button>
                    <span>
                      {pagedReviewEntries.currentPage} / {pagedReviewEntries.totalPages}
                    </span>
                    <button className="secondary-button small-button" type="button" disabled={pagedReviewEntries.currentPage >= pagedReviewEntries.totalPages} onClick={() => setReviewPage((page) => page + 1)}>
                      Next
                    </button>
                  </nav>
                </>
              )}
            </section>
            {mapEntry ? <SavedLocationDialog entry={mapEntry} onClose={() => setMapEntry(null)} /> : null}
            {toast ? <Toast message={toast} onClose={() => setToast("")} /> : null}
            {editEntry ? (
              <EntryEditDialog
                entry={editEntry}
                lineCatalog={lineCatalog}
                lineOptions={allLineOptions}
                onClose={() => setEditEntry(null)}
                onDelete={onDelete}
                onSave={onSaveEntryEdit}
                onShowMap={(entry) => {
                  setEditEntry(null);
                  setMapEntry(entry);
                }}
              />
            ) : null}
          </>
        ) : (
          <>
            <section className="home-panel" aria-label="Vehicle tracker home">
              <div>
                <h2>Vehicle log</h2>
                <p className="subtle">Review what is already saved. Add a vehicle only when you need to capture a new one.</p>
              </div>
              <button
                className="primary-button compact-primary"
                type="button"
                onClick={() => {
                  setError("");
                  setMessage("");
                  setShowSaveDialog(true);
                }}
              >
                New save
              </button>
            </section>

            {message && !showSaveDialog ? <p className="message-text">{message}</p> : null}
            {error && !showSaveDialog ? <p className="error-text">{error}</p> : null}

            {showSaveDialog ? (
              <div className="modal-backdrop save-backdrop" role="presentation" onClick={() => setShowSaveDialog(false)}>
                <form className="save-panel save-dialog" role="dialog" aria-modal="true" aria-labelledby="new-save-title" onSubmit={(event) => void onSubmit(event)} onClick={(event) => event.stopPropagation()}>
                  <div className="save-dialog-header">
                    <div>
                      <h2 id="new-save-title">New vehicle save</h2>
                      <p className="subtle">Capture the number, type, leg, line, and current location.</p>
                    </div>
                    <button className="secondary-button small-button" type="button" onClick={() => setShowSaveDialog(false)}>
                      Close
                    </button>
                  </div>
              <div className="capture-layout">
                <section className="capture-card" aria-label="Vehicle capture">
                  <div className="field-row">
                    <label className="field-label" htmlFor="vehicle-number">
                      Vehicle number
                    </label>
                    <input
                      autoComplete="one-time-code"
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
                    <p className="field-label">Capture</p>
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
                </section>

                <section className="default-card" aria-label="Location and leg default">
                  <div className="location-row">
                    <div>
                      <p className="field-label">Default</p>
                      <p className="subtle">{locationText(location, currentClassification)}</p>
                    </div>
                    <button className="secondary-button" type="button" onClick={() => requestLocation(setLocation)}>
                      Refresh
                    </button>
                  </div>

                  <LocationPermissionWarning location={location} onRetry={() => requestLocation(setLocation)} />

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
                </section>
              </div>

              <section className="line-panel" aria-label="Vehicle line">
                <div className="section-heading compact">
                  <div>
                    <h2>Line</h2>
                    <p className="subtle">Pick one of the main lines or choose another TPG line.</p>
                  </div>
                  <span>{selectedLineInfo?.type || lineLabel(selectedLine)}</span>
                </div>

                <div className="main-line-grid" role="radiogroup" aria-label="Main lines">
                  {MAIN_LINE_VALUES.map((line) => {
                    const active = selectedLine === line;
                    return (
                      <button
                        className={active ? "line-swatch active" : "line-swatch"}
                        key={line}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        style={{
                          borderColor: lineColor(line, lineCatalog),
                          backgroundColor: "var(--surface)",
                          color: lineColor(line, lineCatalog)
                        }}
                        onClick={() => {
                          setLineTouched(true);
                          setShowOtherLine(false);
                          setSelectedLine(active ? "unclassified" : line);
                        }}
                      >
                        {line}
                      </button>
                    );
                  })}
                  <button
                    className={showOtherLine || (!selectedLineIsMain && selectedLine !== "unclassified") ? "other-line-button active" : "other-line-button"}
                    type="button"
                    aria-pressed={showOtherLine || (!selectedLineIsMain && selectedLine !== "unclassified")}
                    onClick={() => {
                      setLineTouched(true);
                      if (showOtherLine || (!selectedLineIsMain && selectedLine !== "unclassified")) {
                        setShowOtherLine(false);
                        setSelectedLine("unclassified");
                      } else {
                        setShowOtherLine(true);
                      }
                    }}
                  >
                    Other
                  </button>
                </div>

                {showOtherLine || (!selectedLineIsMain && selectedLine !== "unclassified") ? (
                  <div className="other-line-list" role="radiogroup" aria-label="Choose another line">
                    {otherLineOptions.map((line) => (
                      <OtherLineChip
                        active={selectedLine === line}
                        info={lineCatalog[line]}
                        key={line}
                        line={line}
                        onSelect={() => {
                          setLineTouched(true);
                          setSelectedLine(selectedLine === line ? "unclassified" : normalizeLine(line));
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </section>

              {error ? <p className="error-text">{error}</p> : null}
              {message ? <p className="message-text">{message}</p> : null}

              <button className="primary-button" type="submit">
                Save
              </button>
                </form>
              </div>
            ) : null}

            <section className="history-panel" aria-label="Recent saved entries">
              <div className="section-heading">
                <div>
                  <h2>Recent activity</h2>
                  <p className="subtle">Newest Trip Entries stay visible without opening the save form.</p>
                </div>
              </div>
              {visibleEntries.length === 0 ? (
                <p className="empty-state">No vehicles saved on this device yet.</p>
              ) : (
                <ul className="entry-list">
                  {visibleEntries.slice(0, 6).map((entry) => (
                    <EntryRow entry={entry} key={entry.clientEntryId} onDelete={onDelete} onEdit={setEditEntry} onShowMap={setMapEntry} />
                  ))}
                </ul>
              )}
            </section>
            {mapEntry ? <SavedLocationDialog entry={mapEntry} onClose={() => setMapEntry(null)} /> : null}
            {toast ? <Toast message={toast} onClose={() => setToast("")} /> : null}
            {editEntry ? (
              <EntryEditDialog
                entry={editEntry}
                lineCatalog={lineCatalog}
                lineOptions={allLineOptions}
                onClose={() => setEditEntry(null)}
                onDelete={onDelete}
                onSave={onSaveEntryEdit}
                onShowMap={(entry) => {
                  setEditEntry(null);
                  setMapEntry(entry);
                }}
              />
            ) : null}
          </>
        )}
        </section>
      </section>
    </main>
  );
}
