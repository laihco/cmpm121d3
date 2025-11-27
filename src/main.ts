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

// deno-lint-ignore prefer-const
let playerMarker: leaflet.Marker;

// movement mode state
type MovementMode = "buttons" | "geolocation";
let geoWatchId: number | null = null;

//Movement controls

const dpad = document.createElement("div");
dpad.id = "dpad";

// Create buttons
const moveNorthBtn = document.createElement("button");
moveNorthBtn.textContent = "▲";

const moveSouthBtn = document.createElement("button");
moveSouthBtn.textContent = "▼";

const moveWestBtn = document.createElement("button");
moveWestBtn.textContent = "◀";

const moveEastBtn = document.createElement("button");
moveEastBtn.textContent = "▶";

// Helper to make a 3×3 grid cell
function makeCell(child: HTMLElement | null): HTMLDivElement {
  const cell = document.createElement("div");
  if (child) cell.appendChild(child);
  return cell;
}

// Row 1: [ empty, N, empty ]
dpad.appendChild(makeCell(null));
dpad.appendChild(makeCell(moveNorthBtn));
dpad.appendChild(makeCell(null));

// Row 2: [ W, empty, E ]
dpad.appendChild(makeCell(moveWestBtn));
dpad.appendChild(makeCell(null));
dpad.appendChild(makeCell(moveEastBtn));

// Row 3: [ empty, S, empty ]
dpad.appendChild(makeCell(null));
dpad.appendChild(makeCell(moveSouthBtn));
dpad.appendChild(makeCell(null));

controlPanelDiv.appendChild(dpad);

// Movement mode selector
const movementLabel = document.createElement("label");
movementLabel.textContent = "Movement: ";

const movementSelect = document.createElement("select");

const optButtons = document.createElement("option");
optButtons.value = "buttons";
optButtons.textContent = "Buttons (D-pad)";

const optGeo = document.createElement("option");
optGeo.value = "geolocation";
optGeo.textContent = "Geolocation";

movementSelect.appendChild(optButtons);
movementSelect.appendChild(optGeo);
movementSelect.value = "buttons";

movementLabel.appendChild(movementSelect);
controlPanelDiv.appendChild(movementLabel);

// New Game button
const newGameBtn = document.createElement("button");
newGameBtn.textContent = "New Game";
controlPanelDiv.appendChild(newGameBtn);
newGameBtn.addEventListener("click", () => {
  startNewGame();
});

function setButtonsEnabled(enabled: boolean) {
  moveNorthBtn.disabled = !enabled;
  moveSouthBtn.disabled = !enabled;
  moveWestBtn.disabled = !enabled;
  moveEastBtn.disabled = !enabled;
}

function enableGeolocationMovement() {
  if (!("geolocation" in navigator)) {
    alert("Geolocation not supported in this browser.");
    movementSelect.value = "buttons";
    return;
  }
  if (geoWatchId !== null) return;

  geoWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      const newI = latToIndex(lat);
      const newJ = lngToIndex(lng);

      setPlayerCell(newI, newJ);
    },
    (err) => {
      console.warn("Geolocation error:", err);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000,
    },
  );
}

function disableGeolocationMovement() {
  if (geoWatchId !== null && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(geoWatchId);
  }
  geoWatchId = null;
}

movementSelect.addEventListener("change", () => {
  const mode = movementSelect.value as MovementMode;

  if (mode === "buttons") {
    disableGeolocationMovement();
    setButtonsEnabled(true);
  } else {
    setButtonsEnabled(false);
    enableGeolocationMovement();
  }
});

// default: buttons enabled
setButtonsEnabled(true);

// Helper to set the player to a specific grid cell (absolute move)
function setPlayerCell(i: number, j: number) {
  playerI = i;
  playerJ = j;

  const newPos = cellCenterLatLng(playerI, playerJ);

  playerMarker.setLatLng(newPos);
  map.panTo(newPos);

  drawVisibleGrid();
  saveGameState();
}

// Helper to move player by grid offsets (dI, dJ)
function movePlayer(dI: number, dJ: number) {
  setPlayerCell(playerI + dI, playerJ + dJ);
}

// Wire up buttons
moveNorthBtn.addEventListener("click", () => movePlayer(1, 0)); // north
moveSouthBtn.addEventListener("click", () => movePlayer(-1, 0)); // south
moveEastBtn.addEventListener("click", () => movePlayer(0, 1)); // east
moveWestBtn.addEventListener("click", () => movePlayer(0, -1)); // west

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
const VICTORY_TARGET_VALUE = 250;
let hasWon = false;

function latToIndex(lat: number): number {
  return Math.floor((lat - CLASSROOM_LATLNG.lat) / TILE_DEGREES);
}

function lngToIndex(lng: number): number {
  return Math.floor((lng - CLASSROOM_LATLNG.lng) / TILE_DEGREES);
}

let playerI = latToIndex(CLASSROOM_LATLNG.lat);
let playerJ = lngToIndex(CLASSROOM_LATLNG.lng);

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

// Memento-style state for modified cells only
type CellState = {
  removed: boolean; // true if token has been taken
  valueOverride: number | null; // if set, this is the current token value
};

// Only cells that have been modified get entries here (Flyweight-ish)
const cellStates = new Map<string, CellState>();

function getCellState(i: number, j: number): CellState | undefined {
  return cellStates.get(cellKey(i, j));
}

function ensureCellState(i: number, j: number): CellState {
  const key = cellKey(i, j);
  let state = cellStates.get(key);
  if (!state) {
    state = { removed: false, valueOverride: null };
    cellStates.set(key, state);
  }
  return state;
}

// Current token value in this cell, or null if no token
function currentTokenValue(i: number, j: number): number | null {
  const state = getCellState(i, j);
  if (state?.removed) return null;
  if (state?.valueOverride != null) return state.valueOverride;

  // Unmodified cells are computed on demand from luck (no stored memory)
  if (hasInitialToken(i, j)) {
    return initialTokenValue(i, j);
  }

  return null;
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

      const value = currentTokenValue(i, j);
      if (value !== null) {
        leaflet
          .marker(cellCenterLatLng(i, j), {
            icon: leaflet.divIcon({
              className: "cell-label",
              html: value.toString(),
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
playerMarker = leaflet.marker(cellCenterLatLng(playerI, playerJ));
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

//Real-world movement via device GPS

if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      // Convert real-world lat/lng to our grid indices
      const newI = latToIndex(lat);
      const newJ = lngToIndex(lng);

      setPlayerCell(newI, newJ);
    },
    (err) => {
      console.warn("Geolocation error:", err);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000,
    },
  );
} else {
  console.warn("Geolocation not supported in this browser.");
}

// Display the player's points and held token
let playerPoints = 0;
let carriedToken: { i: number; j: number; value: number } | null = null;

function updateStatusPanel() {
  const heldText = carriedToken
    ? `${carriedToken.value} pts (from ${carriedToken.i},${carriedToken.j})`
    : "None";

  const victoryText = hasWon
    ? ` | 🎉 Victory! Held token reached at least ${VICTORY_TARGET_VALUE} points.`
    : "";

  statusPanelDiv.innerHTML =
    `Score: ${playerPoints} | Held token: ${heldText}${victoryText}`;
}

updateStatusPanel();

function startNewGame() {
  // Clear persisted state
  if ("localStorage" in globalThis) {
    globalThis.localStorage.removeItem(STORAGE_KEY);
  }

  // Reset runtime state
  playerI = latToIndex(CLASSROOM_LATLNG.lat);
  playerJ = lngToIndex(CLASSROOM_LATLNG.lng);
  playerPoints = 0;
  carriedToken = null;
  hasWon = false;
  cellStates.clear();

  setPlayerCell(playerI, playerJ);
  updateStatusPanel();
  saveGameState();
}

function checkVictory() {
  if (!carriedToken || hasWon) return;

  if (carriedToken.value >= VICTORY_TARGET_VALUE) {
    hasWon = true;
    updateStatusPanel();
    saveGameState();
  }
}

const STORAGE_KEY = "psGoGameState";

type SavedState = {
  playerI: number;
  playerJ: number;
  playerPoints: number;
  hasWon: boolean;
  carriedToken: { i: number; j: number; value: number } | null;
  cellStates: Array<[string, CellState]>;
};

function saveGameState() {
  if (!("localStorage" in window)) return;

  const data: SavedState = {
    playerI,
    playerJ,
    playerPoints,
    hasWon,
    carriedToken,
    cellStates: Array.from(cellStates.entries()),
  };

  try {
    self.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("Failed to save game state:", err);
  }
}

function loadGameState() {
  if (!("localStorage" in window)) return;

  const raw = self.localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const data = JSON.parse(raw) as SavedState;

    if (typeof data.playerI === "number") playerI = data.playerI;
    if (typeof data.playerJ === "number") playerJ = data.playerJ;
    if (typeof data.playerPoints === "number") playerPoints = data.playerPoints;
    if (typeof data.hasWon === "boolean") hasWon = data.hasWon;

    carriedToken = data.carriedToken ?? null;

    cellStates.clear();
    if (Array.isArray(data.cellStates)) {
      for (const [key, state] of data.cellStates) {
        cellStates.set(key, state);
      }
    }
  } catch (err) {
    console.warn("Failed to load game state:", err);
  }
}

// Make sure we save if the tab is about to close
self.addEventListener("beforeunload", saveGameState);

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

  rect.bindPopup(() => {
    // Recompute distance using *current* player position
    const di = Math.abs(i - playerI);
    const dj = Math.abs(j - playerJ);
    const inRange = Math.max(di, dj) <= INTERACTION_RADIUS_CELLS;

    const valueHere = currentTokenValue(i, j);

    // Too far away
    if (!inRange) {
      const popupDiv = document.createElement("div");
      popupDiv.innerHTML = `
        <div>There is a cache here at "${i},${j}", but it's too far away.</div>
        <div>Move within ${INTERACTION_RADIUS_CELLS} cells to interact.</div>
      `;
      return popupDiv;
    }

    // No token here anymore
    if (valueHere === null) {
      const popupDiv = document.createElement("div");
      popupDiv.innerHTML = `
        <div>The cache at "${i},${j}" is empty.</div>
      `;
      return popupDiv;
    }

    // Player is holding a token already
    if (carriedToken !== null) {
      if (carriedToken.value === valueHere) {
        const popupDiv = document.createElement("div");
        popupDiv.innerHTML = `
          <div>You are holding a ${carriedToken.value}-point token.</div>
          <div>There is also a ${valueHere}-point token here at "${i},${j}".</div>
          <div>Combine them into a ${
          valueHere * 2
        }-point token in this cell?</div>
          <button id="combine">Combine tokens</button>
        `;

        popupDiv
          .querySelector<HTMLButtonElement>("#combine")!
          .addEventListener("click", () => {
            const state = ensureCellState(i, j);
            state.removed = false;
            state.valueOverride = valueHere * 2;

            // The held token is consumed
            carriedToken = null;

            // (Score doesn't change here; player must pick up later if you want.)
            updateStatusPanel();

            // Redraw grid so label updates
            drawVisibleGrid();
            saveGameState();

            rect.closePopup();
          });

        return popupDiv;
      } else {
        // Values don't match: cannot combine, cannot pick up another
        const popupDiv = document.createElement("div");
        popupDiv.innerHTML = `
          <div>There is a ${valueHere}-point token here at "${i},${j}".</div>
          <div>You are already holding a ${carriedToken.value}-point token,</div>
          <div>and only equal-value tokens can be combined.</div>
        `;
        return popupDiv;
      }
    }

    // Normal case: in range, token present, hands free -> pick up
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>There is a ${valueHere}-point token here at "${i},${j}".</div>
      <button id="pick">Pick up token</button>
    `;

    popupDiv
      .querySelector<HTMLButtonElement>("#pick")!
      .addEventListener("click", () => {
        const state = ensureCellState(i, j);
        state.removed = true;
        state.valueOverride = null;

        // Player now carries this token
        carriedToken = { i, j, value: valueHere };

        // Award points immediately (or move this to a "cash in" mechanic later)
        playerPoints += valueHere;
        updateStatusPanel();
        checkVictory();

        // Refresh grid so label disappears
        drawVisibleGrid();
        saveGameState();

        rect.closePopup();
      });

    return popupDiv;
  });
}

loadGameState();
setPlayerCell(playerI, playerJ);
updateStatusPanel();

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
