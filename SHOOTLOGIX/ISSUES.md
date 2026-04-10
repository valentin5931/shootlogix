# ISSUES — ShootLogix Known Issues Log

## [P0] ~~Checklist tab completely broken~~ FIXED 2026-04-10
- **Discovered**: 2026-04-10
- **Symptoms**: Clicking the Checklist tab showed nothing. Generate button did nothing. Checking items did nothing. All three checklist functions silently returned without action.
- **Root cause**: JS code referenced `state.production` (never set) instead of `state.prodId`. Backend `generate_daily_checklist()` returned null due to reading uncommitted transaction data.
- **Fix**: Replaced `state.production`/`state.production.id` with `state.prodId` in 3 functions. Moved return outside `with` block in `database.py`.
- **Branch**: fix/2026-04-10-checklist-tab-broken-state-ref

## [P0] ~~Fleet/Crew sub-tab event handlers may not fire on cloned DOM~~ FIXED 2026-03-23
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

## [P1] ~~Transport list is empty~~ FIXED (data now seeded — 14 vehicles)
- **Discovered**: 2026-03-22
- **Fixed**: Transport vehicles are now seeded by data_loader.py (14 vehicles)

## [P1] Helpers list is empty (but 73 helper assignments exist)
- **Discovered**: 2026-03-22 (updated 2026-04-10)
- **Symptoms**: `/api/productions/1/helpers` returns `[]`. However, 73 `helper_assignments` exist with `helper_id=null`, linked to 73 `boat_functions` with `context=labour`. The Labour tab shows all 73 role cards but no workers in the sidebar.
- **Likely cause**: Helper assignments are function-based (role positions), not person-based. Individual helpers need to be created and assigned to positions via the UI.
- **Files involved**: `data_loader.py`, `database.py`
- **Estimated effort**: Quick — users add helpers through the UI; no code bug

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
