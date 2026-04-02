# ISSUES — ShootLogix Known Issues Log

## [RESOLVED] [P1] 5 undefined CSS variables causing invisible UI elements
- **Discovered**: 2026-04-02
- **Resolved**: 2026-04-02 — Added `--bg`, `--bg-1`, `--bg-3`, `--bg-input`, `--text-muted` to `:root` and `[data-theme="light"]`
- **Branch**: fix/2026-04-02-missing-css-vars-and-transport-query

## [RESOLVED] [P1] Transport schedule query uses wrong table name
- **Discovered**: 2026-04-02
- **Resolved**: 2026-04-02 — Changed `JOIN vehicles` to `JOIN transport_vehicles` in `get_transport_schedules()`
- **Branch**: fix/2026-04-02-missing-css-vars-and-transport-query

## [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Discovered**: 2026-03-22
- **Symptoms**: When clicking Fleet > Picture Boats or Fleet > Security Boats, the sub-tab content is rendered in the original view panel. Interactive elements (drag-drop, inline edits) work because they use the original DOM, but the fleet sub-nav is injected via `prepend()` which may cause layout shifts.
- **Likely cause**: The fleet/crew unified tabs switch the active view panel rather than cloning content, so event handlers work. However, the injected sub-nav element is moved between panels on each sub-tab switch.
- **Files involved**: `static/app-monolith.js` (renderFleetUnified, renderCrewUnified)
- **Estimated effort**: Quick fix — may need to keep sub-nav in a fixed position outside view panels

## [BY DESIGN] Picture Boats and Security Boats lists are empty
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-02
- **Status**: By design. The `boats` table (46 entries) stores the generic fleet. `picture_boats` and `security_boats` are separate tables for specialized boat management. The data loader only seeds boat functions (roles), not the boats themselves — users create Picture/Security Boats through the UI. The CRUD API works correctly (tested).

## [BY DESIGN] Transport and Helpers lists
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-02
- **Status**: Transport vehicles ARE seeded (14 vehicles in `transport_vehicles`). The `/transport-vehicles` endpoint returns them correctly. Helpers (labour) are empty — users create them via UI. The 73 `boat_functions` with `context=labour` and 73 `helper_assignments` are pre-populated for assignment scaffolding.

## [BY DESIGN] Fuel entries, machinery, and guards are empty
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-02
- **Status**: By design. These modules are operational but have no seeded data — users create fuel entries, machinery, and guards through the UI. Guard posts (8) are pre-seeded as the structural scaffold.

## [P2] Module files in static/modules/ are dead code
- **Discovered**: 2026-03-22
- **Symptoms**: Files like `fleet.js`, `crew.js`, `today.js`, `documents.js`, etc. in `static/modules/` reference `window._SL` which doesn't exist. They are never loaded by `index.html`.
- **Likely cause**: These were written for a module-loading system that was never implemented in the monolith. The equivalent functionality has now been added directly to `app-monolith.js`.
- **Files involved**: All files in `static/modules/`
- **Estimated effort**: Quick cleanup — these files could be removed or kept for reference
