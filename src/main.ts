// main.ts
// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css"; // supporting style for Leaflet
import "./style.css"; // student-controlled page style

// Fix missing marker images
import "./_leafletWorkaround.ts"; // fixes for missing Leaflet images

// Import our luck function
import luck from "./_luck.ts";

// Create basic UI elements

const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.append(controlPanelDiv);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);

// Our classroom location
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;
const INTERACTION_RADIUS_CELLS = 3;

function latToIndex(lat: number): number {
  return Math.floor((lat - CLASSROOM_LATLNG.lat) / TILE_DEGREES);
}

function lngToIndex(lng: number): number {
  return Math.floor((lng - CLASSROOM_LATLNG.lng) / TILE_DEGREES);
}

const PLAYER_I = latToIndex(CLASSROOM_LATLNG.lat);
const PLAYER_J = lngToIndex(CLASSROOM_LATLNG.lng);

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Helper to compute lat/lng bounds of a grid cell (i, j)
function cellBounds(i: number, j: number): leaflet.LatLngBoundsExpression {
  const origin = CLASSROOM_LATLNG;
  return [
    [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
    [origin.lat + (i + 1) * TILE_DEGREES, origin.lng + (j + 1) * TILE_DEGREES],
  ];
}

// Center point of a grid cell (i, j)
function cellCenterLatLng(i: number, j: number): leaflet.LatLng {
  const origin = CLASSROOM_LATLNG;
  return leaflet.latLng(
    origin.lat + (i + 0.5) * TILE_DEGREES,
    origin.lng + (j + 0.5) * TILE_DEGREES,
  );
}

// --- Token helpers & state ---

function cellKey(i: number, j: number): string {
  return `${i},${j}`;
}

// Deterministic initial token presence
function hasInitialToken(i: number, j: number): boolean {
  return luck([i, j, "tokenPresent"].toString()) < CACHE_SPAWN_PROBABILITY;
}

// Deterministic initial token value
function initialTokenValue(i: number, j: number): number {
  return Math.floor(luck([i, j, "tokenValue"].toString()) * 100);
}

// Tokens that have been picked up and removed from the map
const removedTokens = new Set<string>();

// Current world view: does this cell still have a token?
function cellHasToken(i: number, j: number): boolean {
  return hasInitialToken(i, j) && !removedTokens.has(cellKey(i, j));
}

let gridLayerGroup: leaflet.LayerGroup | null = null;

function drawVisibleGrid() {
  const bounds = map.getBounds();

  // Convert visible lat/lng to cell indices
  const iMin = latToIndex(bounds.getSouth());
  const iMax = latToIndex(bounds.getNorth());
  const jMin = lngToIndex(bounds.getWest());
  const jMax = lngToIndex(bounds.getEast());

  // For performance: clear previous grid layers
  if (gridLayerGroup) {
    gridLayerGroup.clearLayers();
  } else {
    gridLayerGroup = leaflet.layerGroup().addTo(map);
  }

  const layerGroup = gridLayerGroup;

  // Draw cells covering all visible region
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      // Outline (non-interactive so it doesn't block clicks)
      leaflet
        .rectangle(cellBounds(i, j), {
          color: "#888",
          weight: 1,
          fillOpacity: 0,
          interactive: false,
        })
        .addTo(layerGroup);

      // Only draw a label if this cell *currently* has a token
      if (cellHasToken(i, j)) {
        const tokenValue = initialTokenValue(i, j);
        leaflet
          .marker(cellCenterLatLng(i, j), {
            icon: leaflet.divIcon({
              className: "cell-label",
              html: tokenValue.toString(),
            }),
            interactive: false,
          })
          .addTo(layerGroup);
      }
    }
  }
}

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(CLASSROOM_LATLNG);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// Display the player's points
let playerPoints = 0;
let carriedToken: { i: number; j: number; value: number } | null = null;
statusPanelDiv.innerHTML = "No points yet...";

// Add caches to the map by cell numbers
function spawnCache(i: number, j: number) {
  // Only create a cache if this cell *initially* has a token
  if (!hasInitialToken(i, j)) return;

  // Convert cell numbers into lat/lng bounds
  const origin = CLASSROOM_LATLNG;
  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
    [origin.lat + (i + 1) * TILE_DEGREES, origin.lng + (j + 1) * TILE_DEGREES],
  ]);

  // Add a rectangle to the map to represent the cache
  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  const di = Math.abs(i - PLAYER_I);
  const dj = Math.abs(j - PLAYER_J);
  const inRange = Math.max(di, dj) <= INTERACTION_RADIUS_CELLS;

  rect.bindPopup(() => {
    const key = cellKey(i, j);
    const hasTokenNow = cellHasToken(i, j);

    // Too far away
    if (!inRange) {
      const popupDiv = document.createElement("div");
      popupDiv.innerHTML = `
        <div>There is a cache here at "${i},${j}", but it's too far away.</div>
        <div>Move within ${INTERACTION_RADIUS_CELLS} cells to interact.</div>
      `;
      return popupDiv;
    }

    // Token already collected
    if (!hasTokenNow) {
      const popupDiv = document.createElement("div");
      popupDiv.innerHTML = `
        <div>The cache at "${i},${j}" is empty.</div>
        <div>The token has already been collected.</div>
      `;
      return popupDiv;
    }

    // Player already holding a token
    if (carriedToken !== null) {
      const popupDiv = document.createElement("div");
      popupDiv.innerHTML = `
        <div>There is a token here at "${i},${j}".</div>
        <div>You are already carrying a token and can't pick up another.</div>
      `;
      return popupDiv;
    }

    // Normal case: in range, token present, hands free
    const tokenValue = initialTokenValue(i, j);

    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>There is a token here at "${i},${j}".</div>
      <div>It is worth <span id="value">${tokenValue}</span> points.</div>
      <button id="pick">Pick up token</button>
    `;

    popupDiv
      .querySelector<HTMLButtonElement>("#pick")!
      .addEventListener("click", () => {
        // Mark token as removed from this cell
        removedTokens.add(key);

        // Player now carries this token
        carriedToken = { i, j, value: tokenValue };

        // Optional: immediately add to score
        playerPoints += tokenValue;
        statusPanelDiv.innerHTML =
          `${playerPoints} points accumulated (carrying token from ${i},${j})`;

        // Refresh grid so label disappears
        drawVisibleGrid();

        // Close the popup
        rect.closePopup();
      });

    return popupDiv;
  });
}

// Look around the player's neighborhood for caches to spawn
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    if (hasInitialToken(i, j)) {
      spawnCache(i, j);
    }
  }
}

drawVisibleGrid();
map.on("resize", drawVisibleGrid);
map.on("moveend", drawVisibleGrid);
map.on("zoomend", drawVisibleGrid);
