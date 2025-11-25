# PLAN.md

## D3.a — Core Mechanics

### Map & Rendering

[ ] Initialize Leaflet map centered at fixed classroom coordinates.
[ ] Render rectilinear lat–long grid cells (fixed size, e.g. 0.0001°).
[ ] Display token value or emptiness directly on each cell.
[ ] Ensure map shows cells out to full visible bounds.
[ ] Restrict interaction to cells within ~3 grid steps of player.

### Token Logic

[ ] Implement deterministic token spawning using provided luck hash.
[ ] Allow picking up at most one token and remove it from its cell.
[ ] Display held token clearly on screen.
[ ] Allow combining held token with equal-value token in a cell to produce doubled-value token.
[ ] Detect victory when held token reaches target value (e.g. 8 or 16).
[ ] Maintain consistent initial cell state across page loads (deterministic, not persistent).

## D3.b — Globe-Spanning Gameplay

### Movement & World

[ ] Add buttons to move player N/S/E/W by one grid cell.
[ ] Spawn/despawn cells so screen is always filled with grid cells.
[ ] Use global coordinate system anchored at Null Island (0,0).
[ ] Reset cells when they leave visibility (no memory yet; allow farming).

### Interaction Rules

[ ] Player can scroll map independently of player movement.
[ ] Only cells near the character are interactable.
[ ] Farming is allowed: cells respawn fresh when re-entered.
[ ] Increase victory threshold to require higher crafting value.

### Technical Tools

[ ] Create data type for cell coordinates (i,j).
[ ] Implement conversion between lat/long ↔ cell (i,j) ↔ cell bounds.
[ ] Use Leaflet moveend event to update visible cells.

## D3.c — Object Persistence

### Storage & Memory

[ ] Apply Flyweight or similar strategy so unmodified off-screen cells need no storage.
[ ] Use Memento-style serialization to store modified cell states.
[ ] Restore modified cell state when previously modified cell comes back into view.

### Gameplay

[ ] Cells retain modified state across visibility changes.
[ ] In-session persistence only (no page reload persistence yet).

### Rendering

[ ] Rebuild visible grid on each map movement using stored state + deterministic default values.

## D3.d — Real-world Space & Time

### Player Movement

[ ] Integrate browser Geolocation API to move player based on real-world location.
[ ] Wrap movement logic in a Facade-style interface separating input source.
[ ] Add way to switch between geolocation and button-based movement (UI or query string).

### Persistence

[ ] Use localStorage to store game state across sessions (cells, player pos, held token).
[ ] Provide UI option to start a new game and clear saved data.

### Gameplay

[ ] Player moves by real-world device motion.
[ ] Game fully resumes after tab close and reopen.
