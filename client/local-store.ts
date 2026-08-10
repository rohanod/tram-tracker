import { isDeleteSettledResult } from "../shared/sync";
import { normalizeDirection, normalizeLine, normalizeObservationType, normalizeVehicleNote, normalizeVehicleNumber } from "../shared/tram";
import type { AccessCache, EntrySyncOperation, LocalEntry, LocalVehicleNote, MutationResult, ServerEntry, ServerVehicleNote, SyncOperation, VehicleNoteSyncOperation, Viewer } from "./types";

const DB_NAME = "tram-vehicle-saver";
const DB_VERSION = 4;
const ENTRY_STORE = "entries";
const VEHICLE_NOTE_STORE = "vehicleNotes";
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
    itemId: operation.type === "vehicle_note" ? operation.vehicleNumber : operation.clientEntryId,
    hasServerId: operation.type === "vehicle_note" ? false : Boolean(operation.serverId),
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
    hasAllowedUserId: viewer.hasAllowedUserId,
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

export function shouldClearAccessCacheForViewer(viewer: Viewer | undefined, cachedAccessAllowed: boolean, isOnline: boolean) {
  if (!isOnline || !viewer || viewer.isGuest || viewer.isAllowed || !cachedAccessAllowed || !viewer.hasAllowedUserId) {
    return false;
  }

  const cache = readAccessCacheMirror();
  if (!cache?.allowed || viewer.provider !== "google") {
    return false;
  }

  const viewerUserId = String(viewer.userId ?? "").trim();
  const cachedUserId = String(cache.userId ?? "").trim();
  return Boolean(viewerUserId && cachedUserId);
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
  saveVehicleNote: (vehicleNumber: string, note: string) => Promise<MutationResult>;
  setLocalEntries: (entries: LocalEntry[]) => void;
  setLocalVehicleNotes: (notes: LocalVehicleNote[]) => void;
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

      if (operation.type === "vehicle_note") {
        const result = await runVehicleNoteOperation(operation, args.saveVehicleNote);
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

    await refreshLocalState(args.setLocalEntries, args.setLocalVehicleNotes, args.setPendingOperationCount);
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
  const pendingUpsertIds = new Set((await getSyncOperations()).flatMap((operation) => operation.type === "upsert" ? [operation.clientEntryId] : []));
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

export async function mergeServerVehicleNotes(serverNotes: ServerVehicleNote[]) {
  const serverByNumber = new Map<string, LocalVehicleNote>();
  for (const serverNote of serverNotes) {
    const vehicleNumber = normalizeVehicleNumber(serverNote.vehicleNumber);
    const note = normalizeVehicleNote(serverNote.note);
    if (!vehicleNumber || !note) continue;
    serverByNumber.set(vehicleNumber, {
      vehicleNumber,
      note,
      syncStatus: "synced",
      lastError: "",
      updatedAt: serverNote.updatedAt || new Date().toISOString()
    });
  }

  const db = await openLocalDb();
  const transaction = db.transaction(VEHICLE_NOTE_STORE, "readwrite");
  const store = transaction.objectStore(VEHICLE_NOTE_STORE);
  const request = store.getAll();
  const completion = transactionResult(db, transaction, () => undefined);

  request.onsuccess = () => {
    const localNotes = (request.result as LocalVehicleNote[]).map(normalizeLocalVehicleNote);
    const localByNumber = new Map(localNotes.map((note) => [note.vehicleNumber, note]));

    for (const [vehicleNumber, serverNote] of serverByNumber) {
      const localNote = localByNumber.get(vehicleNumber);
      if (!localNote || localNote.syncStatus === "synced") store.put(serverNote);
    }

    for (const localNote of localNotes) {
      if (localNote.syncStatus === "synced" && !serverByNumber.has(localNote.vehicleNumber)) {
        store.delete(localNote.vehicleNumber);
      }
    }
  };

  await completion;
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

async function runUpsertOperation(operation: EntrySyncOperation, saveEntry: (entry: LocalEntry) => Promise<MutationResult>) {
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

async function runDeleteOperation(operation: EntrySyncOperation, deleteEntry: (id: string) => Promise<MutationResult>) {
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

async function runVehicleNoteOperation(operation: VehicleNoteSyncOperation, saveVehicleNote: (vehicleNumber: string, note: string) => Promise<MutationResult>) {
  const localNote = await getLocalVehicleNote(operation.vehicleNumber);
  if (!localNote) {
    await removeSyncOperationIfCurrent(operation);
    return "completed";
  }

  try {
    debugSync("vehicle-note-attempt", operationDebug(operation));
    const result = await saveVehicleNote(localNote.vehicleNumber, localNote.note);
    if (result?.ok) {
      const settled = await settleLocalVehicleNoteIfCurrent(localNote);
      const removed = await removeSyncOperationIfCurrent(operation);
      if (!settled || !removed) {
        const replacement = await getSyncOperation(operation.opKey);
        if (replacement?.type === "vehicle_note" && replacement.updatedAt !== operation.updatedAt) {
          return runVehicleNoteOperation(replacement, saveVehicleNote);
        }
      }
      debugSync("vehicle-note-complete", operationDebug(operation));
      return "completed";
    }

    const reason = result?.reason ?? "note sync failed";
    await failVehicleNoteIfCurrent(operation, localNote, reason);
    return "failed";
  } catch (err) {
    await failVehicleNoteIfCurrent(operation, localNote, errorMessage(err));
    return "failed";
  }
}

async function settleLocalVehicleNoteIfCurrent(submitted: LocalVehicleNote) {
  const db = await openLocalDb();
  const transaction = db.transaction(VEHICLE_NOTE_STORE, "readwrite");
  const store = transaction.objectStore(VEHICLE_NOTE_STORE);
  const request = store.get(submitted.vehicleNumber);
  let settled = false;

  request.onsuccess = () => {
    const current = request.result as LocalVehicleNote | undefined;
    if (!current || current.note !== submitted.note || current.updatedAt !== submitted.updatedAt) return;
    settled = true;
    if (submitted.note) {
      store.put({ ...submitted, syncStatus: "synced", lastError: "" });
    } else {
      store.delete(submitted.vehicleNumber);
    }
  };

  return transactionResult(db, transaction, () => settled);
}

async function removeSyncOperationIfCurrent(operation: SyncOperation) {
  const db = await openLocalDb();
  const transaction = db.transaction(SYNC_STORE, "readwrite");
  const store = transaction.objectStore(SYNC_STORE);
  const request = store.get(operation.opKey);
  let removed = false;

  request.onsuccess = () => {
    const current = request.result as SyncOperation | undefined;
    if (!current || current.updatedAt !== operation.updatedAt) return;
    removed = true;
    store.delete(operation.opKey);
  };

  return transactionResult(db, transaction, () => removed);
}

async function failVehicleNoteIfCurrent(operation: VehicleNoteSyncOperation, submitted: LocalVehicleNote, reason: string) {
  const { failedOperation, retryDelayMs } = failedOperationFor(operation, reason);
  const db = await openLocalDb();

  const transaction = db.transaction([SYNC_STORE, VEHICLE_NOTE_STORE], "readwrite");
  const operationStore = transaction.objectStore(SYNC_STORE);
  const noteStore = transaction.objectStore(VEHICLE_NOTE_STORE);
  const operationRequest = operationStore.get(operation.opKey);
  const completion = transactionResult(db, transaction, () => undefined);

  operationRequest.onsuccess = () => {
    const currentOperation = operationRequest.result as SyncOperation | undefined;
    if (!currentOperation || currentOperation.updatedAt !== operation.updatedAt) return;
    operationStore.put(failedOperation);

    const noteRequest = noteStore.get(submitted.vehicleNumber);
    noteRequest.onsuccess = () => {
      const currentNote = noteRequest.result as LocalVehicleNote | undefined;
      if (!currentNote || currentNote.note !== submitted.note || currentNote.updatedAt !== submitted.updatedAt) return;
      noteStore.put({ ...submitted, syncStatus: "failed", lastError: reason, updatedAt: failedOperation.updatedAt });
    };
  };

  await completion;

  debugSync("operation-failed", { ...operationDebug(failedOperation), retryDelayMs });
}

async function failOperation(operation: SyncOperation, reason: string) {
  const { failedOperation, retryDelayMs } = failedOperationFor(operation, reason);
  debugSync("operation-failed", { ...operationDebug(failedOperation), retryDelayMs });
  await putSyncOperation(failedOperation);
}

function failedOperationFor<T extends SyncOperation>(operation: T, reason: string) {
  const attempts = operation.attempts + 1;
  const retryDelayMs = Math.min(5 * 60 * 1000, Math.max(5000, attempts * 10000));
  const failedAt = Date.now();
  return {
    failedOperation: {
      ...operation,
      attempts,
      lastError: reason,
      updatedAt: new Date(failedAt).toISOString(),
      nextAttemptAt: new Date(failedAt + retryDelayMs).toISOString()
    } as T,
    retryDelayMs
  };
}

function isOperationDue(operation: SyncOperation) {
  if (!operation.nextAttemptAt) {
    return true;
  }

  const retryAt = Date.parse(operation.nextAttemptAt);
  return Number.isNaN(retryAt) || retryAt <= Date.now();
}

export async function refreshLocalState(
  setLocalEntries: (entries: LocalEntry[]) => void,
  setLocalVehicleNotes: (notes: LocalVehicleNote[]) => void,
  setPendingOperationCount: (count: number) => void
) {
  const [entries, notes, operations] = await Promise.all([getLocalEntries(), getLocalVehicleNotes(), getSyncOperations()]);
  setLocalEntries(entries);
  setLocalVehicleNotes(notes);
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
      if (!db.objectStoreNames.contains(VEHICLE_NOTE_STORE)) {
        db.createObjectStore(VEHICLE_NOTE_STORE, { keyPath: "vehicleNumber" });
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

function transactionResult<T>(db: IDBDatabase, transaction: IDBTransaction, result: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => { db.close(); resolve(result()); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

async function runStoreRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openLocalDb();
  const transaction = db.transaction(storeName, mode);
  const request = createRequest(transaction.objectStore(storeName));
  return transactionResult(db, transaction, () => request.result);
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

export async function migrateLegacyDirections(): Promise<void> {
  const entries = await getLocalEntries();
  for (const entry of entries) {
    const savedLeg = normalizeDirection(entry.savedLeg, entry.savedLine);
    const inferredLeg = normalizeDirection(entry.inferredLeg, entry.inferredLine);
    if (savedLeg === entry.savedLeg && inferredLeg === entry.inferredLeg) {
      continue;
    }

    debugSync("legacy-direction-migrate", { clientEntryId: entry.clientEntryId });
    await putLocalEntry({ ...entry, savedLeg, inferredLeg });
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
  const entries = await runStoreRequest<LocalEntry[]>(ENTRY_STORE, "readonly", (store) => store.getAll());
  return entries.map(normalizeLocalEntry);
}

export async function getLocalEntry(clientEntryId: string): Promise<LocalEntry | null> {
  const entry = await runStoreRequest<LocalEntry | undefined>(ENTRY_STORE, "readonly", (store) => store.get(clientEntryId));
  return entry ? normalizeLocalEntry(entry) : null;
}

export async function putLocalEntry(entry: LocalEntry): Promise<void> {
  await runStoreRequest(ENTRY_STORE, "readwrite", (store) => store.put(normalizeLocalEntry(entry)));
}

export async function removeLocalEntry(clientEntryId: string): Promise<void> {
  await runStoreRequest(ENTRY_STORE, "readwrite", (store) => store.delete(clientEntryId));
}

export async function getLocalVehicleNotes(): Promise<LocalVehicleNote[]> {
  const notes = await runStoreRequest<LocalVehicleNote[]>(VEHICLE_NOTE_STORE, "readonly", (store) => store.getAll());
  return notes.map(normalizeLocalVehicleNote);
}

export async function getLocalVehicleNote(vehicleNumber: string): Promise<LocalVehicleNote | null> {
  const normalizedNumber = normalizeVehicleNumber(vehicleNumber);
  if (!normalizedNumber) return null;
  const note = await runStoreRequest<LocalVehicleNote | undefined>(VEHICLE_NOTE_STORE, "readonly", (store) => store.get(normalizedNumber));
  return note ? normalizeLocalVehicleNote(note) : null;
}

export async function putLocalVehicleNote(note: LocalVehicleNote): Promise<void> {
  const normalized = normalizeLocalVehicleNote(note);
  if (!normalized.vehicleNumber) return;
  await runStoreRequest(VEHICLE_NOTE_STORE, "readwrite", (store) => store.put(normalized));
}

export async function putPendingVehicleNote(note: LocalVehicleNote): Promise<void> {
  const normalized = normalizeLocalVehicleNote(note);
  if (!normalized.vehicleNumber) return;

  const opKey = syncOpKey("vehicle_note", normalized.vehicleNumber);
  const db = await openLocalDb();
  const transaction = db.transaction([VEHICLE_NOTE_STORE, SYNC_STORE], "readwrite");
  const operationStore = transaction.objectStore(SYNC_STORE);
  const operationRequest = operationStore.get(opKey);
  const completion = transactionResult(db, transaction, () => undefined);
  let operation: VehicleNoteSyncOperation | undefined;

  operationRequest.onsuccess = () => {
    const existing = operationRequest.result as SyncOperation | undefined;
    operation = {
      opKey,
      type: "vehicle_note",
      vehicleNumber: normalized.vehicleNumber,
      createdAt: existing?.createdAt ?? normalized.updatedAt,
      updatedAt: normalized.updatedAt,
      nextAttemptAt: "",
      attempts: existing?.attempts ?? 0,
      lastError: ""
    };
    transaction.objectStore(VEHICLE_NOTE_STORE).put(normalized);
    operationStore.put(operation);
  };

  await completion;
  if (operation) debugSync("enqueue-vehicle-note", operationDebug(operation));
}

export async function removeLocalVehicleNote(vehicleNumber: string): Promise<void> {
  const normalizedNumber = normalizeVehicleNumber(vehicleNumber);
  if (!normalizedNumber) return;
  await runStoreRequest(VEHICLE_NOTE_STORE, "readwrite", (store) => store.delete(normalizedNumber));
}

function normalizeLocalVehicleNote(note: LocalVehicleNote): LocalVehicleNote {
  return {
    vehicleNumber: normalizeVehicleNumber(note.vehicleNumber),
    note: normalizeVehicleNote(note.note),
    syncStatus: note.syncStatus ?? "synced",
    lastError: note.lastError ?? "",
    updatedAt: note.updatedAt || new Date().toISOString()
  };
}

function normalizeLocalEntry(entry: LocalEntry): LocalEntry {
  const savedLine = normalizeLine(entry.savedLine);
  return {
    ...entry,
    observationType: normalizeObservationType(entry.observationType),
    savedAt: entry.savedAt || entry.capturedAt,
    savedLeg: normalizeDirection(entry.savedLeg, savedLine),
    savedLine,
    inferredLine: normalizeLine(entry.inferredLine),
    syncStatus: entry.syncStatus ?? "synced",
    lastError: entry.lastError ?? "",
    updatedAt: entry.updatedAt || entry.capturedAt || new Date().toISOString()
  };
}

export async function enqueueUpsertOperation(entry: LocalEntry): Promise<void> {
  await enqueueEntryOperation("upsert", entry);
}

export async function enqueueDeleteOperation(entry: LocalEntry): Promise<void> {
  await enqueueEntryOperation("delete", entry);
}

async function enqueueEntryOperation(type: "upsert" | "delete", entry: LocalEntry) {
  const opKey = syncOpKey(type, entry.clientEntryId);
  const existing = await getSyncOperation(opKey);
  const operation = {
    opKey,
    type,
    clientEntryId: entry.clientEntryId,
    serverId: entry.serverId,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextAttemptAt: "",
    attempts: existing?.attempts ?? 0,
    lastError: ""
  } satisfies SyncOperation;

  debugSync(`enqueue-${type}`, operationDebug(operation));
  await putSyncOperation(operation);
}

export async function getSyncOperations(): Promise<SyncOperation[]> {
  const operations = await runStoreRequest<SyncOperation[]>(SYNC_STORE, "readonly", (store) => store.getAll());
  return operations.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getSyncOperation(opKey: string): Promise<SyncOperation | null> {
  return (await runStoreRequest<SyncOperation | undefined>(SYNC_STORE, "readonly", (store) => store.get(opKey))) ?? null;
}

export async function putSyncOperation(operation: SyncOperation): Promise<void> {
  await runStoreRequest(SYNC_STORE, "readwrite", (store) => store.put(operation));
}

export async function removeSyncOperation(opKey: string): Promise<void> {
  await runStoreRequest(SYNC_STORE, "readwrite", (store) => store.delete(opKey));
}

export async function getPendingDeleteClientIds(): Promise<Set<string>> {
  const operations = await getSyncOperations();
  return new Set(operations.flatMap((operation) => operation.type === "delete" ? [operation.clientEntryId] : []));
}

export function syncOpKey(type: SyncOperation["type"], itemId: string) {
  return type + ":" + itemId;
}

export async function readMeta(key: string): Promise<string> {
  const record = await runStoreRequest<{ key: string; value: string } | undefined>(META_STORE, "readonly", (store) => store.get(key));
  return String(record?.value ?? "");
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
  await runStoreRequest(META_STORE, "readwrite", (store) => store.put({ key, value }));
}
