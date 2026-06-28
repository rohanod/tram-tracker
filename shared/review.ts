export const DEFAULT_REVIEW_FILTERS = {
  leg: "all",
  line: "all",
  type: "all",
  vehicleNumber: ""
};

export function recentTripEntries(entries, count = 2) {
  return sortTripEntries(entries).slice(0, Math.max(0, count));
}

export function sortTripEntries(entries) {
  return [...entries].sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)));
}

export function filterReviewEntries(entries, filters) {
  const normalizedFilters = { ...DEFAULT_REVIEW_FILTERS, ...filters };
  const vehicleQuery = normalizedFilters.vehicleNumber.replace(/\D/g, "");

  return sortTripEntries(entries).filter((entry) => {
    if (!matchesLegGroup(String(entry.savedLeg ?? "unclassified"), normalizedFilters.leg)) {
      return false;
    }
    if (normalizedFilters.line !== "all" && String(entry.savedLine ?? "unclassified") !== normalizedFilters.line) {
      return false;
    }
    if (normalizedFilters.type !== "all" && String(entry.observationType ?? "been_on") !== normalizedFilters.type) {
      return false;
    }
    if (vehicleQuery && !String(entry.vehicleNumber ?? "").startsWith(vehicleQuery)) {
      return false;
    }

    return true;
  });
}

export function paginateReviewEntries(entries, page, pageSize = 10) {
  const size = Math.max(1, Number(pageSize) || 10);
  const totalPages = Math.max(1, Math.ceil(entries.length / size));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (currentPage - 1) * size;

  return {
    currentPage,
    totalPages,
    pageSize: size,
    totalEntries: entries.length,
    entries: entries.slice(start, start + size)
  };
}

export function matchesLegGroup(savedLeg, filter) {
  if (filter === "all") {
    return true;
  }
  if (filter === "home") {
    return savedLeg === "from_home" || savedLeg === "to_home";
  }
  if (filter === "school") {
    return savedLeg === "to_school" || savedLeg === "from_school";
  }

  return savedLeg === "unclassified";
}
