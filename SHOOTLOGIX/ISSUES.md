# ISSUES — ShootLogix Known Issues Log

## [P1] Assignment removal lacks confirmation dialogs
- **Discovered**: 2026-04-04
- **Symptoms**: Clicking "Remove" on an assignment in Picture Boats (line 2949), Transport (line 6327), or Security Boats (line 8824) immediately deletes the assignment without asking for confirmation.
- **Likely cause**: These removal callbacks call `api('DELETE', ...)` directly without wrapping in `showConfirm()`.
- **Files involved**: `static/app-monolith.js` (lines 2949, 6327, 8824)
- **Estimated effort**: Quick fix — wrap each in `showConfirm` with try/catch

## [P1] Export date range picker not ported to monolith
- **Discovered**: 2026-04-04
- **Symptoms**: The AXE2.1 date range picker feature was only implemented in the dead `static/modules/` files (which rely on `window._SL` that doesn't exist). The active monolith export functions (`exportCSV`, `tbExportCSV`, etc.) call `authDownload()` without date parameters, so all exports include all dates.
- **Likely cause**: Feature was added to the module system but never ported when the monolith became the primary codebase.
- **Files involved**: `static/app-monolith.js` (export functions), `static/modules/*.js` (reference implementation)
- **Estimated effort**: Medium — need to create a date range modal in the monolith and wire it to all export buttons

## [FIXED] [P1] Silent errors in showConfirm destructive actions
- **Fixed**: 2026-04-04
- **Branch**: fix/2026-04-04-showconfirm-silent-errors

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
