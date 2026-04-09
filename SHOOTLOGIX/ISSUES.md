# ISSUES — ShootLogix Known Issues Log

## [RESOLVED] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Discovered**: 2026-03-22
- **Resolved**: 2026-03-23 — Fixed layout overflow and sub-nav height calculations. Event handlers work correctly as content is rendered in-place (no cloning).

## [P1] RBAC: Delete/edit buttons shown to READER-role users
- **Discovered**: 2026-04-09
- **Symptoms**: Users with READER role can see delete (✕) and edit buttons on boat cards, assignment rows, vehicle cards, worker cards, etc. The backend rejects unauthorized actions, but the UI should not show controls the user cannot use.
- **Likely cause**: Card/row rendering templates do not check `state.role` or `_canEdit()` before rendering action buttons.
- **Files involved**: `static/app-monolith.js` — all render functions that output delete/edit buttons
- **Estimated effort**: Medium — need to audit all render functions and wrap action buttons in role checks

## [P1] Picture Boats and Security Boats lists are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/picture-boats` returns `[]`, `/api/productions/1/security-boats` returns `[]`. All boats are in the main boats table with category "picture".
- **Likely cause**: The data loader may not be seeding picture_boats and security_boats tables separately, or the boats were all created in the main `boats` table regardless of intended category.
- **Files involved**: `database.py`, `data_loader.py`, `app.py` (picture-boats/security-boats routes)
- **Estimated effort**: Medium — need to investigate data model and potentially migrate boats to correct tables

## [RESOLVED] Transport and Helpers lists are empty
- **Discovered**: 2026-03-22
- **Resolved**: 2026-04-09 — Transport vehicles exist (14 in DB at `/api/productions/1/transport-vehicles`). The `/transport` endpoint returns schedules, not vehicles. Helpers can be created via UI — no seed data needed.

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
