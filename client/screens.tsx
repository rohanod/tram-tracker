import { useEffect, useMemo, useState } from "preact/hooks";
import { paginateReviewEntries, reviewTripEntries } from "../shared/review";
import { DateRangeControl, SelectControl, SORT_FILTER_OPTIONS, STATUS_FILTER_OPTIONS } from "./filter-controls";
import { formatEntryDate, lineColor, lineForeground, savedTimeForEntry } from "./format";
import { SearchIcon, SettingsIcon } from "./ui";
import type { LineInfo, LocalEntry } from "./types";

export type ReviewFilters = { query: string; line: string; type: string; dateFrom: string; dateTo: string; sort: string };

export function TrackerScreen({
  entries, filters, lineCatalog, isOnline, isLoading, loadError, lastSyncLabel, pendingCount, syncing,
  onChangeFilters, onNew, onOpen, onOpenFilters, onOpenSettings, onRetry, onSignOut, onSync
}: {
  entries: LocalEntry[];
  filters: ReviewFilters;
  lineCatalog: Record<string, LineInfo>;
  isOnline: boolean;
  isLoading: boolean;
  loadError: string;
  lastSyncLabel: string;
  pendingCount: number;
  syncing: boolean;
  onChangeFilters: (filters: ReviewFilters) => void;
  onNew: () => void;
  onOpen: (entry: LocalEntry) => void;
  onOpenFilters: () => void;
  onOpenSettings: () => void;
  onRetry: () => void;
  onSignOut: () => void;
  onSync: () => void;
}) {
  const [page, setPage] = useState(1);
  const [compactHeight, setCompactHeight] = useState(() => typeof window !== "undefined" && window.innerHeight <= 700);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const resize = () => { setCompactHeight(window.innerHeight <= 700); setIsMobile(window.innerWidth < 768); };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const filtered = useMemo(() => reviewTripEntries(entries, filters), [entries, filters]);
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
              <span className={`status-dot ${isOnline ? "online" : ""}`} />
              <span>{isOnline ? "Online" : "Offline"}</span>
              <span>·</span>
              <span>{pendingCount ? `${pendingCount} pending` : lastSyncLabel}</span>
              {pendingCount ? <>
                <span>·</span>
                <button
                  className="status-sync"
                  type="button"
                  disabled={!isOnline || syncing}
                  aria-label={syncing ? "Syncing pending entries" : `Sync ${pendingCount} pending ${pendingCount === 1 ? "entry" : "entries"} now`}
                  onClick={onSync}
                >{syncing ? "Syncing…" : "Sync"}</button>
              </> : null}
              <button className="status-sign-out" type="button" onClick={onSignOut}>Sign out</button>
            </div>
          </div>
          <div className="header-actions">
            <button className="icon-button settings-button" type="button" aria-label="Settings" onClick={onOpenSettings}><SettingsIcon /></button>
            <button className="button primary save-new" type="button" onClick={onNew}>Save new</button>
          </div>
        </header>

        <section className="search-section">
          <div className="search-copy"><h1>Search vehicles</h1><p>Live results. Save only when needed.</p></div>
          <div className="search-and-stats">
            <label className="search-field"><SearchIcon /><span className="sr-only">Search vehicles</span><input name="vehicle-search" value={filters.query} placeholder="Vehicle, line, direction, stop…" onInput={(event) => onChangeFilters({ ...filters, query: event.currentTarget.value })} /></label>
          </div>
          <div className="filter-row desktop-filters">
            <FilterControls filters={filters} lineCatalog={lineCatalog} onChange={onChangeFilters} />
          </div>
          <div className="filter-row mobile-filters">
            <button className="button secondary" type="button" onClick={onOpenFilters}>Filters</button>
            <SelectControl compact label="Sort" value={filters.sort} options={SORT_FILTER_OPTIONS} onChange={(sort) => onChangeFilters({ ...filters, sort })} />
            <span className="result-count">{filtered.length} results</span>
          </div>
        </section>

        {!isOnline && entries.length ? <div className="offline-banner">Showing saved offline data</div> : null}

        <section className="results-panel" aria-live="polite" aria-busy={isLoading}>
          {loadError && !entries.length ? <SystemState title="Couldn’t load vehicles" body={loadError} action="Retry" onAction={onRetry} /> :
            isLoading && !entries.length ? <LoadingRows /> :
            !filtered.length ? <SystemState title={entries.length ? "No matching vehicles" : "No saved vehicles"} body={entries.length ? "Try a different search or filter." : "Use Save new to add the first entry."} /> : (
              <>
                <div className="table-wrap">
                  <div className="table-heading"><h2>Saved vehicles</h2><span>{rangeText(desktopPage)}</span></div>
                  <table className="vehicle-table"><thead><tr><th>Vehicle</th><th>Line</th><th>Direction</th><th>Stop saved</th><th>Date saved</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{desktopPage.entries.map((entry) => <DesktopRow entry={entry} key={entry.clientEntryId} lineCatalog={lineCatalog} onOpen={onOpen} />)}</tbody></table>
                </div>
                <div className="mobile-card-list">{mobilePage.entries.map((entry) => <MobileCard entry={entry} key={entry.clientEntryId} lineCatalog={lineCatalog} onOpen={onOpen} />)}</div>
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
    { value: "all", label: "Any line" },
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

function DesktopRow({ entry, lineCatalog, onOpen }: { entry: LocalEntry; lineCatalog: Record<string, LineInfo>; onOpen: (entry: LocalEntry) => void }) {
  return <tr onDblClick={() => onOpen(entry)}><td><strong>{entry.vehicleNumber}</strong></td><td><LinePill line={entry.savedLine} catalog={lineCatalog} /></td><td>{entry.savedLeg === "unclassified" ? "No direction" : entry.savedLeg}</td><td className="muted-cell">{entry.nearestStopName || "—"}</td><td className="muted-cell">{formatEntryDate(savedTimeForEntry(entry))}</td><td><button className="button secondary compact" type="button" onClick={() => onOpen(entry)}>Open</button></td></tr>;
}

function MobileCard({ entry, lineCatalog, onOpen }: { entry: LocalEntry; lineCatalog: Record<string, LineInfo>; onOpen: (entry: LocalEntry) => void }) {
  return <button className="vehicle-card" type="button" onClick={() => onOpen(entry)} aria-label={`Open vehicle ${entry.vehicleNumber}, line ${entry.savedLine}, ${entry.savedLeg}, ${entry.nearestStopName}`}>
    <span className="card-top"><strong>{entry.vehicleNumber}</strong><LinePill line={entry.savedLine} catalog={lineCatalog} /><time>{formatEntryDate(savedTimeForEntry(entry))}</time></span>
    <span className="card-bottom"><b>{entry.savedLeg === "unclassified" ? "No direction" : entry.savedLeg}</b><span>{entry.nearestStopName || "No saved stop"}</span></span>
  </button>;
}

export function LinePill({ line, catalog }: { line: string; catalog: Record<string, LineInfo> }) {
  const info = catalog[line];
  return <span className="line-pill" style={{ background: info?.color || "var(--gray-450)", color: info ? lineForeground(line, catalog) : "var(--color-text-inverse)" }}>{line === "unclassified" ? "—" : line}</span>;
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  const pages = pageNumbers(page, totalPages);
  return <nav className="pagination" aria-label="Pagination"><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>{pages.map((item, index) => item === "…" ? <span key={`gap-${index}`}>…</span> : <button className={item === page ? "active" : ""} aria-current={item === page ? "page" : undefined} type="button" onClick={() => onPage(Number(item))}>{item}</button>)}<button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</button></nav>;
}

function SystemState({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return <div className="system-state"><h2>{title}</h2><p>{body}</p>{action ? <button className="button primary" type="button" onClick={onAction}>{action}</button> : null}</div>;
}

function LoadingRows() { return <div className="loading-rows" aria-label="Loading vehicles">{[0,1,2,3].map((item) => <span key={item} />)}</div>; }
function rangeText(page) { if (!page.totalEntries) return "0"; const start = (page.currentPage - 1) * page.pageSize + 1; return `${start}–${Math.min(start + page.entries.length - 1, page.totalEntries)} of ${page.totalEntries}`; }
function compareLines(a: string, b: string) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }); }
function lineOptionLabel(line: string, catalog: Record<string, LineInfo>) { const type = String(catalog[line]?.type || "Transit").toLowerCase(); return type.includes("tram") ? "Tram" : type.includes("bus") ? "Bus" : "Transit"; }
function pageNumbers(page: number, total: number): Array<number | string> { if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1); const values: Array<number | string> = [1]; if (page > 3) values.push("…"); for (let value = Math.max(2, page - 1); value <= Math.min(total - 1, page + 1); value += 1) values.push(value); if (page < total - 2) values.push("…"); values.push(total); return values; }
