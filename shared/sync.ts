export function isDeleteSettledResult(result) {
  return Boolean(result?.ok || result?.reason === "not_found");
}

export function parseCleanupKeys(value) {
  try {
    const keys = Array.isArray(value) ? value : JSON.parse(String(value || "[]"));
    return Array.isArray(keys) ? [...new Set(keys.map((key) => String(key ?? "").trim()).filter(Boolean))] : [];
  } catch {
    return [];
  }
}

export function collectTransitCleanupKeys(rows, activeKeys) {
  const active = new Set(parseCleanupKeys(activeKeys));
  const stale = rows.flatMap((row) => [
    ...parseCleanupKeys(row?.pendingDeleteKeys),
    String(row?.metadataKey ?? "").trim(),
    String(row?.geometryKey ?? "").trim()
  ]);
  return [...new Set(stale.filter((key) => key && !active.has(key)))];
}

export function utf8ByteLength(value) {
  return new TextEncoder().encode(String(value ?? "")).length;
}
