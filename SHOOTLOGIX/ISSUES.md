# ISSUES — ShootLogix Known Issues Log

## [FIXED] Checklist tab completely broken (state.production.id)
- **Discovered**: 2026-04-13
- **Fixed**: 2026-04-13
- **Branch**: fix/2026-04-13-checklist-tab-broken-state-reference
- **Details**: Three bugs combined: wrong state property (`state.production.id` instead of `state.prodId`), undefined escape function (`_esc` instead of `esc`), and missing pull-to-refresh handlers for 6 tabs

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

## [P1] Transport and Helpers lists are empty — PARTIALLY RESOLVED
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-13
- **Symptoms**: `/api/productions/1/transport` returns `[]`, `/api/productions/1/helpers` returns `[]` (but helper-assignments has data).
- **Current state**: Transport vehicles DO exist (14 entries in `transport_vehicles` table) — the frontend correctly uses `/api/productions/1/transport-vehicles`. The `/transport` endpoint is not used by the frontend. Helpers table is empty but 73 `boat_functions` with context='labour' and corresponding `helper_assignments` exist, so the Labour tab renders functions and assignments correctly.
- **Likely cause**: `/transport` endpoint returns from a different table. The `helpers` entity table is empty — users need to add helper entities via UI, but the scheduling data (functions + assignments) is complete.
- **Files involved**: `database.py`, `data_loader.py`
- **Estimated effort**: Low — mostly a data entry issue, not a code bug

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
