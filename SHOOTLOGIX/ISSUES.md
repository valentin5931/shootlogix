# ISSUES — ShootLogix Known Issues Log

## [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Discovered**: 2026-03-22
- **Symptoms**: When clicking Fleet > Picture Boats or Fleet > Security Boats, the sub-tab content is rendered in the original view panel. Interactive elements (drag-drop, inline edits) work because they use the original DOM, but the fleet sub-nav is injected via `prepend()` which may cause layout shifts.
- **Likely cause**: The fleet/crew unified tabs switch the active view panel rather than cloning content, so event handlers work. However, the injected sub-nav element is moved between panels on each sub-tab switch.
- **Files involved**: `static/app-monolith.js` (renderFleetUnified, renderCrewUnified)
- **Estimated effort**: Quick fix — may need to keep sub-nav in a fixed position outside view panels

## [P1] Picture Boats and Security Boats lists are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/picture-boats` returns `[]`, `/api/productions/1/security-boats` returns `[]`. All boats are in the main boats table with category "picture".
- **Likely cause**: The data loader may not be seeding picture_boats and security_boats tables separately, or the boats were all created in the main `boats` table regardless of intended category.
- **Files involved**: `database.py`, `data_loader.py`, `app.py` (picture-boats/security-boats routes)
- **Estimated effort**: Medium — need to investigate data model and potentially migrate boats to correct tables

## [P1] Helpers list is empty (transport is now populated)
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-13 — Transport vehicles now has 14 entries (data was seeded). `/api/productions/1/transport-vehicles` returns 14 items. The old `/api/productions/1/transport` route calls the wrong function (`get_transport_schedules`) but the frontend correctly uses `/transport-vehicles`.
- **Symptoms**: `/api/productions/1/helpers` returns `[]` (but helper-assignments has 73 rows with helper_id=None). Helper assignments are function-based, not worker-based.
- **Likely cause**: Helpers table was never populated. The helper_assignments link to boat_functions with context="labour" but no actual helper entities exist.
- **Files involved**: `database.py`, `data_loader.py`
- **Estimated effort**: Quick — users can add helpers through the UI; the Labour tab works with assignments alone

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

## [P1] Boats tab refresh loaded all-context assignments (FIXED 2026-04-13)
- **Discovered**: 2026-04-13
- **Symptoms**: After pull-to-refresh on the Boats tab, `_reloadCurrentTab()` fetched `/assignments` without `?context=boats`, potentially loading assignments from all departments instead of just boats.
- **Likely cause**: Copy-paste omission when `_reloadCurrentTab` was written — the initial load function `loadBoatsData()` correctly used `?context=boats` but the refresh path didn't.
- **Files involved**: `static/app-monolith.js` (line 13003)
- **Fix**: Added `?context=boats` parameter. Branch: fix/2026-04-13-boats-refresh-wrong-assignments
- **Estimated effort**: Quick fix (done)

## [P2] Module files in static/modules/ are dead code
- **Discovered**: 2026-03-22
- **Symptoms**: Files like `fleet.js`, `crew.js`, `today.js`, `documents.js`, etc. in `static/modules/` reference `window._SL` which doesn't exist. They are never loaded by `index.html`.
- **Likely cause**: These were written for a module-loading system that was never implemented in the monolith. The equivalent functionality has now been added directly to `app-monolith.js`.
- **Files involved**: All files in `static/modules/`
- **Estimated effort**: Quick cleanup — these files could be removed or kept for reference
