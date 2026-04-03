# ISSUES — ShootLogix Known Issues Log

## [FIXED] [P1] Auth token key mismatch in dashboard-v2.js and timeline.js
- **Discovered**: 2026-04-03
- **Fixed**: 2026-04-03
- **Symptoms**: DashboardV2 executive KPI panel and Timeline tab showed empty/error state. All API calls from these modules returned 401.
- **Root cause**: `dashboard-v2.js` and `timeline.js` read `localStorage.getItem('sl_token')` but the app stores the JWT as `'access_token'`.
- **Files involved**: `static/js/dashboard-v2.js`, `static/js/timeline.js`
- **Fix**: Changed all 3 occurrences of `'sl_token'` to `'access_token'`

## [FIXED] [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
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

## [PARTIALLY FIXED] [P1] Transport and Helpers lists are empty
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-03
- **Symptoms**: `/api/productions/1/transport` returns `[]` (legacy schedule endpoint), `/api/productions/1/helpers` returns `[]` (but 73 helper-assignments exist with function data).
- **Status**: Transport is NOT empty — `/api/productions/1/transport-vehicles` returns 14 vehicles correctly. The front-end calls the correct endpoint. Helpers table is genuinely empty (0 rows) but 73 helper-assignments and 73 labour functions exist. The Labour tab renders function groups/schedules from assignments.
- **Likely cause**: Helper entities were never created; assignments reference boat_function_ids directly.
- **Files involved**: `database.py`, `data_loader.py`
- **Estimated effort**: Quick — helpers need to be created by users through the UI

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
