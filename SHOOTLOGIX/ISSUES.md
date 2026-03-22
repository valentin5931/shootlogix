# ISSUES — ShootLogix Known Issues Log

## [P0] ~~Checklist tab completely non-functional~~ FIXED (2026-03-22)
- **Discovered**: 2026-03-22
- **Fixed**: 2026-03-22 — Branch `fix/2026-03-22-checklist-tab-broken`
- **Root cause**: `state.production` used instead of `state.prodId` in 3 checklist functions
- **Files involved**: `static/app-monolith.js` (lines 12999-13022)

## [P1] Timeline tab has no render implementation
- **Discovered**: 2026-03-22
- **Symptoms**: Clicking the Timeline tab shows an empty panel. `App.renderTimeline` function doesn't exist. The `setTab` handler has a `typeof` guard that prevents errors but the tab does nothing.
- **Files involved**: `static/app-monolith.js` (line 1338)
- **Estimated effort**: Medium — need to implement timeline rendering (Gantt-style view of shooting schedule)

## [P1] Transport vehicles exist (14) but transport list was reported empty
- **Discovered**: 2026-03-22 (updated)
- **Symptoms**: Transport tab actually works — 14 vehicles are in the database and API returns them. Previous report was incorrect (tested without auth token).
- **Status**: NOT AN ISSUE — transport works correctly

## [P2] Fleet/Crew sub-tab nav element moves between DOM panels
- **Discovered**: 2026-03-22
- **Symptoms**: The fleet sub-nav is injected via `prepend()` and moved between panels on each sub-tab switch, which may cause layout shifts. However, event handlers and rendering all work correctly.
- **Likely cause**: The sub-nav DOM element is moved between view panels rather than being kept in a fixed position.
- **Files involved**: `static/app-monolith.js` (renderFleetUnified, renderCrewUnified)
- **Estimated effort**: Quick fix — cosmetic improvement

## [P1] Picture Boats and Security Boats lists are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/picture-boats` returns `[]`, `/api/productions/1/security-boats` returns `[]`. All boats are in the main boats table with category "picture".
- **Likely cause**: The data loader may not be seeding picture_boats and security_boats tables separately, or the boats were all created in the main `boats` table regardless of intended category.
- **Files involved**: `database.py`, `data_loader.py`, `app.py` (picture-boats/security-boats routes)
- **Estimated effort**: Medium — need to investigate data model and potentially migrate boats to correct tables

## [P1] Helpers (Labour) list is empty but 73 helper-assignments exist
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/helpers` returns `[]` but `helper_assignments` table has 73 entries with `helper_id=NULL`. Workers were never created — assignments are "anonymous" cost entries linked to boat_functions with context=labour.
- **Likely cause**: Data migration from BATEAUX created labour-context boat_functions and helper_assignments but never created helper records. Users need to create workers through the UI.
- **Files involved**: `database.py`, `data_loader.py`
- **Estimated effort**: Quick — user needs to add workers through the Labour tab UI

## [P1] Fuel entries and machinery are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/fuel-entries` returns `[]`, `/api/productions/1/fuel-machinery` returns `[]`
- **Likely cause**: No data seeded for fuel module
- **Files involved**: `database.py`
- **Estimated effort**: Quick — user needs to add data

## [P1] Guards list is empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/guards` returns `[]` but guard-posts has data (1643 bytes)
- **Likely cause**: Guards need to be created separately from guard posts
- **Files involved**: `database.py`
- **Estimated effort**: Quick

## [P2] Module files in static/modules/ are dead code
- **Discovered**: 2026-03-22
- **Symptoms**: Files like `fleet.js`, `crew.js`, `today.js`, `documents.js`, etc. in `static/modules/` reference `window._SL` which doesn't exist. They are never loaded by `index.html`.
- **Likely cause**: These were written for a module-loading system that was never implemented in the monolith. The equivalent functionality has now been added directly to `app-monolith.js`.
- **Files involved**: All files in `static/modules/`
- **Estimated effort**: Quick cleanup — these files could be removed or kept for reference
