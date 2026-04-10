# ISSUES — ShootLogix Known Issues Log

## [P0] FIXED — Wrong state keys in _findAssignment() and _reloadCurrentTab()
- **Discovered**: 2026-04-10
- **Fixed**: 2026-04-10 (branch: fix/2026-04-10-wrong-state-keys-assignments)
- **Symptoms**: Day override clicks silently failed for Picture Boats, Security Boats, Labour. Pull-to-refresh on Picture Boats didn't update the UI.
- **Root cause**: `_findAssignment()` used non-existent state keys (`pbAssignments`, `sbAssignments`, `helperAssignments`). `_reloadCurrentTab()` stored picture boat data in wrong keys.
- **Files involved**: `static/app-monolith.js` (lines 3524, 13003, 13004)

## [P1] _loadAndRender* functions call render on API failure
- **Discovered**: 2026-04-10
- **Symptoms**: When API calls fail (network error, 500, etc.), the transport/labour/security-boats/guard-camp tabs still call their render functions. Users see empty UI with no explanation instead of an error state.
- **Likely cause**: `renderX()` is called outside the `try {}` block, so it always runs regardless of whether data loaded successfully.
- **Files involved**: `static/app-monolith.js` (_loadAndRenderTransport line 5572, _loadAndRenderLabour line 7227, _loadAndRenderSecurityBoats line 8119, _loadAndRenderGuardCamp line 10208)
- **Estimated effort**: Quick fix — move `render*()` inside try block or add early return in catch

## [P1] Missing checklist handler in _reloadCurrentTab()
- **Discovered**: 2026-04-10
- **Symptoms**: Pull-to-refresh on the Checklist tab does nothing — no data reload.
- **Likely cause**: `_reloadCurrentTab()` has no `else if (tab === 'checklist')` case.
- **Files involved**: `static/app-monolith.js` (line 13014)
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
