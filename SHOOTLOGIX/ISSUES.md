# ISSUES — ShootLogix Known Issues Log

## [P0] Timeline API crash — wrong column names (FIXED 2026-04-13)
- **Discovered**: 2026-04-13
- **Symptoms**: Timeline tab shows 500 error; `sqlite3.OperationalError: no such column: site`
- **Root cause**: `api_timeline` used `locations.site` (doesn't exist, should be `location_type`) and `location_schedules.prep/filming/wrap` (don't exist, should be `status`). Also `timeline.js` relied on `window._SL` which doesn't exist in the monolith.
- **Fix**: PR fix/2026-04-13-timeline-api-crash — corrected column names + added localStorage fallback for prodId
- **Status**: FIXED

## [P0] Multiple state variable mismatches in picture/security boat operations
- **Discovered**: 2026-04-13 (from open PRs #80, #81, #87, #88, #94)
- **Symptoms**: Picture Boats and Security Boats interactive operations (drag-drop, assignments, day overrides) may reference wrong state properties
- **Likely cause**: The monolith uses different state property names (e.g. `state.pictureBoats` vs `state.pbBoats`) for picture/security boat data
- **Files involved**: `static/app-monolith.js` — picture boat and security boat render/interaction functions
- **Estimated effort**: Medium — need to audit all state property references for these modules

## [P0] Checklist tab may crash on state.production undefined
- **Discovered**: 2026-04-13 (from open PRs #85, #95)
- **Symptoms**: Checklist tab crashes or renders incorrectly
- **Likely cause**: `loadChecklist` references `state.production` which may not be set
- **Files involved**: `static/app-monolith.js` — `loadChecklist`, `generateChecklist`
- **Estimated effort**: Quick fix

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

## [P1] Transport and Helpers lists are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/transport` returns `[]`, `/api/productions/1/helpers` returns `[]` (but helper-assignments has data). No transport vehicles or helpers have been created.
- **Likely cause**: Data was never seeded for these modules, or they need to be created manually by users.
- **Files involved**: `database.py`, `data_loader.py`
- **Estimated effort**: Quick — may just need user to add data through the UI

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
