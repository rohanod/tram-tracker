import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { paginateReviewEntries, reviewTripEntries, vehicleFrequencyStats } from "../shared/review";
import { DateRangeControl, SelectControl, SORT_FILTER_OPTIONS, STATUS_FILTER_OPTIONS } from "./filter-controls";
import { formatEntryDate, lineColor, lineForeground, savedTimeForEntry } from "./format";
import { SearchIcon, SettingsIcon } from "./ui";
import type { LineInfo, LocalEntry, LocalVehicleNote } from "./types";

export type ReviewFilters = { query: string; line: string; type: string; dateFrom: string; dateTo: string; sort: string };

export function TrackerScreen({
  entries, vehicleNotes, filters, lineCatalog, isOnline, isLoading, loadError, lastSyncLabel, pendingCount,
  onChangeFilters, onNew, onOpen, onOpenFilters, onOpenSettings, onRetry
}: {
  entries: LocalEntry[];
  vehicleNotes: ReadonlyMap<string, LocalVehicleNote>;
  filters: ReviewFilters;
  lineCatalog: Record<string, LineInfo>;
  isOnline: boolean;
  isLoading: boolean;
  loadError: string;
  lastSyncLabel: string;
  pendingCount: number;
  onChangeFilters: (filters: ReviewFilters) => void;
  onNew: () => void;
  onOpen: (entry: LocalEntry) => void;
  onOpenFilters: () => void;
  onOpenSettings: () => void;
  onRetry: () => void;
}) {
  const [page, setPage] = useState(1);
  const [compactHeight, setCompactHeight] = useState(() => typeof window !== "undefined" && window.innerHeight <= 700);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 900);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const resize = () => { setCompactHeight(window.innerHeight <= 700); setIsMobile(window.innerWidth < 900); };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || target?.matches("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
  const filtered = useMemo(() => reviewTripEntries(entries, filters), [entries, filters]);
  const stats = useMemo(() => vehicleFrequencyStats(entries), [entries]);
  const desktopPage = useMemo(() => paginateReviewEntries(filtered, page, 25), [filtered, page]);
  const mobilePage = useMemo(() => paginateReviewEntries(filtered, page, compactHeight ? 3 : 4), [filtered, page, compactHeight]);
  useEffect(() => setPage(1), [filters.query, filters.line, filters.type, filters.dateFrom, filters.dateTo, filters.sort]);
  useEffect(() => {
    const next = isMobile ? mobilePage.currentPage : desktopPage.currentPage;
    if (page !== next) setPage(next);
  }, [desktopPage.currentPage, mobilePage.currentPage, isMobile, page]);

  return (
    <main className="tracker-page">
      <section className="tracker-shell">
        <header className="app-header">
          <div className="brand-block">
            <strong>Vehicle Tracker</strong>
            <div className="status-line" aria-live="polite">
              <span>{isOnline ? "Online" : "Offline"}</span><span>·</span><span>{pendingCount ? `${pendingCount} pending` : lastSyncLabel}</span>
            </div>
          </div>
          <div className="header-actions">
            <button className="button secondary settings-button" type="button" aria-label="Settings" onClick={onOpenSettings}><SettingsIcon /><span>Settings</span></button>
            <button className="button primary save-new" type="button" onClick={onNew}>Save new</button>
          </div>
        </header>

        <section className="search-section">
          <div className="search-copy"><h1><span className="desktop-title">Search vehicles</span><span className="mobile-title">Search</span></h1><p>Results update as you type.</p></div>
          <div className="search-and-stats">
            <label className="search-field"><SearchIcon /><span className="sr-only">Search vehicles</span><input ref={searchRef} name="vehicle-search" value={filters.query} placeholder="Vehicle, line, direction, place…" onInput={(event) => onChangeFilters({ ...filters, query: event.currentTarget.value })} /><kbd aria-hidden="true">/</kbd></label>
            <StatTile label="Most common" stat={stats.most} />
            <StatTile label="Least common" stat={stats.least} />
          </div>
          <div className="filter-row desktop-filters">
            <FilterControls filters={filters} lineCatalog={lineCatalog} onChange={onChangeFilters} />
            <span className="result-count">{filtered.length} {filtered.length === 1 ? "entry" : "entries"}</span>
          </div>
          <div className="filter-row mobile-filters">
            <button className="button secondary filter-trigger" type="button" onClick={onOpenFilters}>Filters <ChevronDown /></button>
            <SelectControl compact label="Sort" value={filters.sort} options={SORT_FILTER_OPTIONS} onChange={(sort) => onChangeFilters({ ...filters, sort })} />
            <span className="result-count">{rangeText(mobilePage)}</span>
          </div>
        </section>

        {!isOnline && entries.length ? <div className="offline-banner">Showing saved offline data</div> : null}

        <section className="results-panel" aria-live="polite" aria-busy={isLoading}>
          {loadError && !entries.length ? <SystemState title="Couldn’t load vehicles" body={loadError} action="Retry" onAction={onRetry} /> :
            isLoading && !entries.length ? <LoadingRows /> :
            !filtered.length ? <SystemState title={entries.length ? "No matching vehicles" : "No saved vehicles"} body={entries.length ? "Try a different search or filter." : "Use Save new to add the first entry."} /> : (
              <>
                <div className="table-wrap">
                  <div className="table-heading"><h2>Recent vehicles</h2><span>{rangeText(desktopPage)}</span></div>
                  <table className="vehicle-table"><thead><tr><th>Vehicle</th><th>Line</th><th>Journey</th><th>Saved</th></tr></thead><tbody>{desktopPage.entries.map((entry) => <DesktopRow entry={entry} key={entry.clientEntryId} hasNote={vehicleNotes.has(entry.vehicleNumber)} lineCatalog={lineCatalog} onOpen={onOpen} />)}</tbody></table>
                </div>
                <div className="mobile-card-list">{mobilePage.entries.map((entry) => <MobileCard entry={entry} key={entry.clientEntryId} hasNote={vehicleNotes.has(entry.vehicleNumber)} lineCatalog={lineCatalog} onOpen={onOpen} />)}</div>
                <div className="desktop-pagination"><Pagination page={desktopPage.currentPage} totalPages={desktopPage.totalPages} onPage={setPage} /></div>
                <div className="mobile-pagination"><Pagination page={mobilePage.currentPage} totalPages={mobilePage.totalPages} onPage={setPage} /></div>
              </>
            )}
        </section>
      </section>
    </main>
  );
}

export function FilterControls({ filters, lineCatalog, onChange }: { filters: ReviewFilters; lineCatalog: Record<string, LineInfo>; onChange: (filters: ReviewFilters) => void }) {
  const lineOptions = [
    { value: "all", label: "Any" },
    ...Object.keys(lineCatalog).sort(compareLines).map((line) => ({
      value: line,
      label: lineOptionLabel(line, lineCatalog),
      badge: { text: line, background: lineColor(line, lineCatalog), color: lineForeground(line, lineCatalog) }
    }))
  ];
  return <>
    <SelectControl label="Line" value={filters.line} options={lineOptions} onChange={(line) => onChange({ ...filters, line })} />
    <DateRangeControl from={filters.dateFrom} to={filters.dateTo} onChange={(dateFrom, dateTo) => onChange({ ...filters, dateFrom, dateTo })} />
    <SelectControl label="Status" value={filters.type} options={STATUS_FILTER_OPTIONS} onChange={(type) => onChange({ ...filters, type })} />
    <SelectControl label="Sort" value={filters.sort} options={SORT_FILTER_OPTIONS} onChange={(sort) => onChange({ ...filters, sort })} />
  </>;
}

function StatTile({ label, stat }: { label: string; stat: { vehicleNumber: string; count: number } | null }) {
  return <div className="stat-tile"><span>{label}</span><div><strong>{stat?.vehicleNumber || "—"}</strong><small>{stat ? `${stat.count} ${stat.count === 1 ? "save" : "saves"}` : "No saves"}</small></div></div>;
}

function DesktopRow({ entry, hasNote, lineCatalog, onOpen }: { entry: LocalEntry; hasNote: boolean; lineCatalog: Record<string, LineInfo>; onOpen: (entry: LocalEntry) => void }) {
  const direction = entry.savedLeg === "unclassified" ? "No direction" : entry.savedLeg;
  return <tr onDblClick={() => onOpen(entry)}>
    <td><div className="vehicle-cell"><button className="open-entry" type="button" onClick={() => onOpen(entry)}>Vehicle {entry.vehicleNumber}</button>{hasNote ? <NoteMark /> : null}</div></td>
    <td><LinePill line={entry.savedLine} catalog={lineCatalog} /></td>
    <td><span className="journey-cell"><strong>{direction}</strong>{entry.nearestStopName ? <small>{entry.nearestStopName}</small> : null}</span></td>
    <td className="muted-cell"><time>{formatEntryDate(savedTimeForEntry(entry))}</time></td>
  </tr>;
}

function MobileCard({ entry, hasNote, lineCatalog, onOpen }: { entry: LocalEntry; hasNote: boolean; lineCatalog: Record<string, LineInfo>; onOpen: (entry: LocalEntry) => void }) {
  const direction = entry.savedLeg === "unclassified" ? entry.nearestStopName || "No direction" : entry.savedLeg;
  return <button className="vehicle-card" type="button" onClick={() => onOpen(entry)}>
    <span className="card-top"><strong>{entry.vehicleNumber}</strong><LinePill line={entry.savedLine} catalog={lineCatalog} />{hasNote ? <NoteMark /> : null}<time>{formatEntryDate(savedTimeForEntry(entry))}</time></span>
    <span className="card-bottom"><b>{direction}</b></span>
  </button>;
}

function NoteMark() {
  return <span className="note-mark">Note</span>;
}

export function LinePill({ line, catalog }: { line: string; catalog: Record<string, LineInfo> }) {
  const info = catalog[line];
  return <span className="line-pill" style={{ background: info?.color || "var(--gray-450)", color: info ? lineForeground(line, catalog) : "var(--color-text-inverse)" }}>{line === "unclassified" ? "—" : line}</span>;
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  const pages = pageNumbers(page, totalPages);
  return <nav className="pagination" aria-label="Pagination"><button className="page-wide" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>{pages.map((item, index) => item === "…" ? <span key={`gap-${index}`}>…</span> : <button className={item === page ? "active" : ""} aria-current={item === page ? "page" : undefined} type="button" onClick={() => onPage(Number(item))}>{item}</button>)}<button className="page-wide" type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</button></nav>;
}

function SystemState({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return <div className="system-state"><h2>{title}</h2><p>{body}</p>{action ? <button className="button primary" type="button" onClick={onAction}>{action}</button> : null}</div>;
}

function LoadingRows() { return <div className="loading-rows" aria-label="Loading vehicles">{[0,1,2,3].map((item) => <span key={item} />)}</div>; }
function ChevronDown() { return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m7 10 5 5 5-5" /></svg>; }
function rangeText(page) { if (!page.totalEntries) return "0"; const start = (page.currentPage - 1) * page.pageSize + 1; return `${start}–${Math.min(start + page.entries.length - 1, page.totalEntries)} of ${page.totalEntries}`; }
function compareLines(a: string, b: string) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }); }
function lineOptionLabel(line: string, catalog: Record<string, LineInfo>) { const type = String(catalog[line]?.type || "Transit").toLowerCase(); return type.includes("tram") ? "Tram" : type.includes("bus") ? "Bus" : "Transit"; }
function pageNumbers(page: number, total: number): Array<number | string> { if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1); const values: Array<number | string> = [1]; if (page > 3) values.push("…"); for (let value = Math.max(2, page - 1); value <= Math.min(total - 1, page + 1); value += 1) values.push(value); if (page < total - 2) values.push("…"); values.push(total); return values; }
