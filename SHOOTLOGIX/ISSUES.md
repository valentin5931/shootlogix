# ISSUES — ShootLogix Known Issues Log

## [P0] Checklist tab completely broken — FIXED 2026-04-05
- **Discovered**: 2026-04-05
- **Symptoms**: Checklist tab loads the UI shell (date picker, Generate button) but never fetches or displays data. No errors shown to user.
- **Root cause**: Code uses `state.production` / `state.production.id` which is never set; rest of codebase uses `state.prodId`.
- **Fix**: Replaced all `state.production` → `state.prodId` in checklist functions.
- **Branch**: fix/2026-04-05-checklist-tab-broken-state-production

## [P1] ISSUES.md corrections (discovered 2026-04-05)
- Transport/Helpers "empty" was partially wrong: `/api/productions/1/transport` returns `get_transport_schedules()` (schedule data, which is empty). The actual vehicle list is at `/api/productions/1/transport-vehicles` and returns 14 vehicles correctly.
- Picture Boats / Security Boats "empty" is a data seeding issue, not a code bug. The tables exist and CRUD works. No boats were ever seeded into `picture_boats` or `security_boats` tables; all boats are in the main `boats` table.
- Guard Posts has 8 entries; Guard Camp Workers has 0 (no data seeded).

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
