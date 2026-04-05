# ISSUES — ShootLogix Known Issues Log

## [RESOLVED] Export date range modal not wired in monolith
- **Discovered**: 2026-04-05
- **Resolved**: 2026-04-05 — Branch fix/2026-04-05-export-date-range-modal
- **Fix**: Added openExportDateModal and all supporting functions to app-monolith.js; wired all 16+ export buttons to use the modal

## [P1] No confirmation dialog for individual assignment deletions
- **Discovered**: 2026-04-05
- **Symptoms**: `removeAssignmentById` and `pbRemoveAssignmentById` delete assignments without confirmation prompt
- **Likely cause**: These functions were added for quick-action from schedule popovers and skip the `showConfirm()` step
- **Files involved**: `static/app-monolith.js` (lines ~2935, ~2947)
- **Estimated effort**: Quick fix — wrap in showConfirm()

## [P1] PDF exports crash with 500 when PyMuPDF unavailable
- **Discovered**: 2026-04-05
- **Symptoms**: `/export/budget-pdf`, `/export/daily-report-pdf`, `/export/vendor-summary-pdf` return 500 Internal Server Error with no user feedback
- **Likely cause**: `import fitz` at the top of each handler crashes if pymupdf is not installed; no try/except around the import
- **Files involved**: `app.py` (lines 5444, 5469, 5512, 5634, 5877)
- **Estimated effort**: Quick fix — wrap imports in try/except, return 503 with helpful message

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
