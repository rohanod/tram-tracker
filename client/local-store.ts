import { isDeleteSettledResult } from "../shared/sync";
import { normalizeLeg, normalizeLine, normalizeObservationType } from "../shared/tram";
import type { AccessCache, LocalEntry, MutationResult, ServerEntry, SyncOperation, Viewer } from "./types";

const DB_NAME = "tram-vehicle-saver";
const DB_VERSION = 3;
const ENTRY_STORE = "entries";
const META_STORE = "meta";
const SYNC_STORE = "syncQueue";
export const PRIOR_AUTH_KEY = "priorAuthorized";
export const LAST_SYNC_META_KEY = "lastSuccessfulSyncAt";
const ACCESS_CACHE_KEY = "allowedAccess";
export const ACCESS_CACHE_MIRROR_KEY = "tramAllowedAccessMirror";
const ACCESS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AUTH_DEBUG_PREFIX = "[tram-auth-debug]";
const SYNC_DEBUG_PREFIX = "[tram-sync-debug]";

export function debugAccess(event: string, payload: Record<string, unknown> = {}) {
  if (!isDebugLoggingEnabled()) {
    return;
  }

  console.log(AUTH_DEBUG_PREFIX, event, {
    at: new Date().toISOString(),
    ...payload
  });
}

export function debugSync(event: string, payload: Record<string, unknown> = {}) {
  if (!isDebugLoggingEnabled()) {
    return;
  }

  console.log(SYNC_DEBUG_PREFIX, event, {
    at: new Date().toISOString(),
    ...payload
  });
}

function isDebugLoggingEnabled() {
  if (typeof console === "undefined" || typeof localStorage === "undefined" || typeof window === "undefined") {
    return false;
  }

  if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return false;
  }

  try {
    return localStorage.getItem("tramDebug") === "true";
  } catch {
    return false;
  }
}

export function operationDebug(operation: SyncOperation) {
  return {
    opKey: operation.opKey,
    type: operation.type,
    clientEntryId: operation.clientEntryId,
    hasServerId: Boolean(operation.serverId),
    attempts: operation.attempts,
    nextAttemptAt: operation.nextAttemptAt || "",
    lastError: operation.lastError || ""
  };
}

export function viewerDebug(viewer?: Viewer) {
  if (!viewer) {
    return null;
  }

  return {
    isAllowed: viewer.isAllowed,
    hasAllowedEmail: viewer.hasAllowedEmail,
    isGuest: viewer.isGuest,
    provider: viewer.provider,
    userId: maskIdentifier(viewer.userId),
    email: maskEmail(viewer.email)
  };
}

export function accessCacheDebug(cache: AccessCache | null) {
  if (!cache) {
    return { hasCache: false };
  }

  return {
    hasCache: true,
    allowed: cache.allowed,
    email: maskEmail(cache.email),
    userId: maskIdentifier(cache.userId),
    expiresInMs: Math.max(0, cache.expiresAt - Date.now())
  };
}

export function shouldClearAccessCacheForViewer(viewer: Viewer | undefined, cachedAccessAllowed: boolean) {
  if (!viewer || viewer.isGuest || viewer.isAllowed || !cachedAccessAllowed) {
    return false;
  }

  const cache = readAccessCacheMirror();
  if (!cache?.allowed || viewer.provider !== "google" || !viewer.hasAllowedEmail) {
    return false;
  }

  const viewerEmail = String(viewer.email ?? "").trim().toLowerCase();
  const viewerUserId = String(viewer.userId ?? "").trim();
  const cachedEmail = String(cache.email ?? "").trim().toLowerCase();
  const cachedUserId = String(cache.userId ?? "").trim();

  if (viewerEmail && cachedEmail && viewerEmail !== cachedEmail) {
    return true;
  }

  if (viewerUserId && cachedUserId && viewerUserId !== cachedUserId) {
    return true;
  }

  return Boolean(viewerEmail && cachedEmail && viewerEmail === cachedEmail && !viewer.isAllowed);
}

function maskEmail(value: string) {
  const email = String(value ?? "");
  if (!email) {
    return "";
  }

  const [name, domain = ""] = email.split("@");
  const visibleName = name.slice(0, 2) || "*";
  return domain ? visibleName + "***@" + domain : visibleName + "***";
}

function maskIdentifier(value: string) {
  const id = String(value ?? "");
  if (!id) {
    return "";
  }

  return id.length <= 10 ? id : id.slice(0, 10) + "...";
}

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}


export async function syncPendingEntries(args: {
  saveEntry: (entry: LocalEntry) => Promise<MutationResult>;
  deleteEntry: (id: string) => Promise<MutationResult>;
  setLocalEntries: (entries: LocalEntry[]) => void;
  setPendingOperationCount: (count: number) => void;
  setSyncing: (value: boolean) => void;
  setMessage: (value: string) => void;
  setLastSuccessfulSyncAt: (value: string) => void;
  syncInFlight: { current: boolean };
  force?: boolean;
}) {
  if (args.syncInFlight.current) {
    debugSync("sync-skip-in-flight");
    return;
  }

  args.syncInFlight.current = true;
  args.setSyncing(true);
  try {
    const operations = await getSyncOperations();
    const dueOperations = args.force ? operations : operations.filter((operation) => isOperationDue(operation));
    let completed = 0;
    let failed = 0;

    debugSync("sync-start", {
      queued: operations.length,
      due: dueOperations.length,
      force: Boolean(args.force)
    });

    for (const operation of dueOperations) {
      if (operation.type === "delete") {
        const result = await runDeleteOperation(operation, args.deleteEntry);
        completed += result === "completed" ? 1 : 0;
        failed += result === "failed" ? 1 : 0;
        continue;
      }

      const result = await runUpsertOperation(operation, args.saveEntry);
      completed += result === "completed" ? 1 : 0;
      failed += result === "failed" ? 1 : 0;
    }


    if (completed > 0 || failed > 0) {
      args.setMessage(failed > 0 ? "Some changes did not sync. They will retry." : "Sync updated.");
    } else if (args.force) {
      args.setMessage("Everything is synced.");
    }

    await refreshLocalState(args.setLocalEntries, args.setPendingOperationCount);
    if (failed === 0 && (completed > 0 || args.force)) {
      const syncedAt = new Date().toISOString();
      args.setLastSuccessfulSyncAt(syncedAt);
      void writeMeta(LAST_SYNC_META_KEY, syncedAt).catch((err) => debugSync("last-sync-write-error", { error: errorMessage(err) }));
    }
    debugSync("sync-finish", {
      completed,
      failed,
      remaining: (await getSyncOperations()).length
    });
  } finally {
    args.setSyncing(false);
    args.syncInFlight.current = false;
  }
}

export async function mergeServerEntries(serverEntries: ServerEntry[]) {
  const localEntries = await getLocalEntries();
  const localByClientId = new Map(localEntries.map((entry) => [entry.clientEntryId, entry]));
  const pendingUpsertIds = new Set((await getSyncOperations()).filter((operation) => operation.type === "upsert").map((operation) => operation.clientEntryId));
  const pendingDeleteIds = await getPendingDeleteClientIds();

  for (const serverEntry of serverEntries) {
    if (pendingDeleteIds.has(serverEntry.clientEntryId)) {
      debugSync("merge-skip-pending-delete", { clientEntryId: serverEntry.clientEntryId });
      continue;
    }

    const existing = localByClientId.get(serverEntry.clientEntryId);
    if (existing && pendingUpsertIds.has(serverEntry.clientEntryId)) {
      debugSync("merge-skip-local-pending", {
        clientEntryId: serverEntry.clientEntryId,
        syncStatus: existing.syncStatus
      });
      continue;
    }

    await putLocalEntry(localEntryFromServerEntry(serverEntry));
  }
}

export function localEntryFromServerEntry(serverEntry: ServerEntry): LocalEntry {
  return {
    clientEntryId: serverEntry.clientEntryId,
    serverId: serverEntry.id,
    vehicleNumber: serverEntry.vehicleNumber,
    observationType: normalizeObservationType(serverEntry.observationType),
    capturedAt: serverEntry.capturedAt,
    savedAt: serverEntry.savedAt || serverEntry.capturedAt,
    lat: serverEntry.lat,
    lon: serverEntry.lon,
    locationStatus: serverEntry.locationStatus,
    classificationStatus: serverEntry.classificationStatus,
    inferredLeg: serverEntry.inferredLeg,
    savedLeg: serverEntry.savedLeg,
    inferredLine: normalizeLine(serverEntry.inferredLine),
    savedLine: normalizeLine(serverEntry.savedLine),
    routeGroup: serverEntry.routeGroup,
    distanceMeters: serverEntry.distanceMeters,
    nearestStopName: serverEntry.nearestStopName,
    syncStatus: "synced",
    lastError: "",
    updatedAt: serverEntry.updatedAt || serverEntry.capturedAt || new Date().toISOString()
  };
}

async function runUpsertOperation(operation: SyncOperation, saveEntry: (entry: LocalEntry) => Promise<MutationResult>) {
  const entry = await getLocalEntry(operation.clientEntryId);
  if (!entry) {
    debugSync("upsert-drop-missing-entry", operationDebug(operation));
    await removeSyncOperation(operation.opKey);
    return "completed";
  }

  try {
    debugSync("upsert-attempt", operationDebug(operation));
    const result = await saveEntry(entry);
    if (result?.ok) {
      await putLocalEntry({
        ...entry,
        serverId: result.id ?? entry.serverId,
        syncStatus: "synced",
        lastError: "",
        updatedAt: new Date().toISOString()
      });
      await removeSyncOperation(operation.opKey);
      debugSync("upsert-complete", {
        ...operationDebug(operation),
        serverId: result.id ?? entry.serverId
      });
      return "completed";
    }

    await failOperation(operation, result?.reason ?? "sync failed");
    await putLocalEntry({ ...entry, syncStatus: "failed", lastError: result?.reason ?? "sync failed", updatedAt: new Date().toISOString() });
    return "failed";
  } catch (err) {
    const message = errorMessage(err);
    await failOperation(operation, message);
    await putLocalEntry({ ...entry, syncStatus: "failed", lastError: message, updatedAt: new Date().toISOString() });
    return "failed";
  }
}

async function runDeleteOperation(operation: SyncOperation, deleteEntry: (id: string) => Promise<MutationResult>) {
  try {
    debugSync("delete-attempt", operationDebug(operation));
    const result = await deleteEntry(operation.serverId || operation.clientEntryId);
    if (isDeleteSettledResult(result)) {
      await removeLocalEntry(operation.clientEntryId);
      await removeSyncOperation(operation.opKey);
      debugSync("delete-complete", operationDebug(operation));
      return "completed";
    }

    await failOperation(operation, result?.reason ?? "delete sync failed");
    return "failed";
  } catch (err) {
    await failOperation(operation, errorMessage(err));
    return "failed";
  }
}

async function failOperation(operation: SyncOperation, reason: string) {
  const attempts = operation.attempts + 1;
  const retryDelayMs = Math.min(5 * 60 * 1000, Math.max(5000, attempts * 10000));
  const failedOperation = {
    ...operation,
    attempts,
    lastError: reason,
    updatedAt: new Date().toISOString(),
    nextAttemptAt: new Date(Date.now() + retryDelayMs).toISOString()
  };
  debugSync("operation-failed", {
    ...operationDebug(failedOperation),
    retryDelayMs
  });
  await putSyncOperation(failedOperation);
}

function isOperationDue(operation: SyncOperation) {
  if (!operation.nextAttemptAt) {
    return true;
  }

  const retryAt = Date.parse(operation.nextAttemptAt);
  return Number.isNaN(retryAt) || retryAt <= Date.now();
}

export async function refreshLocalState(setLocalEntries: (entries: LocalEntry[]) => void, setPendingOperationCount: (count: number) => void) {
  const [entries, operations] = await Promise.all([getLocalEntries(), getSyncOperations()]);
  setLocalEntries(entries);
  setPendingOperationCount(operations.length);
}

export function createClientEntryId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return "entry-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ENTRY_STORE)) {
        db.createObjectStore(ENTRY_STORE, { keyPath: "clientEntryId" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        db.createObjectStore(SYNC_STORE, { keyPath: "opKey" });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function migrateLegacyDeletePendingEntries(): Promise<void> {
  const entries = await getLocalEntries();
  for (const entry of entries) {
    if (entry.syncStatus !== "delete_pending") {
      continue;
    }

    debugSync("legacy-delete-pending-migrate", {
      clientEntryId: entry.clientEntryId,
      hasServerId: Boolean(entry.serverId)
    });

    await removeLocalEntry(entry.clientEntryId);
    await removeSyncOperation(syncOpKey("upsert", entry.clientEntryId));
    await enqueueDeleteOperation(entry);
  }
}

export async function wakeFailedSyncOperations(): Promise<void> {
  const operations = await getSyncOperations();
  for (const operation of operations) {
    if (!operation.nextAttemptAt && !operation.lastError) {
      continue;
    }

    const awakeOperation = {
      ...operation,
      nextAttemptAt: "",
      updatedAt: new Date().toISOString()
    } satisfies SyncOperation;
    debugSync("wake-failed-operation", operationDebug(awakeOperation));
    await putSyncOperation(awakeOperation);
  }
}

export async function getLocalEntries(): Promise<LocalEntry[]> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(ENTRY_STORE, "readonly").objectStore(ENTRY_STORE).getAll();
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve((request.result as LocalEntry[]).map(normalizeLocalEntry));
    };
  });
}

export async function getLocalEntry(clientEntryId: string): Promise<LocalEntry | null> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(ENTRY_STORE, "readonly").objectStore(ENTRY_STORE).get(clientEntryId);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve(request.result ? normalizeLocalEntry(request.result as LocalEntry) : null);
    };
  });
}

export async function putLocalEntry(entry: LocalEntry): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(ENTRY_STORE, "readwrite").objectStore(ENTRY_STORE).put(normalizeLocalEntry(entry));
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

export async function removeLocalEntry(clientEntryId: string): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(ENTRY_STORE, "readwrite").objectStore(ENTRY_STORE).delete(clientEntryId);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

function normalizeLocalEntry(entry: LocalEntry): LocalEntry {
  return {
    ...entry,
    observationType: normalizeObservationType(entry.observationType),
    savedAt: entry.savedAt || entry.capturedAt,
    savedLeg: normalizeLeg(entry.savedLeg),
    savedLine: normalizeLine(entry.savedLine),
    inferredLine: normalizeLine(entry.inferredLine),
    syncStatus: entry.syncStatus ?? "synced",
    lastError: entry.lastError ?? "",
    updatedAt: entry.updatedAt || entry.capturedAt || new Date().toISOString()
  };
}

export async function enqueueUpsertOperation(entry: LocalEntry): Promise<void> {
  const opKey = syncOpKey("upsert", entry.clientEntryId);
  const existing = await getSyncOperation(opKey);
  const operation = {
    opKey,
    type: "upsert",
    clientEntryId: entry.clientEntryId,
    serverId: entry.serverId,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextAttemptAt: "",
    attempts: existing?.attempts ?? 0,
    lastError: ""
  } satisfies SyncOperation;

  debugSync("enqueue-upsert", operationDebug(operation));
  await putSyncOperation(operation);
}

export async function enqueueDeleteOperation(entry: LocalEntry): Promise<void> {
  const opKey = syncOpKey("delete", entry.clientEntryId);
  const existing = await getSyncOperation(opKey);
  const operation = {
    opKey,
    type: "delete",
    clientEntryId: entry.clientEntryId,
    serverId: entry.serverId,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextAttemptAt: "",
    attempts: existing?.attempts ?? 0,
    lastError: ""
  } satisfies SyncOperation;

  debugSync("enqueue-delete", operationDebug(operation));
  await putSyncOperation(operation);
}

export async function getSyncOperations(): Promise<SyncOperation[]> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SYNC_STORE, "readonly").objectStore(SYNC_STORE).getAll();
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve((request.result as SyncOperation[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    };
  });
}

export async function getSyncOperation(opKey: string): Promise<SyncOperation | null> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SYNC_STORE, "readonly").objectStore(SYNC_STORE).get(opKey);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve((request.result as SyncOperation | undefined) ?? null);
    };
  });
}

export async function putSyncOperation(operation: SyncOperation): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SYNC_STORE, "readwrite").objectStore(SYNC_STORE).put(operation);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

export async function removeSyncOperation(opKey: string): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SYNC_STORE, "readwrite").objectStore(SYNC_STORE).delete(opKey);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

export async function getPendingDeleteClientIds(): Promise<Set<string>> {
  const operations = await getSyncOperations();
  return new Set(operations.filter((operation) => operation.type === "delete").map((operation) => operation.clientEntryId));
}

export function syncOpKey(type: SyncOperation["type"], clientEntryId: string) {
  return type + ":" + clientEntryId;
}

export async function readMeta(key: string): Promise<string> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(META_STORE, "readonly").objectStore(META_STORE).get(key);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve(String(request.result?.value ?? ""));
    };
  });
}

export async function readAccessCache(): Promise<AccessCache | null> {
  const raw = await readMeta(ACCESS_CACHE_KEY);
  if (!raw) {
    debugAccess("access-cache-empty");
    return null;
  }

  try {
    const cache = JSON.parse(raw) as AccessCache;
    if (!cache.allowed || !cache.expiresAt || cache.expiresAt <= Date.now()) {
      debugAccess("access-cache-expired-or-invalid", {
        allowed: Boolean(cache.allowed),
        hasExpiresAt: Boolean(cache.expiresAt),
        expiresInMs: Number(cache.expiresAt ?? 0) - Date.now()
      });
      await clearAccessCache();
      return null;
    }

    writeAccessCacheMirror(cache);
    debugAccess("access-cache-hit", accessCacheDebug(cache));
    return cache;
  } catch {
    debugAccess("access-cache-json-error");
    await clearAccessCache();
    return null;
  }
}

export async function writeAccessCache(viewer: Viewer): Promise<void> {
  const cache = {
    allowed: true,
    email: viewer.email,
    userId: viewer.userId,
    expiresAt: Date.now() + ACCESS_CACHE_TTL_MS
  } satisfies AccessCache;
  debugAccess("access-cache-write", accessCacheDebug(cache));
  writeAccessCacheMirror(cache);
  await writeMeta(ACCESS_CACHE_KEY, JSON.stringify(cache));
}

export async function clearAccessCache(): Promise<void> {
  debugAccess("access-cache-clear");
  clearAccessCacheMirror();
  await writeMeta(ACCESS_CACHE_KEY, "");
}

export function readAccessCacheMirror(): AccessCache | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(ACCESS_CACHE_MIRROR_KEY);
    if (!raw) {
      return null;
    }

    const cache = JSON.parse(raw) as AccessCache;
    if (!cache.allowed || !cache.expiresAt || cache.expiresAt <= Date.now()) {
      localStorage.removeItem(ACCESS_CACHE_MIRROR_KEY);
      return null;
    }

    return cache;
  } catch {
    localStorage.removeItem(ACCESS_CACHE_MIRROR_KEY);
    return null;
  }
}

export function writeAccessCacheMirror(cache: AccessCache) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(ACCESS_CACHE_MIRROR_KEY, JSON.stringify(cache));
  } catch {
    // The IndexedDB copy is authoritative for offline use; the mirror only avoids auth-gate flicker.
  }
}

export function clearAccessCacheMirror() {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(ACCESS_CACHE_MIRROR_KEY);
  } catch {
    // Ignore storage failures during cleanup.
  }
}

export async function writeMeta(key: string, value: string): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(META_STORE, "readwrite").objectStore(META_STORE).put({ key, value });
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}
