export type Viewer = {
  isAllowed: boolean;
  hasAllowedEmail: boolean;
  isGuest: boolean;
  provider: string;
  userId: string;
  displayName: string;
  email: string;
};

export type ServerEntry = {
  id: string;
  clientEntryId: string;
  vehicleNumber: string;
  observationType: string;
  capturedAt: string;
  savedAt: string;
  lat: string;
  lon: string;
  locationStatus: string;
  classificationStatus: string;
  inferredLeg: string;
  savedLeg: string;
  inferredLine: string;
  savedLine: string;
  routeGroup: string;
  distanceMeters: string;
  nearestStopName: string;
  ownerId: string;
  updatedAt: string;
};

export type LocalEntry = {
  clientEntryId: string;
  serverId: string;
  vehicleNumber: string;
  observationType: string;
  capturedAt: string;
  savedAt: string;
  lat: string;
  lon: string;
  locationStatus: string;
  classificationStatus: string;
  inferredLeg: string;
  savedLeg: string;
  inferredLine: string;
  savedLine: string;
  routeGroup: string;
  distanceMeters: string;
  nearestStopName: string;
  syncStatus: "pending" | "synced" | "failed" | "delete_pending";
  lastError: string;
  updatedAt: string;
};


export type MutationResult = {
  ok: boolean;
  id?: string;
  reason?: string;
};

export type LocationState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "captured"; lat: number; lon: number; accuracy: number }
  | { status: "denied" }
  | { status: "unavailable" };

export type MapPoint = { lat: number; lon: number };

export type MapMetrics = {
  width: number;
  height: number;
  left: number;
  top: number;
  zoom: number;
  tileZoom: number;
  tileScale: number;
};

export type MapLibreMap = {
  addLayer: (layer: Record<string, unknown>, beforeId?: string) => void;
  addSource: (id: string, source: Record<string, unknown>) => void;
  fitBounds: (bounds: [[number, number], [number, number]], options?: Record<string, unknown>) => void;
  flyTo: (options: Record<string, unknown>) => void;
  getCanvas: () => HTMLCanvasElement;
  getLayer: (id: string) => unknown;
  getSource: (id: string) => { setData?: (data: Record<string, unknown>) => void } | undefined;
  getZoom: () => number;
  jumpTo: (options: Record<string, unknown>) => void;
  off: (event: string, callback: (...args: any[]) => void) => void;
  on: (event: string, callback: (...args: any[]) => void) => void;
  once: (event: string, callback: (...args: any[]) => void) => void;
  remove: () => void;
  setMaxBounds: (bounds: [[number, number], [number, number]]) => void;
  resize: () => void;
  zoomTo: (zoom: number, options?: Record<string, unknown>) => void;
};

export type MapLibreMarker = {
  addTo: (map: MapLibreMap) => MapLibreMarker;
  getLngLat: () => { lng: number; lat: number };
  on: (event: string, callback: (...args: any[]) => void) => MapLibreMarker;
  remove: () => void;
  setLngLat: (lngLat: [number, number]) => MapLibreMarker;
  setPopup: (popup: MapLibrePopup) => MapLibreMarker;
  togglePopup: () => void;
};

export type MapLibrePopup = {
  setDOMContent: (element: HTMLElement) => MapLibrePopup;
  setMaxWidth: (width: string) => MapLibrePopup;
};

export type MapLibreGlobal = {
  Map: new (options: Record<string, unknown>) => MapLibreMap;
  Marker: new (options?: Record<string, unknown>) => MapLibreMarker;
  Popup: new (options?: Record<string, unknown>) => MapLibrePopup;
};

export type LineInfo = {
  line: string;
  color: string;
  foreground: string;
  type: string;
  link: string;
};

export type AccessCache = {
  allowed: boolean;
  email: string;
  userId: string;
  expiresAt: number;
};

export type SyncOperation = {
  opKey: string;
  type: "upsert" | "delete";
  clientEntryId: string;
  serverId: string;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  attempts: number;
  lastError: string;
};

declare global {
  interface Window {
    maplibregl?: MapLibreGlobal;
  }
}
