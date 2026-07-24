export function configuredUserId(value) {
  return String(value ?? "").trim();
}

export function legacyOwnerId(email) {
  const normalized = String(email ?? "").trim().toLowerCase();
  return normalized ? `allowed:${normalized}` : "";
}

export function isAllowedIdentity(identity, allowedUserId) {
  const expected = configuredUserId(allowedUserId);
  return Boolean(expected && !identity.isGuest && identity.provider === "google" && configuredUserId(identity.userId) === expected);
}

export function canUseTracker({
  isLocalGuest,
  isAllowed,
  isOnline,
  priorAuthorized,
  cachedAccessAllowed
}) {
  return isLocalGuest || isAllowed || (!isOnline && priorAuthorized && cachedAccessAllowed);
}
