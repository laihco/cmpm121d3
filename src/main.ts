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

function drawVisibleGrid() {
  const bounds = map.getBounds();

  // Convert visible lat/lng to cell indices
  const iMin = latToIndex(bounds.getSouth());
  const iMax = latToIndex(bounds.getNorth());
  const jMin = lngToIndex(bounds.getWest());
  const jMax = lngToIndex(bounds.getEast());

  // For performance: clear previous grid layers
  if ((drawVisibleGrid as any)._layerGroup) {
    (drawVisibleGrid as any)._layerGroup.clearLayers();
  } else {
    (drawVisibleGrid as any)._layerGroup = leaflet.layerGroup().addTo(map);
  }

  const layerGroup = (drawVisibleGrid as any)._layerGroup;

  // Draw cells covering all visible region
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      // Outline
      leaflet
        .rectangle(cellBounds(i, j), {
          color: "#888",
          weight: 1,
          fillOpacity: 0,
          interactive: false,
        })
        .addTo(layerGroup);

      // Token or empty indicator
      const hasToken = luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY;
      const tokenText = hasToken
        ? Math.floor(luck([i, j, "initialValue"].toString()) * 100).toString()
        : "·";

      leaflet
        .marker(cellCenterLatLng(i, j), {
          icon: leaflet.divIcon({
            className: "cell-label",
            html: tokenText,
          }),
          interactive: false,
        })
        .addTo(layerGroup);
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
statusPanelDiv.innerHTML = "No points yet...";

// Add caches to the map by cell numbers
function spawnCache(i: number, j: number) {
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
    if (!inRange) {
      // Too far: show non-interactive message
      const popupDiv = document.createElement("div");
      popupDiv.innerHTML = `
        <div>There is a cache here at "${i},${j}", but it's too far away.</div>
        <div>Move within ${INTERACTION_RADIUS_CELLS} cells to interact.</div>
      `;
      return popupDiv;
    }

    let pointValue = Math.floor(
      luck([i, j, "initialValue"].toString()) * 100,
    );

    // The popup offers a description and button
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
        <div>There is a cache here at "${i},${j}". It has value <span id="value">${pointValue}</span>.</div>
        <button id="poke">poke</button>`;

    // Clicking the button decrements the cache's value and increments the player's points
    popupDiv
      .querySelector<HTMLButtonElement>("#poke")!
      .addEventListener("click", () => {
        pointValue--;
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
          pointValue.toString();
        playerPoints++;
        statusPanelDiv.innerHTML = `${playerPoints} points accumulated`;
      });

    return popupDiv;
  });
}

// Look around the player's neighborhood for caches to spawn
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    // If location i,j is lucky enough, spawn a cache!
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(i, j);
    }
  }
}

drawVisibleGrid();
map.on("resize", drawVisibleGrid);
map.on("moveend", drawVisibleGrid);
map.on("zoomend", drawVisibleGrid);
