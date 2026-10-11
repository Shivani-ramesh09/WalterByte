
import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";
import locations from "./data/locations.json";

// OpenFreeMap provides OSM-based vector tiles without an API key. Configure
// the Vite worker URL before the MapLibre-backed Leaflet layer is created.
setWorkerUrl(workerUrl);

const CAMPUS_REFERENCE = locations.find(
  (location) => location.id === "amrita-campus"
);

const CAMPUS_CENTER = CAMPUS_REFERENCE.coordinates;

// A directory record can be useful before its precise map point has been verified.
// Only numeric, valid coordinates are allowed to become live map markers/routes.
function hasCoordinates(coordinates) {
  return (
    Array.isArray(coordinates) &&
    coordinates.length === 2 &&
    Number.isFinite(coordinates[0]) &&
    Number.isFinite(coordinates[1]) &&
    coordinates[0] >= -90 && coordinates[0] <= 90 &&
    coordinates[1] >= -180 && coordinates[1] <= 180
  );
}

function getAnchorLocation(target) {
  if (hasCoordinates(target?.coordinates)) return target;
  if (!target?.mapAnchorId) return null;
  return locations.find((location) =>
    location.id === target.mapAnchorId && hasCoordinates(location.coordinates)
  ) ?? null;
}

function getTargetCoordinates(target) {
  return getAnchorLocation(target)?.coordinates ?? null;
}

function getBuildingKey(location) {
  return location?.buildingKey ?? location?.building ?? null;
}

function getGoogleMapsQuery(target) {
  if (target?.id === "dropped-pin" && hasCoordinates(target.coordinates)) {
    return `${target.coordinates[0]},${target.coordinates[1]}`;
  }
  const query = [
    target?.name,
    target?.roomCode,
    target?.floor,
    target?.building && target.building !== target.name ? target.building : null,
    "Amrita Vishwa Vidyapeetham Coimbatore",
  ].filter(Boolean).join(", ");
  if (query) return query;
  if (hasCoordinates(target?.coordinates)) return `${target.coordinates[0]},${target.coordinates[1]}`;
  return "Amrita Vishwa Vidyapeetham Coimbatore";
}

function getGoogleMapsSearchUrl(target) {
  const params = new URLSearchParams({ api: "1", query: getGoogleMapsQuery(target) });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}


function distanceInMeters(a, b) {
  if (!hasCoordinates(a) || !hasCoordinates(b)) return Infinity;
  const toRad = (value) => (value * Math.PI) / 180;
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Keep common campus categories available, and automatically include new ones
// added to locations.json (for example Restrooms, Halls, Library or Medical).
const CATEGORIES = [
  "All",
  ...new Set([
    "Food",
    "Facilities",
    "Labs",
    "Events",
    "Campus",
    ...locations.map((location) => location.category).filter(Boolean),
  ]),
];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function createLocationIcon(isSelected, category, label) {
  const categoryGlyphs = {
    Campus: "A", Food: "•", Facilities: "✦", Labs: "⌬", Events: "★",
    Restrooms: "WC", Halls: "▦", Library: "▤", Medical: "+", Parking: "P",
    Sports: "◎", Administration: "⌂", Buildings: "▦", Hostels: "H",
  };
  const glyph = categoryGlyphs[category] ?? "•";
  const size = isSelected ? 30 : 20;
  const safeLabel = escapeHtml(label);
  return L.divIcon({
    className: "campus-place-marker-wrap",
    html: `<div class="campus-place-marker-shell"><div class="campus-place-marker ${isSelected ? "is-active is-selected" : ""}"><span class="campus-place-marker-glyph">${glyph}</span></div><span class="campus-place-marker-label">${safeLabel}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

// OpenFreeMap's vector style gives us real style layers rather than raster labels
// burned into a tile. Hide symbol layers so all named POIs on this map are ours.
function LabelFreeBasemap() {
  const map = useMap();

  useEffect(() => {
    const layer = maplibreGL({
      style: "https://tiles.openfreemap.org/styles/positron",
      attribution: '&copy; <a href="https://openfreemap.org/">OpenFreeMap</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    });
    layer.addTo(map);
    const glMap = layer.getMaplibreMap();

    const hideStyleLabels = () => {
      const style = glMap.getStyle();
      for (const styleLayer of style?.layers ?? []) {
        const id = String(styleLayer.id ?? "").toLowerCase();
        const sourceLayer = String(styleLayer["source-layer"] ?? "").toLowerCase();
        const isLabelOrPoi = styleLayer.type === "symbol" || /poi|label|place|housenumber|road[-_]?number|shield|transit|airport|settlement/.test(`${id} ${sourceLayer}`);
        if (isLabelOrPoi) {
          try {
            glMap.setLayoutProperty(styleLayer.id, "visibility", "none");
          } catch (error) {
            // Continue if a provider style includes a layer that cannot be changed.
          }
        }
      }
    };

    glMap.on("style.load", hideStyleLabels);
    if (glMap.isStyleLoaded()) hideStyleLabels();

    return () => {
      glMap.off("style.load", hideStyleLabels);
      if (map.hasLayer(layer)) map.removeLayer(layer);
    };
  }, [map]);

  return null;
}

function createCoordinatePinIcon() {
  return L.divIcon({
    className: "coordinate-pin-wrap",
    html: '<div class="coordinate-pin"><span></span></div>',
    iconSize: [30, 40],
    iconAnchor: [15, 38],
  });
}

function MapCoordinatePicker({ onHover, onPick }) {
  useMapEvents({
    mousemove(event) {
      onHover([event.latlng.lat, event.latlng.lng]);
    },
    click(event) {
      const target = event.originalEvent?.target;
      // Ignore real place markers and controls, but not the non-interactive
      // coordinate pin. Its CSS also lets pointer events pass through to the map.
      if (target?.closest?.(".leaflet-marker-icon:not(.coordinate-pin-wrap), .leaflet-popup, .leaflet-tooltip, .leaflet-control, button, a")) return;
      onPick([event.latlng.lat, event.latlng.lng]);
    },
  });

  return null;
}

function MapController({ onReady }) {
  const map = useMap();

  useEffect(() => {
    onReady({
      flyTo: (coordinates, zoom = 17) =>
        map.flyTo(coordinates, zoom, {
          duration: 1.4,
        }),
      zoomIn: () => map.zoomIn(),
      zoomOut: () => map.zoomOut(),
      fitBounds: (coordinates) =>
        map.fitBounds(coordinates, { padding: [48, 48], maxZoom: 18 }),
      recenter: () =>
        map.flyTo(CAMPUS_CENTER, 15, {
          duration: 0.8,
        }),
    });
  }, [map, onReady]);

  return null;
}

function createUserLocationIcon() {
  return L.divIcon({
    className: "user-location-icon-wrap",
    html: '<div class="user-location-pulse"><span>ME</span></div>',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -20],
  });
}

// Valhalla returns route geometry as an encoded polyline with 6-digit precision.
function decodePolyline(encoded, precision = 6) {
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const coordinates = [];
  const factor = 10 ** precision;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([latitude / factor, longitude / factor]);
  }

  return coordinates;
}

function requestBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser does not support location access."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        coordinates: [position.coords.latitude, position.coords.longitude],
        accuracy: position.coords.accuracy,
      }),
      (error) => {
        const message = error.code === 1
          ? "Location permission was denied. Allow location access in your browser settings, then try again."
          : error.code === 2
            ? "Your current location is unavailable. Check that device location services are enabled."
            : "The location request timed out. Please try again.";
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
    );
  });
}

function App() {
  // Both themes use the same OpenStreetMap geography; only the visual style changes.
  const theme = "natural";

  const [activeCategory, setActiveCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  // Start with no destination: the campus coordinate is only a map reference point,
  // not a verified building-level navigation target.
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [mapActions, setMapActions] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [routeData, setRouteData] = useState(null);
  const [routeStatus, setRouteStatus] = useState("idle");
  const [routeError, setRouteError] = useState("");
  const [hoverCoordinates, setHoverCoordinates] = useState(null);
  const [pickedCoordinates, setPickedCoordinates] = useState(null);
  const [coordinateCopyMessage, setCoordinateCopyMessage] = useState("");

  const selectedLocation = locations.find(
    (location) => location.id === selectedLocationId
  ) ?? null;

  const selectedTarget = selectedLocation;
  const detailsPanelRef = useRef(null);

  // Reveal the details card once a place is selected. Keep this separate from
  // map clicks so selecting an existing marker never creates another point.
  useEffect(() => {
    if (!selectedTarget) return;
    const frame = window.requestAnimationFrame(() => {
      detailsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedTarget?.id]);

  // Category filters control which location markers are visible.
  // The directory contains mapped POIs and room-level records that are not yet georeferenced.
  const visibleLocations = locations.filter(
    (location) => activeCategory === "All" || location.category === activeCategory
  );
  const selectedAnchor = selectedLocation?.mapAnchorId
    ? locations.find((location) => location.id === selectedLocation.mapAnchorId) ?? null
    : null;
  const mappedVisibleLocations = [
    ...visibleLocations.filter((location) => hasCoordinates(location.coordinates) && location.mapDisplay !== false),
    ...(selectedAnchor && hasCoordinates(selectedAnchor.coordinates) ? [selectedAnchor] : []),
  ].filter((location, index, list) => list.findIndex((item) => item.id === location.id) === index);

  const query = searchTerm.trim().toLowerCase();
  const searchResults = query
    ? visibleLocations.filter((location) => {
        const searchableText = [
          location.name, location.shortName, location.category, location.building,
          location.floor, location.roomCode, location.description,
          ...(location.keywords ?? []),
          ...Object.values(location.details ?? {}).map((value) => Array.isArray(value) ? value.join(" ") : String(value ?? "")),
        ].filter(Boolean).join(" ").toLowerCase();
        return searchableText.includes(query);
      })
    : [];
  const directoryResults = query ? searchResults : visibleLocations;

  // Room-level contextual discovery: same-building amenities are safe to suggest
  // from the directory even when the room's exact map coordinates are not known.
  const selectedBuildingKey = getBuildingKey(selectedLocation);
  const sameBuildingFacilities = selectedBuildingKey
    ? locations.filter((location) =>
        location.id !== selectedLocation.id &&
        getBuildingKey(location) === selectedBuildingKey &&
        ["Restrooms", "Food", "Medical", "Facilities", "Labs", "Library", "Events"].includes(location.category)
      ).slice(0, 8)
    : [];

  // Distances are straight-line estimates, not walking distances. Only mapped features qualify.
  const selectedMapCoordinates = getTargetCoordinates(selectedLocation);
  const nearbyMappedFacilities = selectedLocation && selectedMapCoordinates
    ? locations
        .filter((location) =>
          location.id !== selectedLocation.id &&
          location.id !== selectedAnchor?.id &&
          hasCoordinates(location.coordinates) &&
          !["Campus"].includes(location.category) &&
          ["Food", "Facilities", "Medical", "Restrooms", "Sports", "Library", "Events", "Buildings"].includes(location.category)
        )
        .map((location) => ({
          ...location,
          distanceMeters: distanceInMeters(selectedMapCoordinates, location.coordinates),
        }))
        .filter((location) => location.distanceMeters <= 600)
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, 6)
    : [];

  function selectTarget(location) {
    setSelectedLocationId(location.id);
    setSearchTerm(location.name);
    setRouteData(null);
    setRouteStatus("idle");
    setRouteError("");

    // Selecting a place opens its details and focuses the in-app map when a
    // verified point or linked building anchor is available.
    const coordinates = getTargetCoordinates(location);
    if (coordinates) {
      mapActions?.flyTo(coordinates, location.zoom ?? 17);
    }
  }


  function handleSearchChange(event) {
    setSearchTerm(event.target.value);
    setSelectedLocationId(null);
    setRouteData(null);
    setRouteStatus("idle");
    setRouteError("");
  }

  function handleCategoryChange(category) {
    setActiveCategory(category);
    setSearchTerm("");
    setRouteData(null);
    setRouteStatus("idle");
    setRouteError("");

    if (
      selectedLocation &&
      category !== "All" &&
      selectedLocation.category !== category
    ) {
      setSelectedLocationId(null);
    }
  }

  function handleScanTarget() {
    if (!selectedTarget || !mapActions) return;

    const targetCoordinates = getTargetCoordinates(selectedTarget);
    if (targetCoordinates) {
      mapActions.flyTo(
        targetCoordinates,
        selectedTarget.zoom ?? (hasCoordinates(selectedTarget.coordinates) ? 17 : 18)
      );
    }
    // Directory entries without verified positions remain searchable, but we
    // never fabricate coordinates for them.
  }

  async function handleLocateMe() {
    setLocationMessage("Requesting location permission…");
    try {
      const location = await requestBrowserLocation();
      setUserLocation(location);
      setLocationMessage(`Location found · ±${Math.round(location.accuracy)} m reported accuracy`);
      setRouteData(null);
      setRouteStatus("idle");
      setRouteError("");
      mapActions?.flyTo(location.coordinates, 18);
    } catch (error) {
      setLocationMessage(error.message || "Unable to get your current location.");
    }
  }

  async function handleRouteToTarget() {
    if (!selectedTarget) {
      setRouteData(null);
      setRouteStatus("error");
      setRouteError("Choose a campus place from search or select an existing marker first.");
      return;
    }
    const destinationCoordinates = getTargetCoordinates(selectedTarget);
    if (!destinationCoordinates) {
      setRouteData(null);
      setRouteStatus("error");
      setRouteError("This place does not have a verified map point or linked building marker yet, so in-app walking directions are not available for it.");
      return;
    }
    setRouteData(null);
    setRouteError("");

    // Request GPS automatically the first time the user asks for directions.
    // They do not have to press ME separately, though the browser will ask permission.
    let origin = userLocation;
    if (!origin) {
      setRouteStatus("locating");
      setLocationMessage("Requesting current location for walking directions…");
      try {
        origin = await requestBrowserLocation();
        setUserLocation(origin);
        setLocationMessage(`Location found · ±${Math.round(origin.accuracy)} m reported accuracy`);
      } catch (error) {
        setRouteStatus("error");
        setRouteError(error.message || "Allow location access before requesting walking directions.");
        setLocationMessage("");
        return;
      }
    }

    setRouteStatus("loading");
    try {
      const response = await fetch("https://valhalla1.openstreetmap.de/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locations: [
            {
              lat: origin.coordinates[0],
              lon: origin.coordinates[1],
              type: "break",
              name: "My location",
            },
            {
              lat: destinationCoordinates[0],
              lon: destinationCoordinates[1],
              type: "break",
              name: selectedTarget.shortName || selectedTarget.name,
            },
          ],
          costing: "pedestrian",
          directions_options: { units: "kilometers", language: "en-US" },
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.trip?.legs?.[0]?.shape) {
        throw new Error(result.error || result.trip?.status_message || "No walking route was returned.");
      }

      const trip = result.trip;
      const leg = trip.legs[0];
      const coordinates = decodePolyline(leg.shape, 6);
      if (coordinates.length < 2) throw new Error("The routing service returned an incomplete route.");

      setRouteData({
        coordinates,
        distanceKm: trip.summary.length,
        durationMinutes: Math.max(1, Math.round(trip.summary.time / 60)),
        instructions: (leg.maneuvers ?? []).map((item) => item.instruction).filter(Boolean),
        destinationIsBuildingAnchor: !hasCoordinates(selectedTarget.coordinates),
      });
      setRouteStatus("ready");
      mapActions?.fitBounds(coordinates);
    } catch (error) {
      setRouteStatus("error");
      setRouteError(
        error.message?.includes("Failed to fetch")
          ? "The walking route service could not be reached. Check your connection and try again."
          : error.message || "Unable to calculate this walking route. The campus paths may not be mapped at this point."
      );
    }
  }

  function clearRoute() {
    setRouteData(null);
    setRouteStatus("idle");
    setRouteError("");
  }

  const canScan = selectedTarget !== null && mapActions !== null;

  return (
    <main className={`tracker-shell theme-${theme}`}>
      <header className="tracker-topbar">
        <div className="tracker-brand">
          <div className="brand-emblem" aria-hidden="true">A</div>

          <div className="brand-wordmark">
            <h1>AMRITA</h1>
            <p>VISHWA VIDYAPEETHAM</p>
          </div>
        </div>

        <div className="connection-status">
          <span className="connection-dot" />
          <span>COIMBATORE CAMPUS</span>
        </div>
      </header>

      <section className="tracker-content">
        <div className="mission-heading">
          <div>
            <p className="micro-label">
              YOUR CAMPUS, CONNECTED
            </p>
            <h2>
              Find your place<span>.</span>
            </h2>
            <p className="mission-description">Discover labs, food, facilities and event spaces around Amrita.</p>
          </div>

          <div className="mission-stamp">
            <span className="stamp-symbol">✦</span>
            <div>
              <strong>CAMPUS EXPLORE</strong>
              <small>MAP + DIRECTORY</small>
            </div>
          </div>
        </div>

        {/* Search, category filters and destination selection */}
        <section className="target-console">
          <div className="target-search-row">
            <label className="target-search">
              <span className="target-search-icon">⌕</span>

              <input
                type="search"
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="Ask campus anything — labs, coffee, restrooms…"
                autoComplete="off"
                aria-label="Search campus locations"
              />

              {searchTerm && (
                <button
                  type="button"
                  className="clear-search"
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedLocationId(null);
                                    setRouteData(null);
                    setRouteStatus("idle");
                    setRouteError("");
                                  }}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </label>

            <span className="dataset-count">
              {locations.length} CAMPUS RECORDS
            </span>
          </div>

          <div
            className="category-filter-row"
            role="group"
            aria-label="Filter campus locations by category"
          >
            {CATEGORIES.map((category) => {
              const count =
                category === "All"
                  ? locations.length
                  : locations.filter(
                      (location) =>
                        location.category === category
                    ).length;

              return (
                <button
                  key={category}
                  type="button"
                  className={`category-chip ${
                    activeCategory === category
                      ? "category-chip-active"
                      : ""
                  }`}
                  onClick={() => handleCategoryChange(category)}
                  aria-pressed={activeCategory === category}
                >
                  {category}
                  <span className="filter-count">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Suggestions appear while the user is searching */}
          {(query || activeCategory !== "All") && !selectedLocationId && (
            <div className="target-results">
              <div className="results-heading">
                SEARCH RESULTS
                <span>{directoryResults.length} FOUND</span>
              </div>

              {directoryResults.length > 0 ? (
                directoryResults.map((location) => (
                  <button
                    type="button"
                    key={location.id}
                    className="target-result"
                    onClick={() => selectTarget(location)}
                  >
                    <span className="result-reticle">⌖</span>

                    <span className="result-copy">
                      <strong>{location.name}</strong>
                      <small>
                        {location.category} ·{" "}
                        {location.description}
                      </small>
                    </span>

                    <span className="result-arrow">↗</span>
                  </button>
                ))
              ) : (
                <div className="results-empty">
                  <strong>NO MATCHES FOUND</strong>
                  <span>
                    No directory entries match this filter. Try a different category or search term.
                  </span>
                </div>
              )}
            </div>
          )}

          {!query &&
            !selectedLocationId &&
            activeCategory !== "All" &&
            visibleLocations.length === 0 && (
              <div className="category-empty-state">
                <strong>
                  NO {activeCategory.toUpperCase()} LOCATIONS YET
                </strong>
                <span>
                  Add verified locations to src/data/locations.json
                  when their positions have been confirmed.
                </span>
              </div>
            )}

          <div className="selected-target-card">
            <div className="selected-target-info">
              <span className="selected-target-kicker">
                {selectedTarget ? "PLACE SELECTED" : "START EXPLORING"}
              </span>

              <strong>
                {selectedTarget
                  ? selectedTarget.shortName
                  : "Explore the campus"}
              </strong>

              <small>
                {selectedTarget
                  ? `${selectedTarget.category} · ${selectedTarget.description}`
                  : "Search for a place or select an existing map marker."}
              </small>
            </div>

            {selectedTarget && (
              <div className="target-action-buttons">
                <button
                  type="button"
                  className="tracker-button tracker-button-primary scan-target-button"
                  onClick={handleScanTarget}
                  disabled={!canScan}
                >
                  <span>⌖</span>
                  SHOW ON MAP
                </button>
                <button
                  type="button"
                  className="tracker-button route-target-button"
                  onClick={handleRouteToTarget}
                  disabled={routeStatus === "loading" || routeStatus === "locating"}
                >
                  <span>➜</span>
                  {routeStatus === "locating" ? "LOCATING YOU..." : routeStatus === "loading" ? "FINDING ROUTE..." : "WALK THERE"}
                </button>
              </div>
            )}
          </div>

          {selectedTarget && (
            <section ref={detailsPanelRef} className="scan-details-panel details-panel-enter" aria-live="polite">
              <div className="scan-details-heading">
                <span className="scan-complete-label">PLACE DETAILS</span>
                <strong>{selectedTarget.name}</strong>
              </div>
              <p>{selectedTarget.description || "No description has been added for this place yet."}</p>
              <div className="scan-details-grid">
                <div>
                  <small>CATEGORY</small>
                  <strong>{selectedTarget.category || "Uncategorised"}</strong>
                </div>
                <div>
                  <small>DATA STATUS</small>
                  <strong>{selectedLocation?.verified === true ? "Source-backed record" : "Needs verification"}</strong>
                </div>
                {selectedLocation?.floor && (
                  <div><small>FLOOR</small><strong>{selectedLocation.floor}</strong></div>
                )}
                {selectedLocation?.building && (
                  <div><small>BUILDING</small><strong>{selectedLocation.building}</strong></div>
                )}
                {selectedLocation?.roomCode && (
                  <div><small>ROOM / DOOR ID</small><strong>{selectedLocation.roomCode}</strong></div>
                )}
                {selectedLocation && (
                  <div><small>MAP STATUS</small><strong>{selectedLocation.coordinateStatus === "campus-reference" ? "Campus reference point" : hasCoordinates(selectedLocation.coordinates) ? (selectedLocation.coordinateStatus?.includes("building-anchor") ? "Building-level map anchor" : "Mapped location") : getTargetCoordinates(selectedLocation) ? "Building anchor available; room not mapped" : "No verified point/anchor"}</strong></div>
                )}
                {selectedLocation?.openingHours && (
                  <div><small>OPENING HOURS</small><strong>{selectedLocation.openingHours}</strong></div>
                )}
                {selectedLocation?.accessibility && (
                  <div><small>ACCESSIBILITY</small><strong>{selectedLocation.accessibility}</strong></div>
                )}
                {Object.entries(selectedTarget.details ?? {})
                  .filter(([, value]) => value !== null && value !== undefined && value !== "")
                  .map(([label, value]) => (
                    <div key={label}>
                      <small>{label.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())}</small>
                      <strong>{Array.isArray(value) ? value.join(" · ") : String(value)}</strong>
                    </div>
                  ))}
              </div>
              {Array.isArray(selectedLocation?.amenities) && selectedLocation.amenities.length > 0 && (
                <div className="scan-amenities">
                  <small>FEATURES / AMENITIES</small>
                  <div>{selectedLocation.amenities.map((amenity) => <span key={amenity}>{amenity}</span>)}</div>
                </div>
              )}
              <div className="campus-external-actions">
                <a className="optional-map-link" href={getGoogleMapsSearchUrl(selectedTarget)} target="_blank" rel="noreferrer">
                  Prefer Google Maps? Open this place ↗
                </a>
              </div>
              {!hasCoordinates(selectedTarget.coordinates) && (
                <small className="campus-coordinate-note">{getTargetCoordinates(selectedTarget) ? "Map and in-app walking directions use the verified building anchor; the room itself is not geolocated indoors." : "This is a searchable directory entry, not an exact map pin. The optional Google Maps search may resolve the building or campus rather than the internal room. Confirm room-level directions on site."}</small>
              )}

              {sameBuildingFacilities.length > 0 && (
                <section className="campus-related-panel">
                  <div className="campus-related-heading">
                    <strong>USEFUL IN THE SAME BUILDING</strong>
                    <span>{sameBuildingFacilities.length} MATCHES</span>
                  </div>
                  <div className="campus-related-list">
                    {sameBuildingFacilities.map((place) => (
                      <button type="button" className="campus-related-item" key={place.id} onClick={() => selectTarget(place)}>
                        <span className="campus-related-category">{place.category}</span>
                        <span className="campus-related-name">{place.shortName || place.name}</span>
                        <span className="campus-related-room">{place.roomCode || place.building || "Details"}</span>
                      </button>
                    ))}
                  </div>
                  <small className="campus-coordinate-note">These are entries in the same building, not a distance-ranked result. True nearby sorting requires verified coordinates.</small>
                </section>
              )}

              {getTargetCoordinates(selectedTarget) && nearbyMappedFacilities.length > 0 && (
                <section className="campus-related-panel">
                  <div className="campus-related-heading">
                    <strong>NEARBY CAMPUS PLACES</strong>
                    <span>STRAIGHT-LINE ESTIMATE</span>
                  </div>
                  <div className="campus-related-list">
                    {nearbyMappedFacilities.map((place) => (
                      <button type="button" className="campus-related-item" key={place.id} onClick={() => selectTarget(place)}>
                        <span className="campus-related-category">{place.category}</span>
                        <span className="campus-related-name">{place.shortName || place.name}</span>
                        <span className="campus-related-room">{place.distanceMeters < 1000 ? `${Math.round(place.distanceMeters)} m` : `${(place.distanceMeters / 1000).toFixed(1)} km`}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {selectedLocation && !getTargetCoordinates(selectedLocation) && sameBuildingFacilities.length === 0 && (
                <small className="campus-coordinate-note">Distance-based nearby facilities will appear when verified coordinates are added for this building and its facilities.</small>
              )}

              {selectedLocation && !selectedLocation.details && !selectedLocation.floor && !selectedLocation.building && !selectedLocation.openingHours && !selectedLocation.accessibility && !selectedLocation.amenities?.length && (
                <small className="scan-data-note">No extra details are stored yet. Add fields for this place in src/data/locations.json; the scan panel will display them here.</small>
              )}
            </section>
          )}

          {(locationMessage || routeStatus !== "idle" || routeData) && (
            <div className="navigation-status-panel" aria-live="polite">
              {locationMessage && (
                <div className="navigation-status-line">
                  <strong>MY LOCATION</strong>
                  <span>{locationMessage}</span>
                </div>
              )}
              {routeStatus === "locating" && (
                <div className="navigation-status-line">
                  <strong>MY LOCATION</strong>
                  <span>Requesting GPS permission before calculating your route…</span>
                </div>
              )}
              {routeStatus === "loading" && (
                <div className="navigation-status-line">
                  <strong>WALKING ROUTE</strong>
                  <span>Calculating a path using mapped pedestrian ways…</span>
                </div>
              )}
              {routeError && (
                <div className="navigation-error">
                  <strong>ROUTE UNAVAILABLE</strong>
                  <span>{routeError}</span>
                </div>
              )}
              {routeData && (
                <div className="route-details">
                  <div className="route-summary">
                    <div>
                      <strong>{routeData.distanceKm < 1
                        ? `${Math.round(routeData.distanceKm * 1000)} m`
                        : `${routeData.distanceKm.toFixed(2)} km`}</strong>
                      <small>WALKING DISTANCE</small>
                    </div>
                    <div>
                      <strong>~{routeData.durationMinutes} min</strong>
                      <small>ESTIMATED WALK</small>
                    </div>
                    <button type="button" className="tracker-button" onClick={clearRoute}>
                      CLEAR ROUTE
                    </button>
                  </div>
                  {routeData.instructions.length > 0 && (
                    <ol className="route-instructions">
                      {routeData.instructions.slice(0, 5).map((instruction, index) => (
                        <li key={`${index}-${instruction}`}>{instruction}</li>
                      ))}
                    </ol>
                  )}
                  {routeData.destinationIsBuildingAnchor && (
                    <small className="route-disclaimer">This route ends at the mapped building anchor, not the exact room. Confirm the floor and room location on site.</small>
                  )}
                  <small className="route-disclaimer">Walking route powered by the public Valhalla demo service using OpenStreetMap-derived data. Your start and destination coordinates are sent to calculate the route; campus path coverage may be incomplete.</small>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="tracker-board">
          <div className="board-topbar">
            <span className="board-side-label">AMRITANAGAR · COIMBATORE</span>

            <div className="board-logo">
              AMRITA <strong>EXPLORE</strong>
            </div>

            <span className="board-side-label">CAMPUS MAP</span>
          </div>

          <div
            className="tracker-map-viewport"
          >
            <MapContainer
              center={CAMPUS_CENTER}
              zoom={15}
              minZoom={13}
              maxZoom={19}
              zoomControl={false}
              scrollWheelZoom
              className="tracker-map"
            >
            
              
              
            <LabelFreeBasemap />

              <MapController onReady={setMapActions} />
              <MapCoordinatePicker
                onHover={setHoverCoordinates}
                onPick={(coordinates) => {
                  // A second click within 8 m of the placed coordinate pin clears it.
                  const removeExistingPin = pickedCoordinates && distanceInMeters(pickedCoordinates, coordinates) <= 8;
                  setPickedCoordinates(removeExistingPin ? null : coordinates);
                  setCoordinateCopyMessage(removeExistingPin ? "Pin removed." : "");
                }}
              />

              {pickedCoordinates && (
                <Marker
                  position={pickedCoordinates}
                  icon={createCoordinatePinIcon()}
                  interactive={false}
                  keyboard={false}
                  zIndexOffset={2000}
                />
              )}

              {routeData && (
                <Polyline
                  positions={routeData.coordinates}
                  pathOptions={{
                    color: "#8c173d",
                    weight: 6,
                    opacity: 0.92,
                    lineCap: "round",
                    lineJoin: "round",
                  }}
                />
              )}

              {mappedVisibleLocations.map((location) => (
                <Marker
                  key={location.id}
                  position={location.coordinates}
                  icon={createLocationIcon(
                    selectedLocationId === location.id || selectedLocation?.mapAnchorId === location.id,
                    location.category,
                    location.shortName || location.name
                  )}
                  eventHandlers={{
                    click: (event) => {
                      // If a coordinate pin sits on this place marker, clicking the same
                      // spot must still allow the pin to be removed.
                      if (pickedCoordinates && distanceInMeters(pickedCoordinates, location.coordinates) <= 8) {
                        setPickedCoordinates(null);
                        setCoordinateCopyMessage("Pin removed.");
                      }
                      // Do not allow selecting a marker to become a new coordinate pick.
                      L.DomEvent.stopPropagation(event.originalEvent);
                      selectTarget(location);
                    },
                  }}
                >
                  <Popup>
                    <div className="location-popup">
                      <span className="popup-kicker">
                        {location.category.toUpperCase()} //{" "}
                        {location.verified
                          ? "VERIFIED REFERENCE"
                          : "UNVERIFIED"}
                      </span>

                      <strong>{location.name}</strong>
                      <span>{location.description}</span>

                      <button
                        type="button"
                        className="popup-target-button"
                        onClick={() => selectTarget(location)}
                      >
                        VIEW PLACE DETAILS
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {userLocation && (
                <Marker
                  position={userLocation.coordinates}
                  icon={createUserLocationIcon()}
                  zIndexOffset={1000}
                >
                  <Popup>
                    <div className="location-popup">
                      <span className="popup-kicker">YOUR LOCATION // GPS</span>
                      <strong>You are here</strong>
                      <span>Reported accuracy: ±{Math.round(userLocation.accuracy)} m</span>
                    </div>
                  </Popup>
                </Marker>
              )}


            </MapContainer>

            <div className="map-grid-overlay map-grid-overlay-hidden" />

            <div className="map-title-chip">
              <span className="chip-crosshair">⌖</span>
              <div>
                <strong>AMRITA CAMPUS</strong>
                <small>LIVE MAP</small>
              </div>
            </div>

            <div className="map-left-rail">
              <button
                type="button"
                className="rail-button"
                title="Zoom in"
                aria-label="Zoom in"
                onClick={() => mapActions?.zoomIn()}
              >
                +
              </button>

              <button
                type="button"
                className="rail-button rail-me"
                title="Find my current location"
                aria-label="Find my current location"
                onClick={handleLocateMe}
              >
                ME
              </button>

              <button
                type="button"
                className="rail-button rail-center"
                title="Recenter campus"
                aria-label="Recenter campus"
                onClick={() => mapActions?.recenter()}
              >
                ⌖
              </button>

              <button
                type="button"
                className="rail-button"
                title="Zoom out"
                aria-label="Zoom out"
                onClick={() => mapActions?.zoomOut()}
              >
                −
              </button>
            </div>

            <div className="coordinate-inspector" aria-live="polite">
              <div className="coordinate-inspector-heading">
                <span className="coordinate-live-dot" />
                <strong>COORDINATE PICKER</strong>
                <small>{pickedCoordinates ? "POINT SELECTED" : "MOVE OR CLICK MAP"}</small>
              </div>
              <div className="coordinate-inspector-values">
                <div>
                  <small>{pickedCoordinates ? "SELECTED LATITUDE" : "CURSOR LATITUDE"}</small>
                  <strong>{(pickedCoordinates ?? hoverCoordinates) ? (pickedCoordinates ?? hoverCoordinates)[0].toFixed(6) : "—"}</strong>
                </div>
                <div>
                  <small>{pickedCoordinates ? "SELECTED LONGITUDE" : "CURSOR LONGITUDE"}</small>
                  <strong>{(pickedCoordinates ?? hoverCoordinates) ? (pickedCoordinates ?? hoverCoordinates)[1].toFixed(6) : "—"}</strong>
                </div>
              </div>
              <div className="coordinate-inspector-actions">
                <button
                  type="button"
                  className="coordinate-copy-button"
                  disabled={!pickedCoordinates && !hoverCoordinates}
                  onClick={async () => {
                    const coordinates = pickedCoordinates ?? hoverCoordinates;
                    if (!coordinates) return;
                    const value = `${coordinates[0].toFixed(6)}, ${coordinates[1].toFixed(6)}`;
                    try {
                      await navigator.clipboard.writeText(value);
                      setCoordinateCopyMessage("Copied coordinates");
                    } catch {
                      setCoordinateCopyMessage(value);
                    }
                  }}
                >
                  COPY LAT, LONG
                </button>
                <button
                  type="button"
                  className="coordinate-reset-button"
                  disabled={!pickedCoordinates}
                  onClick={() => {
                    setPickedCoordinates(null);
                    setCoordinateCopyMessage("");
                  }}
                >
                  CLEAR PIN
                </button>
              </div>
              {coordinateCopyMessage && <small className="coordinate-copy-message">{coordinateCopyMessage}</small>}
            </div>

            <div className="map-coordinates">
              <span className="coordinates-dot" />
              <span>{mappedVisibleLocations.length} map points · {visibleLocations.length} places in directory</span>
            </div>

          </div>

          <div className="board-bottomline">
            <span>◈ AMRITA VISHWA VIDYAPEETHAM</span>
            <span>INTERACTIVE CAMPUS MAP</span>
          </div>
        </section>

        <section className="tracker-control-dock">
          <div className="control-block action-block">
            <div className="control-heading">
              <span className="control-index">01</span>
              <span>QUICK ACTIONS</span>
            </div>

            <div className="action-buttons">
              <button
                type="button"
                className="tracker-button tracker-button-primary"
                onClick={handleLocateMe}
              >
                <span>◎</span> MY LOCATION
              </button>

              <button
                type="button"
                className="tracker-button"
                onClick={() => mapActions?.recenter()}
              >
                <span>⌖</span> CAMPUS
              </button>

            </div>
          </div>

        </section>

        <footer className="tracker-footer">
          <span>AMRITA CAMPUS EXPLORE · GENESIS HACKATHON</span>
          <span>MAP DATA © OPENFREEMAP · OPENMAPTILES · OPENSTREETMAP · ROUTING VIA VALHALLA</span>
        </footer>
      </section>
    </main>
  );
}

export default App;
