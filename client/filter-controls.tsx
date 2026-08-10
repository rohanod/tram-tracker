import { useEffect, useMemo, useRef, useState } from "preact/hooks";

export type SelectOption = {
  value: string;
  label: string;
  badge?: { text: string; background: string; color: string };
};

export const STATUS_FILTER_OPTIONS: SelectOption[] = [
  { value: "all", label: "Any status" },
  { value: "been_on", label: "Been on" },
  { value: "seen", label: "Seen" }
];

export const SORT_FILTER_OPTIONS: SelectOption[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "vehicle", label: "Vehicle" },
  { value: "line", label: "Line" },
  { value: "direction", label: "Direction" }
];

export function SelectControl({ label, value, onChange, options, compact = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 280 });

  function toggle(event: MouseEvent) {
    if (!open) {
      const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
      const maxHeight = Math.min(280, window.innerHeight - 24);
      const menuHeight = Math.min(maxHeight, options.length * 42 + 12);
      setPosition({
        top: rect.bottom + 6 + menuHeight <= window.innerHeight ? rect.bottom + 6 : Math.max(12, rect.top - menuHeight - 6),
        left: Math.max(12, Math.min(rect.left, window.innerWidth - rect.width - 12)),
        width: rect.width,
        maxHeight
      });
    }
    setOpen((current) => !current);
  }

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const closeOnViewportChange = () => setOpen(false);
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnKey);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnKey);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  return <div className="select-control-wrap" ref={rootRef}>
    <button className={`filter-control select-control ${compact ? "compact-filter" : ""} ${open ? "open" : ""}`} type="button" aria-haspopup="listbox" aria-expanded={open} onClick={toggle}>
      {compact ? null : <span className="control-label">{label}</span>}
      <span className="control-value">{selected?.badge ? <OptionBadge {...selected.badge} /> : <span>{compact ? `${label}: ${selected?.label}` : selected?.label}</span>}<ChevronIcon /></span>
    </button>
    {open ? <div className="select-menu" role="listbox" aria-label={label} style={position}>{options.map((option) => <button className="select-option" key={option.value} type="button" role="option" aria-selected={option.value === value} onClick={() => { onChange(option.value); setOpen(false); }}>{option.badge ? <OptionBadge {...option.badge} /> : null}<span>{option.label}</span></button>)}</div> : null}
  </div>;
}

function OptionBadge({ text, background, color }: { text: string; background: string; color: string }) {
  return <span className="line-pill" style={{ background, color }}>{text}</span>;
}

export function DateRangeControl({ from, to, onChange }: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 620 });
  function openPicker(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
    const width = Math.min(window.innerWidth < 680 ? 320 : 620, window.innerWidth - 24);
    const height = 372;
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: rect.bottom + 6 + height <= window.innerHeight ? rect.bottom + 6 : Math.max(12, rect.top - height - 6),
      width
    });
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const closeOnViewportChange = () => setOpen(false);
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnKey);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnKey);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);
  return <div className="date-control-wrap date-range-control" ref={rootRef}>
    <button className={`filter-control date-control ${from || to ? "has-value" : ""}`} type="button" aria-expanded={open} onClick={openPicker}>
      <span className="control-label">Date</span>
      <span className="control-value"><span>{rangeLabel(from, to)}</span><CalendarIcon /></span>
    </button>
    {open ? <DateRangePopover from={from} to={to} position={position} onChange={onChange} onClose={() => setOpen(false)} /> : null}
  </div>;
}

function DateRangePopover({ from, to, position, onChange, onClose }: {
  from: string;
  to: string;
  position: { top: number; left: number; width: number };
  onChange: (from: string, to: string) => void;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(() => startOfMonth(parseDate(from) ?? new Date()));
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [selectingEnd, setSelectingEnd] = useState(Boolean(from && !to));
  const monthCount = position.width > 500 ? 2 : 1;
  const today = dateKey(new Date());
  function selectDate(key: string) {
    if (!selectingEnd || !draftFrom || draftTo) {
      setDraftFrom(key);
      setDraftTo("");
      setSelectingEnd(true);
      return;
    }
    setDraftFrom(key < draftFrom ? key : draftFrom);
    setDraftTo(key < draftFrom ? draftFrom : key);
    setSelectingEnd(false);
  }
  return <div className="date-picker-popover date-range-popover" role="dialog" aria-label="Select date range" style={position}>
    <div className="calendar-toolbar">
      <button className="icon-button" type="button" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ArrowIcon direction="left" /></button>
      <strong>{selectingEnd ? "Choose end date" : draftFrom && draftTo ? "Range selected" : "Choose start date"}</strong>
      <button className="icon-button" type="button" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ArrowIcon direction="right" /></button>
    </div>
    <div className="calendar-months">{Array.from({ length: monthCount }, (_, index) => <CalendarMonth key={index} month={addMonths(month, index)} from={draftFrom} to={draftTo} today={today} autoFocus={index === 0} onSelect={selectDate} />)}</div>
    <div className="calendar-actions">
      <button type="button" disabled={!draftFrom && !draftTo} onClick={() => { setDraftFrom(""); setDraftTo(""); setSelectingEnd(false); }}>Clear</button>
      <button type="button" onClick={() => { setDraftFrom(today); setDraftTo(today); setSelectingEnd(false); }}>Today</button>
      <button className="calendar-confirm" type="button" disabled={Boolean(draftFrom) !== Boolean(draftTo)} onClick={() => { onChange(draftFrom, draftTo); onClose(); }}>Confirm</button>
    </div>
  </div>;
}

function CalendarMonth({ month, from, to, today, autoFocus, onSelect }: {
  month: Date;
  from: string;
  to: string;
  today: string;
  autoFocus: boolean;
  onSelect: (date: string) => void;
}) {
  const days = useMemo(() => calendarDays(month), [month.getFullYear(), month.getMonth()]);
  return <section className="calendar-month">
    <strong className="calendar-month-label">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
    <div className="calendar-weekdays" aria-hidden="true">{["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid">{days.map((day) => {
      const key = dateKey(day);
      const outside = day.getMonth() !== month.getMonth();
      const rangeStart = key === from;
      const rangeEnd = key === to;
      const inRange = Boolean(from && to && key > from && key < to);
      return <button
        key={key}
        className={`${outside ? "outside" : ""} ${rangeStart ? "range-start" : ""} ${rangeEnd ? "range-end" : ""} ${inRange ? "range-middle" : ""} ${key === today ? "today" : ""}`}
        type="button"
        aria-label={day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        aria-pressed={rangeStart || rangeEnd}
        autoFocus={autoFocus && (key === from || (!from && key === today))}
        onClick={() => onSelect(key)}
      >{day.getDate()}</button>;
    })}</div>
  </section>;
}

function calendarDays(month: Date) {
  const first = startOfMonth(month);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shortDate(value: string) {
  return parseDate(value)?.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) ?? "Any date";
}

function rangeLabel(from: string, to: string) {
  if (!from && !to) return "All time";
  if (from && to) return `${shortDate(from)} – ${shortDate(to)}`;
  return from ? `From ${shortDate(from)}` : `Until ${shortDate(to)}`;
}

function startOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function addMonths(date: Date, amount: number) { return new Date(date.getFullYear(), date.getMonth() + amount, 1); }

function ChevronIcon() {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 10 5 5 5-5" /></svg>;
}

function CalendarIcon() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4M16 2v4M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="3"/></svg>;
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"}/></svg>;
}
