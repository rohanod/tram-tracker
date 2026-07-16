import { useEffect, useRef, useState } from "preact/hooks";
import { GENEVA_BOUNDS } from "../shared/corridors";
import { isInGenevaBounds, normalizeLocation } from "../shared/tram";
import { clampMapZoom } from "./format";
import { debugAccess, errorMessage } from "./local-store";
import type { MapLibreGlobal, MapLibreMap, MapLibreMarker, MapPoint } from "./types";

const DEFAULT_REVIEW_MAP_ZOOM = 16;
const MIN_REVIEW_MAP_ZOOM = 12;
const MAX_REVIEW_MAP_ZOOM = 18;
const REVIEW_RANGE_METERS = 150;
const MAP_CENTER = { lat: 46.2044, lon: 6.1458 };
const MAPLIBRE_SCRIPT_URL = "https://unpkg.com/maplibre-gl@^5.24.0/dist/maplibre-gl.js";
const MAPLIBRE_CSS_URL = "https://unpkg.com/maplibre-gl@^5.24.0/dist/maplibre-gl.css";
const REVIEW_MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "OpenStreetMap"
    }
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm"
    }
  ]
};
let mapLibreLoadPromise: Promise<MapLibreGlobal> | null = null;

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function MapCnReviewMap({ editable = false, onPointChange, point }: { editable?: boolean; onPointChange?: (point: MapPoint) => void; point: MapPoint | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const onPointChangeRef = useRef(onPointChange);
  const [mapZoom, setMapZoom] = useState(DEFAULT_REVIEW_MAP_ZOOM);
  const [isMapLibreReady, setIsMapLibreReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const center = point ?? MAP_CENTER;

  useEffect(() => {
    onPointChangeRef.current = onPointChange;
  }, [onPointChange]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      setIsMapLibreReady(false);
      return;
    }

    let disposed = false;
    setMapError("");

    loadMapLibre()
      .then(() => {
        if (disposed || !containerRef.current) {
          return;
        }

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: REVIEW_MAP_STYLE,
          center: [center.lon, center.lat],
          zoom: mapZoom,
          minZoom: MIN_REVIEW_MAP_ZOOM,
          maxZoom: MAX_REVIEW_MAP_ZOOM,
          renderWorldCopies: false,
          attributionControl: { compact: true }
        });

        mapRef.current = map;
        map.setMaxBounds([
          [GENEVA_BOUNDS.minLon, GENEVA_BOUNDS.minLat],
          [GENEVA_BOUNDS.maxLon, GENEVA_BOUNDS.maxLat]
        ]);

        const syncZoom = () => setMapZoom(Math.round(map.getZoom()));
        const moveEditablePoint = (nextPoint: MapPoint) => {
          const normalized = normalizeLocation(nextPoint);
          if (!normalized || !isInGenevaBounds(normalized)) {
            return;
          }
          setSavedLocationRange(map, normalized);
          markerRef.current?.setLngLat([normalized.lon, normalized.lat]);
          onPointChangeRef.current?.(normalized);
        };
        map.on("zoom", syncZoom);
        if (editable) {
          map.on("click", (event) => {
            const lngLat = (event as { lngLat?: { lng: number; lat: number } }).lngLat;
            if (lngLat) {
              moveEditablePoint({ lat: lngLat.lat, lon: lngLat.lng });
            }
          });
        }

        map.once("load", () => {
          if (disposed) {
            return;
          }
          addMapCnReviewLayers(map);
          if (point) {
            setSavedLocationRange(map, point);
          }
          if (editable) {
            const markerElement = document.createElement("button");
            markerElement.type = "button";
            markerElement.className = "mapcn-edit-marker";
            markerElement.setAttribute("aria-label", "Move saved location");
            const marker = new maplibregl.Marker({ element: markerElement, draggable: true }).setLngLat([center.lon, center.lat]).addTo(map);
            marker.on("dragend", () => {
              const lngLat = marker.getLngLat();
              moveEditablePoint({ lat: lngLat.lat, lon: lngLat.lng });
            });
            markerRef.current = marker;
          }
          if (point) {
            map.fitBounds(boundsAroundPoint(point, REVIEW_RANGE_METERS), {
              padding: 92,
              maxZoom: DEFAULT_REVIEW_MAP_ZOOM,
              duration: 0
            });
          } else {
            map.flyTo({ center: [MAP_CENTER.lon, MAP_CENTER.lat], zoom: DEFAULT_REVIEW_MAP_ZOOM, duration: 0 });
          }
          setIsMapLibreReady(true);
        });
      })
      .catch((err) => {
        const message = errorMessage(err);
        debugAccess("maplibre-error", { error: message });
        if (!disposed) {
          setMapError(message);
        }
      });

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            mapRef.current?.resize();
          });
    resizeObserver?.observe(element);

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [editable]);

  useEffect(() => {
    if (!mapRef.current || !isMapLibreReady) {
      return;
    }
    const nextCenter = point ?? MAP_CENTER;
    markerRef.current?.setLngLat([nextCenter.lon, nextCenter.lat]);
    if (point) {
      setSavedLocationRange(mapRef.current, point);
    }
  }, [isMapLibreReady, point?.lat, point?.lon]);

  useEffect(() => {
    if (!mapRef.current || !isMapLibreReady) {
      return;
    }
    const nextZoom = clampMapZoom(mapZoom);
    mapRef.current.zoomTo(nextZoom, { duration: 180 });
  }, [mapZoom, isMapLibreReady]);

  return (
    <div className="mapcn-shell">
      <div className={editable ? "mapcn-map editable" : "mapcn-map"} ref={containerRef} aria-label={editable ? "Edit saved location map" : "Saved location map"}>
        {mapError ? <div className="mapcn-error" role="status">Map unavailable</div> : !isMapLibreReady ? (
          <div className="mapcn-loader" aria-live="polite">
            <span />
            <span />
            <span />
          </div>
        ) : null}
        <MapCnControls mapZoom={mapZoom} setMapZoom={setMapZoom} />
        <div className="mapcn-range-label">{REVIEW_RANGE_METERS}m review range</div>
      </div>
    </div>
  );
}

function MapCnControls({ mapZoom, setMapZoom, step = 1 }: { mapZoom: number; setMapZoom: (updater: (zoom: number) => number) => void; step?: number }) {
  return (
    <div className="mapcn-controls" aria-label="Map zoom controls">
      <button type="button" disabled={mapZoom >= MAX_REVIEW_MAP_ZOOM} onClick={() => setMapZoom((zoom) => clampMapZoom(zoom + step))} aria-label="Zoom in">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button type="button" disabled={mapZoom <= MIN_REVIEW_MAP_ZOOM} onClick={() => setMapZoom((zoom) => clampMapZoom(zoom - step))} aria-label="Zoom out">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 12h14" />
        </svg>
      </button>
    </div>
  );
}

function loadMapLibre(): Promise<MapLibreGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("MapLibre requires a browser."));
  }
  if (window.maplibregl) {
    ensureStyleSheet(MAPLIBRE_CSS_URL);
    return Promise.resolve(window.maplibregl);
  }
  if (mapLibreLoadPromise) {
    return mapLibreLoadPromise;
  }

  ensureStyleSheet(MAPLIBRE_CSS_URL);
  mapLibreLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-tram-maplibre="true"]');
    if (existing) {
      existing.addEventListener("load", () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error("MapLibre loaded without global."))), { once: true });
      existing.addEventListener("error", () => reject(new Error("MapLibre script failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = MAPLIBRE_SCRIPT_URL;
    script.async = true;
    script.dataset.tramMaplibre = "true";
    script.addEventListener("load", () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error("MapLibre loaded without global."))), { once: true });
    script.addEventListener("error", () => reject(new Error("MapLibre script failed to load.")), { once: true });
    document.head.appendChild(script);
  });

  return mapLibreLoadPromise;
}

function ensureStyleSheet(href: string) {
  if (typeof document === "undefined" || document.querySelector('link[href="' + href + '"]')) {
    return;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function addMapCnReviewLayers(map: MapLibreMap) {
  map.addSource("tram-review-range", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: []
    }
  });
  map.addLayer({
    id: "tram-review-range",
    type: "fill",
    source: "tram-review-range",
    paint: {
      "fill-color": "#2563eb",
      "fill-opacity": 0.28,
      "fill-outline-color": "#1d4ed8"
    }
  });
  map.addLayer({
    id: "tram-review-range-outline",
    type: "line",
    source: "tram-review-range",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#1d4ed8",
      "line-width": 2.5,
      "line-opacity": 0.94
    }
  });
}

function setSavedLocationRange(map: MapLibreMap, point: MapPoint) {
  const rangeSource = map.getSource("tram-review-range");
  rangeSource?.setData?.(buildCircleFeatureCollection(point, REVIEW_RANGE_METERS));
}

function buildCircleFeatureCollection(center: MapPoint, radiusMeters: number) {
  const coordinates: Array<[number, number]> = [];
  const latRadians = degreesToRadians(center.lat);
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = Math.max(1, Math.cos(latRadians) * 111320);

  for (let angle = 0; angle <= 360; angle += 8) {
    const radians = degreesToRadians(angle);
    coordinates.push([
      center.lon + (Math.cos(radians) * radiusMeters) / metersPerDegreeLon,
      center.lat + (Math.sin(radians) * radiusMeters) / metersPerDegreeLat
    ]);
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [coordinates]
        }
      }
    ]
  };
}

function boundsAroundPoint(point: MapPoint, radiusMeters: number): [[number, number], [number, number]] {
  const latRadians = degreesToRadians(point.lat);
  const latDelta = radiusMeters / 111320;
  const lonDelta = radiusMeters / Math.max(1, Math.cos(latRadians) * 111320);
  return [
    [point.lon - lonDelta, point.lat - latDelta],
    [point.lon + lonDelta, point.lat + latDelta]
  ];
}
