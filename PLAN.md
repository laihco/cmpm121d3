# PLAN.md

## D3.a — Core Mechanics

### Map & Rendering

[x] Initialize Leaflet map centered at fixed classroom coordinates.
[x] Render rectangular lat–long grid cells (fixed size, e.g. 0.0001°).
[x] Display token value or emptiness directly on each cell.
[X] Ensure map shows cells out to full visible bounds.
[x] Restrict interaction to cells within ~3 grid steps of player.

### Token Logic

[x] Implement deterministic token spawning using provided luck hash.
[x] Allow picking up at most one token and remove it from its cell.
[x] Display held token clearly on screen.
[x] Allow combining held token with equal-value token in a cell to produce doubled-value token.
[x] Detect victory when held token reaches target value (e.g. 8 or 16).

## D3.b — Globe-Spanning Gameplay

### Movement & World

[x] Add buttons to move player N/S/E/W by one grid cell.
[x] Reset cells when they leave visibility (no memory yet; allow farming).

### Interaction Rules

[x] Player can scroll map independently of player movement.
[x] Only cells near the character are interactable.
[x] Increase victory threshold to require higher crafting value.

## D3.c — Object Persistence

### Map

[x] Cells appear to remember their state as you move around the map (within a single page load).

## D3.d — Real-world Space & Time

### Player Movement

[ ] Integrate browser Geolocation API to move player based on real-world location.
[ ] Wrap movement logic in a Facade-style interface separating input source.
[ ] Add way to switch between geolocation and button-based movement (UI or query string).

### Persistence

[ ] Use localStorage to store game state across sessions (cells, player pos, held token).
[ ] Provide UI option to start a new game and clear saved data.

### Gameplay2

[ ] Player moves by real-world device motion.
[ ] Game fully resumes after tab close and reopen.
