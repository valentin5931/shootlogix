# ISSUES — ShootLogix Known Issues Log

## [P0] ~~Fuel entry creation crashes with 500~~ (FIXED 2026-04-10)
- **Discovered**: 2026-04-10
- **Fixed**: 2026-04-10 — branch `fix/2026-04-10-fuel-entry-crash-missing-source-type`
- **Symptoms**: POST to `/api/productions/:id/fuel-entries` without `source_type` or `assignment_id` returned raw 500 HTML error page
- **Root cause**: `validate_fuel_entry()` didn't validate DB NOT NULL fields `source_type` and `assignment_id`
- **Fix**: Added validation + global IntegrityError handler

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

## [P0] No global error handler for unhandled exceptions — raw 500 HTML pages
- **Discovered**: 2026-04-10
- **Symptoms**: Any unhandled exception (e.g. IntegrityError) returns a Werkzeug debugger HTML page in dev mode, or a blank 500 in production, instead of a JSON error
- **Likely cause**: Missing global exception handler; only ValidationError has a handler. IntegrityError handler was added in the 2026-04-10 fix, but other exception types (e.g. OperationalError, TypeError) still lack handlers.
- **Files involved**: `app.py` (error handlers section)
- **Estimated effort**: Quick fix — add a generic 500 handler that returns JSON

## [P1] All boats in `boats` table have category='picture' — but picture_boats/security_boats tables are empty
- **Discovered**: 2026-04-10 (reconfirmed from 2026-03-22)
- **Symptoms**: 47 boats exist in `boats` table all with category='picture'. The `picture_boats` and `security_boats` tables have 0 rows. Users see empty lists when clicking Picture Boats or Security Boats tabs.
- **Likely cause**: Original data import put all boats in the main `boats` table regardless of intended category. The separate `picture_boats` and `security_boats` tables were never populated.
- **Files involved**: `database.py`, `data_loader.py`
- **Estimated effort**: Medium — needs investigation to determine which boats belong in which table, possibly a migration script

## [P2] Module files in static/modules/ are dead code
- **Discovered**: 2026-03-22
- **Symptoms**: Files like `fleet.js`, `crew.js`, `today.js`, `documents.js`, etc. in `static/modules/` reference `window._SL` which doesn't exist. They are never loaded by `index.html`.
- **Likely cause**: These were written for a module-loading system that was never implemented in the monolith. The equivalent functionality has now been added directly to `app-monolith.js`.
- **Files involved**: All files in `static/modules/`
- **Estimated effort**: Quick cleanup — these files could be removed or kept for reference
