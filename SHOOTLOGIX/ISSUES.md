# ISSUES — ShootLogix Known Issues Log

## [P0] ~~Timeline API crash — 3 SQL column mismatches~~ FIXED 2026-04-10
- **Discovered**: 2026-04-10
- **Fixed**: 2026-04-10 (branch: fix/2026-04-10-timeline-api-crash-worker-id)
- **Symptoms**: `/api/productions/<id>/timeline` returned 500 error, breaking the Gantt timeline view
- **Root cause**: `api_timeline()` referenced non-existent columns: `worker_id` (should be `helper_id`), `site` (should be `location_type`), `prep/filming/wrap` (should be `status`). Also missing `deleted_at IS NULL` filters.
- **Files involved**: `app.py`, `database.py`

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

## [P1] ~~Transport list is empty~~ NOT A BUG — verified 2026-04-10
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-10 — Transport actually has 14 vehicles in `transport_vehicles` table. The `/api/productions/1/transport` endpoint is a summary/schedule endpoint; the JS frontend correctly uses `/api/productions/1/transport-vehicles` which returns 14 items. **Not a bug.**

## [P1] Helpers list is empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/helpers` returns `[]` (but helper-assignments has 73 rows). No helpers have been created.
- **Likely cause**: Helper assignments were seeded with inline names but no corresponding helper entities were created in the `helpers` table.
- **Files involved**: `database.py`, `data_loader.py`
- **Estimated effort**: Quick — user needs to add helpers through the UI, or a migration script could create them from existing assignment data

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
