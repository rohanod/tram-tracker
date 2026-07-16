export const DEFAULT_REVIEW_FILTERS = {
  query: "",
  line: "all",
  type: "all",
  dateFrom: "",
  dateTo: "",
  sort: "newest"
};

export function reviewTripEntries(entries, filters = DEFAULT_REVIEW_FILTERS) {
  const normalized = { ...DEFAULT_REVIEW_FILTERS, ...filters };
  const query = String(normalized.query).trim().toLocaleLowerCase();
  const from = normalized.dateFrom ? Date.parse(normalized.dateFrom + "T00:00:00") : Number.NEGATIVE_INFINITY;
  const to = normalized.dateTo ? Date.parse(normalized.dateTo + "T23:59:59.999") : Number.POSITIVE_INFINITY;
  const filtered = entries.filter((entry) => {
    const savedAt = Date.parse(String(entry.savedAt || entry.capturedAt));
    if (normalized.line !== "all" && String(entry.savedLine) !== normalized.line) return false;
    if (normalized.type !== "all" && String(entry.observationType) !== normalized.type) return false;
    if (Number.isFinite(savedAt) && (savedAt < from || savedAt > to)) return false;
    if (!query) return true;
    return [entry.vehicleNumber, entry.savedLine, entry.savedLeg, entry.nearestStopName]
      .some((value) => String(value ?? "").toLocaleLowerCase().includes(query));
  });
  return sortEntries(filtered, normalized.sort);
}

export function sortEntries(entries, sort = "newest") {
  const result = [...entries];
  const text = (value) => String(value ?? "");
  if (sort === "oldest") return result.sort((a, b) => text(a.savedAt || a.capturedAt).localeCompare(text(b.savedAt || b.capturedAt)));
  if (sort === "vehicle") return result.sort((a, b) => text(a.vehicleNumber).localeCompare(text(b.vehicleNumber), undefined, { numeric: true }));
  if (sort === "line") return result.sort((a, b) => text(a.savedLine).localeCompare(text(b.savedLine), undefined, { numeric: true }));
  if (sort === "direction") return result.sort((a, b) => text(a.savedLeg).localeCompare(text(b.savedLeg), undefined, { sensitivity: "base" }));
  return result.sort((a, b) => text(b.savedAt || b.capturedAt).localeCompare(text(a.savedAt || a.capturedAt)));
}

export function paginateReviewEntries(entries, page, pageSize = 25) {
  const size = Math.max(1, Number(pageSize) || 25);
  const totalPages = Math.max(1, Math.ceil(entries.length / size));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (currentPage - 1) * size;
  return { currentPage, totalPages, pageSize: size, totalEntries: entries.length, entries: entries.slice(start, start + size) };
}

export function vehicleFrequencyStats(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const vehicle = String(entry.vehicleNumber ?? "").trim();
    if (vehicle) counts.set(vehicle, (counts.get(vehicle) ?? 0) + 1);
  }
  const ranked = Array.from(counts, ([vehicleNumber, count]) => ({ vehicleNumber, count }))
    .sort((a, b) => b.count - a.count || a.vehicleNumber.localeCompare(b.vehicleNumber, undefined, { numeric: true }));
  const least = [...ranked].sort((a, b) => a.count - b.count || a.vehicleNumber.localeCompare(b.vehicleNumber, undefined, { numeric: true }))[0] ?? null;
  return { most: ranked[0] ?? null, least };
}

export const filterReviewEntries = reviewTripEntries;
export const sortTripEntries = (entries) => sortEntries(entries, "newest");
export const recentTripEntries = (entries, count = 2) => sortTripEntries(entries).slice(0, Math.max(0, count));
