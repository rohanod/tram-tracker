export const SAVES_HASH = "#/saves";

export function appPageFromHash(hash) {
  const normalized = String(hash ?? "").toLowerCase();
  if (normalized === SAVES_HASH) return "saves";
  return "saver";
}

export function hashForAppPage(page) {
  return page === "saves" ? SAVES_HASH : "#/";
}
