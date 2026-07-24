import { useEffect, useMemo, useState } from "preact/hooks";
import { classifyCapture, directionOptionsForLine, isValidVehicleNumber, normalizeDirection, normalizeLine, normalizeLocation, OBSERVATION_LABELS, OBSERVATION_VALUES } from "../shared/tram";
import { entryPoint, formatEntryDate, lineColor, lineForeground, savedTimeForEntry } from "./format";
import { DateRangeControl, SelectControl, SORT_FILTER_OPTIONS, STATUS_FILTER_OPTIONS } from "./filter-controls";
import { MapCnReviewMap } from "./map-ui";
import { CloseIcon, ConfirmDeleteDialog, Modal } from "./ui";
import type { LineInfo, LocalEntry, LocationState } from "./types";
import SortableList from "./vendor/react-movable/List";
import { arrayMove } from "./vendor/react-movable/utils";

export type EntryFormValue = {
  vehicleNumber: string;
  observationType: string;
  savedLine: string;
  savedLeg: string;
  nearestStopName: string;
};

export function EntryDialog({
  mode, entry, initialValue, location, lineCatalog, defaultLines, busy, error, onClose, onSubmit
}: {
  mode: "create" | "edit";
  entry?: LocalEntry | null;
  initialValue?: Partial<EntryFormValue>;
  location: LocationState;
  lineCatalog: Record<string, LineInfo>;
  defaultLines: string[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (value: EntryFormValue) => void;
}) {
  const initialLine = entry ? normalizeLine(entry.savedLine) : normalizeLine(initialValue?.savedLine);
  const initialDirections = initialLine ? knownDirections(initialLine) : [];
  const initialDirection = entry ? normalizeDirection(entry.savedLeg, initialLine) : initialValue?.savedLeg ? normalizeDirection(initialValue.savedLeg, initialLine) : "";
  const initialCustom = initialDirection && !initialDirections.includes(initialDirection) ? initialDirection : "";
  const [vehicleNumber, setVehicleNumber] = useState(entry?.vehicleNumber ?? initialValue?.vehicleNumber ?? "");
  const [observationType, setObservationType] = useState(entry?.observationType ?? initialValue?.observationType ?? "been_on");
  const [savedLine, setSavedLine] = useState(initialLine === "unclassified" ? "" : initialLine);
  const [savedLeg, setSavedLeg] = useState(initialCustom ? "other" : initialDirection);
  const [customDirection, setCustomDirection] = useState(initialCustom);
  const [nearestStopName, setNearestStopName] = useState(entry?.nearestStopName ?? initialValue?.nearestStopName ?? "");
  const [stopLookupMessage, setStopLookupMessage] = useState("");
  const [linePickerOpen, setLinePickerOpen] = useState(false);
  const directions = useMemo(() => savedLine ? knownDirections(savedLine) : [], [savedLine]);
  const locationPoint = mode === "create" && location.status === "captured"
    ? normalizeLocation({ lat: location.lat, lon: location.lon })
    : null;
  const validDirection = savedLeg === "other" ? customDirection.trim() : savedLeg;
  const canSubmit = isValidVehicleNumber(vehicleNumber) && Boolean(savedLine && lineCatalog[savedLine] && validDirection && !busy && (mode === "edit" || locationPoint));
  const customLineSelected = Boolean(savedLine && !defaultLines.includes(savedLine));
  const customLineStyle = customLineSelected ? {
    background: lineColor(savedLine, lineCatalog),
    borderColor: lineColor(savedLine, lineCatalog),
    color: lineForeground(savedLine, lineCatalog)
  } : undefined;

  useEffect(() => {
    if (savedLeg !== "other" && !directions.includes(savedLeg)) setSavedLeg("");
  }, [savedLine, directions, savedLeg]);

  const title = mode === "create" ? "Create saved entry" : "Edit saved entry";
  const subtitle = mode === "create"
    ? "Choose a vehicle, line, and direction."
    : `Vehicle ${entry?.vehicleNumber || ""} · Saved ${formatEntryDate(savedTimeForEntry(entry!))}`;

  function findNearestStop() {
    if (!locationPoint) return;
    const stop = classifyCapture(locationPoint, new Date().toISOString()).nearestStopName;
    if (stop) setNearestStopName(stop);
    setStopLookupMessage(stop ? "Nearest stop selected." : "No nearby stop found.");
  }

  return <>
    <Modal title={title} subtitle={subtitle} onClose={onClose} className="entry-modal" footer={<>
      <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
      <button className="button primary" type="button" disabled={!canSubmit} onClick={() => onSubmit({
        vehicleNumber: vehicleNumber.trim(),
        observationType,
        savedLine,
        savedLeg: savedLeg === "other" ? customDirection.trim() : savedLeg,
        nearestStopName: nearestStopName.trim()
      })}>{busy ? "Saving…" : mode === "create" ? "Create entry" : "Save changes"}</button>
    </>}>
      <div className="entry-form">
        <label className="field"><span>Vehicle number</span><input autoFocus name="vehicleNumber" inputMode="numeric" maxLength={4} value={vehicleNumber} placeholder="e.g. 881" onInput={(event) => setVehicleNumber(event.currentTarget.value.replace(/\D/g, "").slice(0, 4))} /></label>

        <fieldset className="choice-field"><legend>Observation</legend><div className="choice-row two-up">{OBSERVATION_VALUES.map((value) => <button className={`choice-pill ${observationType === value ? "selected" : ""}`} type="button" role="radio" aria-checked={observationType === value} onClick={() => setObservationType(value)}>{OBSERVATION_LABELS[value]}</button>)}</div></fieldset>

        <fieldset className="choice-field"><legend>Line</legend><div className="line-choice-row"><div className="default-line-choices">{defaultLines.map((line) => <LineChoice key={line} line={line} active={savedLine === line} catalog={lineCatalog} onClick={() => setSavedLine(line)} />)}</div><button className={`choice-pill other-choice ${customLineSelected ? "selected" : ""}`} style={customLineStyle} type="button" onClick={() => setLinePickerOpen(true)}><MoreIcon />{customLineSelected ? `Other · ${savedLine}` : "Other"}</button></div></fieldset>

        <fieldset className="choice-field"><legend>Direction</legend><div className="choice-row direction-row">{directions.map((direction) => <button className={`choice-pill ${savedLeg === direction ? "selected" : ""}`} type="button" role="radio" aria-checked={savedLeg === direction} onClick={() => setSavedLeg(direction)}>{direction}</button>)}<button className={`choice-pill other-choice ${savedLeg === "other" ? "selected" : ""}`} type="button" role="radio" aria-checked={savedLeg === "other"} onClick={() => setSavedLeg("other")}><MoreIcon />Other</button></div></fieldset>

        {savedLeg === "other" ? <label className="field"><span>Custom direction</span><input name="customDirection" value={customDirection} placeholder="Enter custom direction" onInput={(event) => setCustomDirection(event.currentTarget.value.slice(0, 80))} /></label> : null}

        <label className="field"><span>Stop saved</span><span className={mode === "create" ? "location-row" : ""}><input name="nearestStopName" value={nearestStopName} maxLength={120} placeholder="Enter a stop" onInput={(event) => { setNearestStopName(event.currentTarget.value); setStopLookupMessage(""); }} />{mode === "create" ? <button className="location-button" type="button" aria-label="Auto-fill nearest stop" title="Auto-fill nearest stop" disabled={!locationPoint} onClick={findNearestStop}><LocationIcon /></button> : null}</span>{mode === "create" ? <small className="location-status">{stopLookupMessage}</small> : null}</label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </div>
    </Modal>
    {linePickerOpen ? <LinePickerDialog selected={savedLine} exclude={defaultLines} lineCatalog={lineCatalog} onClose={() => setLinePickerOpen(false)} onSelect={(line) => { setSavedLine(line); setLinePickerOpen(false); }} /> : null}
  </>;
}

export function EntryDetailsDialog({ entry, lineCatalog, onClose, onEdit, onDelete }: {
  entry: LocalEntry;
  lineCatalog: Record<string, LineInfo>;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return <>
    <Modal title="Saved entry details" subtitle={`Vehicle ${entry.vehicleNumber} · Saved ${formatEntryDate(savedTimeForEntry(entry))}`} onClose={onClose} className="details-modal" footer={<>
      <button className="button secondary" type="button" onClick={onEdit}>Edit</button>
      <button className="button danger-outline" type="button" onClick={() => setConfirming(true)}>Delete</button>
    </>}>
      <div className="details-map"><MapCnReviewMap point={entryPoint(entry)} /></div>
      <dl className="details-grid">
        <Detail label="Observation" value={OBSERVATION_LABELS[entry.observationType] || "Saved"} />
        <Detail label="Line" value={entry.savedLine === "unclassified" ? "No line" : entry.savedLine} />
        <Detail label="Direction" value={entry.savedLeg === "unclassified" ? "No direction" : entry.savedLeg} />
        <Detail label="Stop saved" value={entry.nearestStopName || "No saved stop"} />
      </dl>
    </Modal>
    {confirming ? <ConfirmDeleteDialog vehicleNumber={entry.vehicleNumber} onCancel={() => setConfirming(false)} onConfirm={onDelete} /> : null}
  </>;
}

export function LinePickerDialog({ selected, exclude = [], lineCatalog, onClose, onSelect }: {
  selected: string;
  exclude?: string[];
  lineCatalog: Record<string, LineInfo>;
  onClose: () => void;
  onSelect: (line: string) => void;
}) {
  const excluded = new Set(exclude);
  const lines = Object.keys(lineCatalog).filter((line) => !excluded.has(line)).sort(compareLines);
  return <Modal title="Choose line" subtitle={`${lines.length} transit lines`} onClose={onClose} className="line-picker-modal">
    <div className="line-picker-grid">{lines.map((line) => <LineChoice key={line} line={line} active={selected === line} inverse catalog={lineCatalog} onClick={() => onSelect(line)} />)}</div>
  </Modal>;
}

export function SettingsDialog({ defaultLines, lineCatalog, busy, syncing, lastSyncLabel, onClose, onSave, onSync, onSignOut }: {
  defaultLines: string[];
  lineCatalog: Record<string, LineInfo>;
  busy: boolean;
  syncing: boolean;
  lastSyncLabel: string;
  onClose: () => void;
  onSave: (lines: string[]) => void;
  onSync: () => void;
  onSignOut: () => void;
}) {
  const [draft, setDraft] = useState([...defaultLines]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const duplicate = new Set(draft).size !== draft.length;
  return <>
    <Modal title="Default lines" subtitle={`${Object.keys(lineCatalog).length} lines available. Choose up to four quick-access lines.`} onClose={onClose} className="settings-modal" footer={<>
      <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
      <button className="button primary" type="button" disabled={busy || duplicate} onClick={() => onSave(draft)}>{busy ? "Saving…" : "Save defaults"}</button>
    </>}>
      <SortableList
        values={draft}
        lockVertically
        transitionDuration={window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200}
        onChange={({ oldIndex, newIndex }) => setDraft((current) => arrayMove(current, oldIndex, newIndex))}
        renderList={({ children, props }) => <div className="default-line-list" {...props}>{children}</div>}
        renderItem={({ value: line, index, isDragged, props }) => {
          const rowIndex = index ?? draft.indexOf(line);
          return <div {...props} className={`default-line-row ${isDragged ? "dragging" : ""}`} key={line}>
            <button className="drag-handle" data-movable-handle type="button" aria-label={`Drag line ${line} to reorder`}><DragHandleIcon /></button>
            <LineChoice line={line} active catalog={lineCatalog} onClick={() => setEditingIndex(rowIndex)} />
            <button className="button secondary compact" type="button" onClick={() => setEditingIndex(rowIndex)}>Change</button>
            <button className="icon-button remove-line" type="button" aria-label={`Remove line ${line}`} onClick={() => setDraft((current) => current.filter((_, itemIndex) => itemIndex !== rowIndex))}><CloseIcon /></button>
          </div>;
        }}
      />
      {draft.length < 4 ? <button className="button secondary add-line" type="button" onClick={() => setEditingIndex(draft.length)}>Add line</button> : null}
      {duplicate ? <p className="form-error">Default lines must be unique.</p> : null}
      <section className="settings-account" aria-label="Account and sync">
        <div><strong>Account</strong><p>{lastSyncLabel}</p></div>
        <div className="settings-account-actions">
          <button className="button secondary compact" type="button" disabled={syncing} onClick={onSync}>{syncing ? "Syncing…" : "Sync now"}</button>
          <button className="button secondary compact" type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </section>
    </Modal>
    {editingIndex !== null ? <LinePickerDialog selected={draft[editingIndex] || ""} lineCatalog={lineCatalog} onClose={() => setEditingIndex(null)} onSelect={(line) => {
      const next = [...draft];
      if (editingIndex === next.length) next.push(line); else next[editingIndex] = line;
      setDraft(next);
      setEditingIndex(null);
    }} /> : null}
  </>;
}

export function FiltersDialog({ filters, lineCatalog, onClose, onApply }: {
  filters: { query: string; line: string; type: string; dateFrom: string; dateTo: string; sort: string };
  lineCatalog: Record<string, LineInfo>;
  onClose: () => void;
  onApply: (filters: typeof filters) => void;
}) {
  const [draft, setDraft] = useState({ ...filters });
  const lineOptions = [
    { value: "all", label: "Any line" },
    ...Object.keys(lineCatalog).sort(compareLines).map((line) => ({
      value: line,
      label: lineModeLabel(line, lineCatalog),
      badge: { text: line, background: lineColor(line, lineCatalog), color: lineForeground(line, lineCatalog) }
    }))
  ];
  return <Modal title="Filters and sort" onClose={onClose} className="filters-modal" footer={<>
    <button className="button secondary" type="button" onClick={() => setDraft({ ...draft, line: "all", type: "all", dateFrom: "", dateTo: "", sort: "newest" })}>Clear</button>
    <button className="button primary" type="button" onClick={() => onApply(draft)}>Show results</button>
  </>}>
    <div className="filter-dialog-grid">
      <SelectControl label="Line" value={draft.line} options={lineOptions} onChange={(line) => setDraft({ ...draft, line })} />
      <SelectControl label="Status" value={draft.type} options={STATUS_FILTER_OPTIONS} onChange={(type) => setDraft({ ...draft, type })} />
      <DateRangeControl from={draft.dateFrom} to={draft.dateTo} onChange={(dateFrom, dateTo) => setDraft({ ...draft, dateFrom, dateTo })} />
      <div className="full"><SelectControl label="Sort" value={draft.sort} options={SORT_FILTER_OPTIONS} onChange={(sort) => setDraft({ ...draft, sort })} /></div>
    </div>
  </Modal>;
}

function LineChoice({ line, active, inverse = false, catalog, onClick }: { line: string; active: boolean; inverse?: boolean; catalog: Record<string, LineInfo>; onClick: () => void }) {
  const color = lineColor(line, catalog);
  const solid = inverse ? !active : active;
  return <button className={`line-choice ${active ? "selected" : ""}`} style={{ borderColor: color, background: solid ? color : "var(--color-surface)", color: solid ? lineForeground(line, catalog) : color }} type="button" role="radio" aria-checked={active} onClick={onClick}>{line}</button>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function knownDirections(line: string) {
  return directionOptionsForLine(line).filter((direction) => direction !== "unclassified");
}

function compareLines(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function lineModeLabel(line: string, catalog: Record<string, LineInfo>) {
  const type = String(catalog[line]?.type || "Transit").toLowerCase();
  return type.includes("tram") ? "Tram" : type.includes("bus") ? "Bus" : "Transit";
}

function MoreIcon() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12Z"/><path d="M13.3 12a1.3 1.3 0 1 1-2.6 0 1.3 1.3 0 0 1 2.6 0Zm4 0a1.3 1.3 0 1 1-2.6 0 1.3 1.3 0 0 1 2.6 0Zm-8 0a1.3 1.3 0 1 1-2.6 0 1.3 1.3 0 0 1 2.6 0Z"/></svg>;
}

function DragHandleIcon() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><circle cx="7" cy="5" r="1.4"/><circle cx="13" cy="5" r="1.4"/><circle cx="7" cy="10" r="1.4"/><circle cx="13" cy="10" r="1.4"/><circle cx="7" cy="15" r="1.4"/><circle cx="13" cy="15" r="1.4"/></svg>;
}

function LocationIcon() {
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></svg>;
}
