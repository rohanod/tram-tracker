import { useEffect, useMemo, useState } from "preact/hooks";
import { classifyCapture, isInGenevaBounds, LEG_LABELS, MAIN_LINE_VALUES, OBSERVATION_LABELS, legValuesForCapturedAt, normalizeLeg, normalizeLine, normalizeLocation, normalizeObservationType } from "../shared/tram";
import { entryPoint, formatEntryDate, legOptionsForEntry, lineColor, lineLabel, parsePointFromText, savedLegForEntry, savedTimeForEntry, statusLabel, syncLabel } from "./format";
import { MapCnReviewMap } from "./map-ui";
import { ConfirmDeleteDialog } from "./ui";
import type { LineInfo, LocalEntry, MapPoint } from "./types";

export function EntryRow({
  entry,
  onEdit,
  onShowMap,
  onDelete
}: {
  entry: LocalEntry;
  onEdit: (entry: LocalEntry) => void;
  onShowMap: (entry: LocalEntry) => void;
  onDelete: (entry: LocalEntry) => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const savedLeg = normalizeLeg(entry.savedLeg);
  const savedLine = normalizeLine(entry.savedLine);
  const observation = normalizeObservationType(entry.observationType);
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
      <div className="entry-summary-grid">
        <div>
          <span>Leg</span>
          <strong>{LEG_LABELS[savedLeg as keyof typeof LEG_LABELS]}</strong>
        </div>
        <div>
          <span>Line</span>
          <strong>{lineLabel(savedLine)}</strong>
        </div>
      </div>
      <div className="entry-actions">
        <button type="button" onClick={() => onEdit(entry)}>
          Edit
        </button>
        <button type="button" disabled={!hasSavedLocation} onClick={() => onShowMap(entry)}>
          Show map
        </button>
        <button type="button" onClick={() => setConfirmDelete(true)}>
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
      {confirmDelete ? (
        <ConfirmDeleteDialog
          title="Delete save"
          body={"Delete vehicle " + entry.vehicleNumber + "? This removes it from this device and syncs the deletion."}
          confirmLabel="Delete save"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void onDelete(entry)}
        />
      ) : null}
    </li>
  );
}

export function EntryEditDialog({
  entry,
  lineCatalog,
  lineOptions,
  onClose,
  onDelete,
  onSave,
  onShowMap
}: {
  entry: LocalEntry;
  lineCatalog: Record<string, LineInfo>;
  lineOptions: string[];
  onClose: () => void;
  onDelete: (entry: LocalEntry) => Promise<void>;
  onSave: (entry: LocalEntry) => Promise<void>;
  onShowMap: (entry: LocalEntry) => void;
}) {
  const [draftLeg, setDraftLeg] = useState(normalizeLeg(entry.savedLeg));
  const [draftLine, setDraftLine] = useState(normalizeLine(entry.savedLine));
  const [latText, setLatText] = useState(entry.lat);
  const [lonText, setLonText] = useState(entry.lon);
  const [showOtherLine, setShowOtherLine] = useState(!MAIN_LINE_VALUES.includes(normalizeLine(entry.savedLine)) && normalizeLine(entry.savedLine) !== "unclassified");
  const [dialogError, setDialogError] = useState("");
  const [locationMessage, setLocationMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showLocationMap, setShowLocationMap] = useState(false);
  const savedPoint = entryPoint(entry);
  const editablePoint = parsePointFromText(latText, lonText);
  const draftLineIsMain = MAIN_LINE_VALUES.includes(draftLine);
  const otherActive = showOtherLine || (!draftLineIsMain && draftLine !== "unclassified");
  const legOptions = legOptionsForEntry(entry, draftLeg);
  const otherLineOptions = lineOptions.filter((line) => !MAIN_LINE_VALUES.includes(line) && line !== "unclassified");

  useEffect(() => {
    if (!draftLineIsMain && draftLine !== "unclassified") {
      setShowOtherLine(true);
    }
  }, [draftLine, draftLineIsMain]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function clearLocation() {
    setLatText("");
    setLonText("");
    setShowLocationMap(false);
    setLocationMessage("Location will be cleared when saved.");
  }

  function useCurrentLocation() {
    setDialogError("");
    setLocationMessage("Checking current position.");
    if (!navigator.geolocation) {
      setDialogError("Location is not available on this device.");
      setLocationMessage("");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = normalizeLocation({ lat: position.coords.latitude, lon: position.coords.longitude });
        if (!point) {
          setDialogError("Could not read a valid current location.");
          setLocationMessage("");
          return;
        }
        setLatText(point.lat.toFixed(4));
        setLonText(point.lon.toFixed(4));
        setShowLocationMap(true);
        setLocationMessage("Current location loaded. Save to apply it.");
      },
      () => {
        setDialogError("Could not get current location. Check permission and try again.");
        setLocationMessage("");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 9000 }
    );
  }

  function buildUpdatedEntry() {
    const rawLat = latText.trim();
    const rawLon = lonText.trim();
    if (!rawLat && !rawLon) {
      const classification = classifyCapture(null, entry.capturedAt);
      return {
        ...entry,
        lat: "",
        lon: "",
        locationStatus: "unavailable",
        classificationStatus: classification.status,
        inferredLeg: classification.suggestedLeg,
        savedLeg: normalizeLeg(draftLeg),
        inferredLine: classification.suggestedLine,
        savedLine: normalizeLine(draftLine),
        routeGroup: classification.routeGroup,
        distanceMeters: classification.distanceMeters,
        nearestStopName: classification.nearestStopName,
        syncStatus: "pending",
        lastError: "",
        updatedAt: new Date().toISOString()
      } satisfies LocalEntry;
    }

    const lat = Number(rawLat);
    const lon = Number(rawLon);
    const point = normalizeLocation({ lat, lon });
    if (!point) {
      return null;
    }

    const classification = classifyCapture(point, entry.capturedAt);
    return {
      ...entry,
      lat: point.lat.toFixed(4),
      lon: point.lon.toFixed(4),
      locationStatus: "captured",
      classificationStatus: classification.status,
      inferredLeg: classification.suggestedLeg,
      savedLeg: normalizeLeg(draftLeg),
      inferredLine: classification.suggestedLine,
      savedLine: normalizeLine(draftLine),
      routeGroup: classification.routeGroup,
      distanceMeters: classification.distanceMeters,
      nearestStopName: classification.nearestStopName,
      syncStatus: "pending",
      lastError: "",
      updatedAt: new Date().toISOString()
    } satisfies LocalEntry;
  }

  async function submitEdit(event: SubmitEvent) {
    event.preventDefault();
    setDialogError("");
    const updated = buildUpdatedEntry();
    if (!updated) {
      setDialogError("Enter both latitude and longitude, or clear both fields.");
      return;
    }
    await onSave(updated);
  }

  function setLocationFromMap(point: MapPoint) {
    const normalized = normalizeLocation(point);
    if (!normalized || !isInGenevaBounds(normalized)) {
      setDialogError("Choose a point inside Geneva.");
      return;
    }
    setDialogError("");
    setLatText(normalized.lat.toFixed(4));
    setLonText(normalized.lon.toFixed(4));
    setLocationMessage("Map location selected. Save to apply it.");
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form className="edit-dialog" role="dialog" aria-modal="true" aria-labelledby="entry-edit-title" onSubmit={(event) => void submitEdit(event)} onClick={(event) => event.stopPropagation()}>
        <div className="edit-dialog-header">
          <div>
            <h2 id="entry-edit-title">Edit save</h2>
            <p className="subtle">
              {entry.vehicleNumber} · {formatEntryDate(savedTimeForEntry(entry))}
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <section className="edit-section">
          <p className="field-label">Leg</p>
          <div className="entry-leg-grid" role="radiogroup" aria-label={"Leg for vehicle " + entry.vehicleNumber}>
            {legOptions.map((leg) => {
              const active = draftLeg === leg;
              return (
                <button className={active ? "entry-leg-option active" : "entry-leg-option"} key={leg} type="button" role="radio" aria-checked={active} onClick={() => setDraftLeg(leg)}>
                  {LEG_LABELS[leg as keyof typeof LEG_LABELS]}
                </button>
              );
            })}
          </div>
        </section>

        <section className="edit-section">
          <p className="field-label">Line</p>
          <div className="entry-line-grid" role="radiogroup" aria-label={"Line for vehicle " + entry.vehicleNumber}>
            {MAIN_LINE_VALUES.map((line) => {
              const active = draftLine === line;
              return (
                <button
                  className={active ? "entry-line-option active" : "entry-line-option"}
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
                    setShowOtherLine(false);
                    setDraftLine(active ? "unclassified" : line);
                  }}
                >
                  {line}
                </button>
              );
            })}
            <button
              className={otherActive ? "entry-other-line-button active" : "entry-other-line-button"}
              type="button"
              aria-pressed={otherActive}
              onClick={() => {
                if (otherActive) {
                  setShowOtherLine(false);
                  setDraftLine("unclassified");
                } else {
                  setShowOtherLine(true);
                }
              }}
            >
              Other
            </button>
          </div>
          {otherActive ? (
            <div className="entry-other-lines" role="radiogroup" aria-label={"Choose another line for vehicle " + entry.vehicleNumber}>
              {otherLineOptions.map((line) => (
                <OtherLineChip
                  active={draftLine === line}
                  info={lineCatalog[line]}
                  key={line}
                  line={line}
                  onSelect={() => {
                    setShowOtherLine(true);
                    setDraftLine(draftLine === line ? "unclassified" : normalizeLine(line));
                  }}
                />
              ))}
            </div>
          ) : null}
        </section>

        <section className="edit-section">
          <div className="edit-section-heading">
            <div>
              <p className="field-label">Location</p>
              <p className="subtle">{savedPoint ? "Saved at " + entry.lat + ", " + entry.lon : "No location saved."}</p>
            </div>
            <button className="secondary-button small-button" type="button" onClick={useCurrentLocation}>
              Use current
            </button>
          </div>
          <div className="coordinate-grid">
            <label>
              <span>Latitude</span>
              <input inputMode="decimal" value={latText} onInput={(event) => setLatText(event.currentTarget.value)} />
            </label>
            <label>
              <span>Longitude</span>
              <input inputMode="decimal" value={lonText} onInput={(event) => setLonText(event.currentTarget.value)} />
            </label>
          </div>
          <div className="edit-inline-actions">
            <button className="secondary-button small-button" type="button" onClick={clearLocation}>
              Clear location
            </button>
            <button className="secondary-button small-button" type="button" onClick={() => setShowLocationMap((visible) => !visible)}>
              {showLocationMap ? "Hide map" : "Edit on map"}
            </button>
            <button className="secondary-button small-button" type="button" disabled={!savedPoint} onClick={() => onShowMap(entry)}>
              Show map
            </button>
          </div>
          {showLocationMap ? (
            <div className="location-edit-map">
              <MapCnReviewMap editable point={editablePoint} onPointChange={setLocationFromMap} />
              <p className="subtle">Tap or drag inside Geneva to move the saved location.</p>
            </div>
          ) : null}
          {locationMessage ? <p className="message-text compact-message">{locationMessage}</p> : null}
          {dialogError ? <p className="error-text compact-message">{dialogError}</p> : null}
        </section>

        <div className="edit-primary-actions">
          <button className="primary-button" type="submit">
            Save changes
          </button>
        </div>

        <section className="danger-zone">
          <div>
            <p className="danger-title">Delete this save</p>
            <p className="subtle">Removes vehicle {entry.vehicleNumber} from this device and syncs the deletion.</p>
          </div>
          <button className="danger-button" type="button" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        </section>
        {confirmDelete ? (
          <ConfirmDeleteDialog
            title="Delete save"
            body={"Delete vehicle " + entry.vehicleNumber + "? This removes it from this device and syncs the deletion."}
            confirmLabel="Delete save"
            onCancel={() => setConfirmDelete(false)}
            onConfirm={() => void onDelete(entry).then(onClose)}
          />
        ) : null}
      </form>
    </div>
  );
}



export function OtherLineChip({ active, info, line, onSelect }: { active: boolean; info?: LineInfo; line: string; onSelect: () => void }) {
  const color = info?.color ?? lineColor(line);

  return (
    <button
      className={active ? "other-line-chip active" : "other-line-chip"}
      type="button"
      role="radio"
      aria-checked={active}
      style={{
        borderColor: color,
        backgroundColor: "var(--surface)",
        color
      }}
      onClick={onSelect}
    >
      <strong>{line}</strong>
      <span>{info?.type ?? "TPG"}</span>
    </button>
  );
}

export function SavedLocationDialog({ entry, onClose }: { entry: LocalEntry; onClose: () => void }) {
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
            <dd>{lineLabel(entry.savedLine)}</dd>
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
