import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { CORRIDORS, GENEVA_BOUNDS } from "../shared/corridors";
import { isInGenevaBounds, normalizeLocation } from "../shared/tram";
import { clampMapZoom, lineColor } from "./format";
import { debugAccess, errorMessage } from "./local-store";
import type { MapLibreGlobal, MapLibreMap, MapLibreMarker, MapMetrics, MapPoint } from "./types";

const TILE_SIZE = 256;
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

function createMapMetricsForCenter(centerPoint: MapPoint, width: number, height: number, zoom: number): MapMetrics {
  const renderZoom = clampMapZoom(zoom);
  const tileZoom = Math.floor(renderZoom);
  const tileScale = Math.pow(2, renderZoom - tileZoom);
  const center = projectWorld(centerPoint, renderZoom);
  return {
    width,
    height,
    left: center.x - width / 2,
    top: center.y - height / 2,
    zoom: renderZoom,
    tileZoom,
    tileScale
  };
}

function createTiles(metrics: MapMetrics) {
  const renderedTileSize = TILE_SIZE * metrics.tileScale;
  const maxTile = Math.pow(2, metrics.tileZoom) - 1;
  const startX = Math.max(0, Math.floor(metrics.left / renderedTileSize));
  const endX = Math.min(maxTile, Math.floor((metrics.left + metrics.width) / renderedTileSize));
  const startY = Math.max(0, Math.floor(metrics.top / renderedTileSize));
  const endY = Math.min(maxTile, Math.floor((metrics.top + metrics.height) / renderedTileSize));
  const tiles: Array<{ key: string; z: number; x: number; y: number; left: number; top: number; size: number }> = [];

  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      tiles.push({
        key: metrics.tileZoom + "-" + x + "-" + y,
        z: metrics.tileZoom,
        x,
        y,
        left: x * renderedTileSize - metrics.left,
        top: y * renderedTileSize - metrics.top,
        size: renderedTileSize
      });
    }
  }

  return tiles;
}

function createRoutePaths(metrics: MapMetrics) {
  return CORRIDORS.flatMap((corridor) => {
    const className = "route-line line-" + corridor.line;
    const paths = corridor.paths?.length ? corridor.paths : [corridor.points];

    return paths.map((path, index) => ({
      key: corridor.id + "-" + index,
      className,
      points: path
        .map((rawPoint) => {
          const point = coordinateFromPathPoint(rawPoint);
          const pixel = projectToViewport(point, metrics);
          return pixel.x.toFixed(1) + "," + pixel.y.toFixed(1);
        })
        .join(" ")
    }));
  });
}

function createStopPoints(metrics: MapMetrics) {
  return CORRIDORS.flatMap((corridor) =>
    corridor.points.map((stop, index) => {
      const pixel = projectToViewport(stop, metrics);
      return {
        key: corridor.id + "-stop-" + index,
        className: "stop-dot line-" + corridor.line,
        name: stop.name,
        x: pixel.x,
        y: pixel.y,
        radius: 3.2
      };
    })
  );
}

function coordinateFromPathPoint(point: unknown): MapPoint {
  if (Array.isArray(point)) {
    return { lat: Number(point[0]), lon: Number(point[1]) };
  }

  const candidate = point as MapPoint;
  return { lat: candidate.lat, lon: candidate.lon };
}

function projectToViewport(point: MapPoint, metrics: MapMetrics) {
  const world = projectWorld(point, metrics.zoom);
  return {
    x: world.x - metrics.left,
    y: world.y - metrics.top
  };
}

function pointFromViewport(x: number, y: number, metrics: MapMetrics): MapPoint {
  return {
    lat: worldYToLat(metrics.top + y, metrics.zoom),
    lon: worldXToLon(metrics.left + x, metrics.zoom)
  };
}

function projectWorld(point: MapPoint, zoom: number) {
  return {
    x: lonToWorldX(point.lon, zoom),
    y: latToWorldY(point.lat, zoom)
  };
}

function lonToWorldX(lon: number, zoom: number) {
  return ((lon + 180) / 360) * worldSize(zoom);
}

function latToWorldY(lat: number, zoom: number) {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin(degreesToRadians(clampedLat));
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldSize(zoom);
}

function worldXToLon(x: number, zoom: number) {
  return (x / worldSize(zoom)) * 360 - 180;
}

function worldYToLat(y: number, zoom: number) {
  const mercator = Math.PI * (1 - (2 * y) / worldSize(zoom));
  return radiansToDegrees(Math.atan(Math.sinh(mercator)));
}

function worldSize(zoom: number) {
  return TILE_SIZE * Math.pow(2, zoom);
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI;
}


export function MapCnReviewMap({ editable = false, onPointChange, point }: { editable?: boolean; onPointChange?: (point: MapPoint) => void; point: MapPoint | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const onPointChangeRef = useRef(onPointChange);
  const [mapZoom, setMapZoom] = useState(DEFAULT_REVIEW_MAP_ZOOM);
  const [isMapLibreReady, setIsMapLibreReady] = useState(false);
  const [mapLibreFailed, setMapLibreFailed] = useState(false);
  const [mapMode, setMapMode] = useState<"default" | "fallback">("default");
  const center = point ?? MAP_CENTER;
  const useFallbackMap = mapLibreFailed || mapMode === "fallback";

  useEffect(() => {
    onPointChangeRef.current = onPointChange;
  }, [onPointChange]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || mapMode === "fallback") {
      setIsMapLibreReady(false);
      return;
    }

    let disposed = false;

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
        debugAccess("maplibre-fallback", { error: errorMessage(err) });
        if (!disposed) {
          setMapLibreFailed(true);
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
  }, [editable, mapMode]);

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

  if (useFallbackMap) {
    return <FallbackReviewMap editable={editable} onPointChange={onPointChange} point={point} mapZoom={mapZoom} mapMode={mapLibreFailed ? "fallback" : mapMode} setMapMode={setMapMode} setMapZoom={setMapZoom} />;
  }

  return (
    <div className="mapcn-shell">
      <div className={editable ? "mapcn-map editable" : "mapcn-map"} ref={containerRef} aria-label={editable ? "Edit saved location map" : "Saved location map"}>
        <MapModeToggle mode={mapMode} setMode={setMapMode} />
        {!isMapLibreReady ? (
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

function MapModeToggle({ mode, setMode }: { mode: "default" | "fallback"; setMode: (mode: "default" | "fallback") => void }) {
  return (
    <div className="map-mode-toggle" aria-label="Map renderer">
      <button type="button" className={mode === "default" ? "active" : ""} onClick={() => setMode("default")}>
        Default
      </button>
      <button type="button" className={mode === "fallback" ? "active" : ""} onClick={() => setMode("fallback")}>
        Fallback
      </button>
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

function FallbackReviewMap({
  editable = false,
  onPointChange,
  point,
  mapZoom,
  mapMode,
  setMapMode,
  setMapZoom
}: {
  editable?: boolean;
  onPointChange?: (point: MapPoint) => void;
  point: MapPoint | null;
  mapZoom: number;
  mapMode: "default" | "fallback";
  setMapMode: (mode: "default" | "fallback") => void;
  setMapZoom: (updater: (zoom: number) => number) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const initialCenterRef = useRef(point ?? MAP_CENTER);
  const [mapSize, setMapSize] = useState({ width: 680, height: 420 });
  const renderZoom = useSmoothMapZoom(mapZoom);
  const mapCenter = editable ? initialCenterRef.current : point ?? MAP_CENTER;
  const metrics = useMemo(() => createMapMetricsForCenter(mapCenter, mapSize.width, mapSize.height, renderZoom), [editable, mapCenter.lat, mapCenter.lon, mapSize.width, mapSize.height, renderZoom]);
  const tiles = useMemo(() => createTiles(metrics), [metrics.left, metrics.top, metrics.width, metrics.height, metrics.zoom]);
  const paths = useMemo(() => createRoutePaths(metrics), [metrics.left, metrics.top, metrics.zoom]);
  const stops = useMemo(() => createStopPoints(metrics), [metrics.left, metrics.top, metrics.zoom]);
  const marker = point ? projectToViewport(point, metrics) : null;
  const rangeRadius = point ? metersToPixels(REVIEW_RANGE_METERS, point.lat, metrics.zoom) : 0;

  function movePointFromEvent(event: PointerEvent | MouseEvent) {
    if (!editable || !mapRef.current) {
      return;
    }
    const target = event.target as Element | null;
    if (target?.closest("button, a")) {
      return;
    }
    const rect = mapRef.current.getBoundingClientRect();
    const nextPoint = pointFromViewport(event.clientX - rect.left, event.clientY - rect.top, metrics);
    if (isInGenevaBounds(nextPoint)) {
      onPointChange?.(nextPoint);
    }
  }

  useEffect(() => {
    const element = mapRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) {
        return;
      }

      const width = Math.max(280, Math.round(rect.width));
      const height = Math.max(300, Math.round(rect.height));
      setMapSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={editable ? "review-map editable" : "review-map"}
      ref={mapRef}
      aria-label={editable ? "Edit saved location map" : "Saved location map"}
      onPointerDown={(event) => {
        if (!editable) {
          return;
        }
        draggingRef.current = true;
        mapRef.current?.setPointerCapture(event.pointerId);
        movePointFromEvent(event);
      }}
      onPointerMove={(event) => {
        if (draggingRef.current) {
          movePointFromEvent(event);
        }
      }}
      onPointerUp={(event) => {
        draggingRef.current = false;
        mapRef.current?.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => {
        draggingRef.current = false;
        mapRef.current?.releasePointerCapture(event.pointerId);
      }}
      onWheel={(event) => {
        event.preventDefault();
        setMapZoom((zoom) => clampMapZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25)));
      }}
    >
      {tiles.map((tile) => (
        <img
          alt=""
          aria-hidden="true"
          className="map-tile"
          draggable={false}
          key={tile.key}
          src={"https://tile.openstreetmap.org/" + tile.z + "/" + tile.x + "/" + tile.y + ".png"}
          style={{ left: tile.left + "px", top: tile.top + "px", width: tile.size + "px", height: tile.size + "px" }}
        />
      ))}
      <svg className="map-overlay" viewBox={"0 0 " + metrics.width + " " + metrics.height} aria-hidden="true">
        {paths.map((path) => (
          <polyline className={path.className} key={path.key} points={path.points} />
        ))}
        {stops.map((stop) => (
          <circle className={stop.className} key={stop.key} cx={stop.x} cy={stop.y} r={stop.radius}>
            <title>{stop.name}</title>
          </circle>
        ))}
        {marker ? (
          <>
            <circle className="capture-range-halo" cx={marker.x} cy={marker.y} r={rangeRadius} />
            <circle className="capture-range" cx={marker.x} cy={marker.y} r={rangeRadius} />
            {editable ? (
              <g className="fallback-edit-marker" transform={"translate(" + marker.x + " " + marker.y + ")"}>
                <circle r="13" />
                <path d="M-5 0h10M0-5v10" />
              </g>
            ) : null}
          </>
        ) : null}
      </svg>
      <MapModeToggle mode={mapMode} setMode={setMapMode} />
      <div className="map-attribution">
        <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
      </div>
      <MapCnControls mapZoom={mapZoom} setMapZoom={setMapZoom} step={0.5} />
      <div className="mapcn-range-label fallback">{REVIEW_RANGE_METERS}m review range</div>
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
  map.addSource("tram-review-routes", {
    type: "geojson",
    data: buildRouteFeatureCollection()
  });
  map.addLayer({
    id: "tram-review-route-shadow",
    type: "line",
    source: "tram-review-routes",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#111827",
      "line-width": 7,
      "line-opacity": 0.16
    }
  });
  map.addLayer({
    id: "tram-review-routes",
    type: "line",
    source: "tram-review-routes",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": 4,
      "line-opacity": 0.92
    }
  });

  map.addSource("tram-review-stops", {
    type: "geojson",
    data: buildStopFeatureCollection()
  });
  map.addLayer({
    id: "tram-review-stops",
    type: "circle",
    source: "tram-review-stops",
    paint: {
      "circle-color": ["get", "color"],
      "circle-radius": 4.6,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
      "circle-opacity": 0.96
    }
  });

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

function buildRouteFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: CORRIDORS.flatMap((corridor) => {
      const paths = corridor.paths?.length ? corridor.paths : [corridor.points];
      return paths.map((path, index) => ({
        type: "Feature",
        properties: {
          id: corridor.id + "-" + index,
          line: corridor.line,
          color: lineColor(corridor.line)
        },
        geometry: {
          type: "LineString",
          coordinates: path.map((rawPoint) => {
            const point = coordinateFromPathPoint(rawPoint);
            return [point.lon, point.lat];
          })
        }
      }));
    })
  };
}

function buildStopFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: CORRIDORS.flatMap((corridor) =>
      corridor.points.map((stop, index) => ({
        type: "Feature",
        properties: {
          id: corridor.id + "-stop-" + index,
          name: stop.name,
          line: corridor.line,
          color: lineColor(corridor.line)
        },
        geometry: {
          type: "Point",
          coordinates: [stop.lon, stop.lat]
        }
      }))
    )
  };
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

function metersToPixels(meters: number, lat: number, zoom: number) {
  const metersPerPixel = (156543.03392 * Math.cos(degreesToRadians(lat))) / Math.pow(2, zoom);
  return meters / metersPerPixel;
}

function useSmoothMapZoom(targetZoom: number) {
  const [renderZoom, setRenderZoom] = useState(targetZoom);
  const renderZoomRef = useRef(targetZoom);

  useEffect(() => {
    renderZoomRef.current = renderZoom;
  }, [renderZoom]);

  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      renderZoomRef.current = targetZoom;
      setRenderZoom(targetZoom);
      return;
    }

    let animationFrame = 0;
    const startZoom = renderZoomRef.current;
    const zoomDelta = targetZoom - startZoom;
    const duration = 220;
    const startedAt = window.performance.now();

    const tick = (time: number) => {
      const progress = Math.min(1, (time - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      const nextZoom = startZoom + zoomDelta * eased;
      renderZoomRef.current = nextZoom;
      setRenderZoom(nextZoom);
      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [targetZoom]);

  return renderZoom;
}
