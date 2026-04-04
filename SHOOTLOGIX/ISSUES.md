# ISSUES — ShootLogix Known Issues Log

## [FIXED 2026-04-04] [P1] Mobile menu missing Checklist tab + keyboard shortcuts broken
- **Fixed in**: fix/2026-04-04-mobile-menu-keyboard-shortcuts
- **Details**: See CHANGELOG.md entry for 2026-04-04

## [FIXED 2026-04-04] [P1] Checklist tab completely non-functional (state.production undefined)
- **Fixed in**: fix/2026-04-04-mobile-menu-keyboard-shortcuts
- **Details**: All checklist functions guarded on `state.production` which was never set. Changed to `state.prodId`.

## [FIXED 2026-04-04] [P1] _findAssignment() uses wrong state property names
- **Fixed in**: fix/2026-04-04-mobile-menu-keyboard-shortcuts
- **Details**: `state.pbAssignments` → `state.pictureAssignments`, `state.helperAssignments` → `state.labourAssignments`

## [P1] "Auto-fill Tides" button throws TypeError on every click
- **Discovered**: 2026-04-04
- **Symptoms**: Clicking the "Auto-fill tides" button in the PDT toolbar throws `TypeError: App.autoFillTides is not a function`
- **Likely cause**: The button in `index.html` (line 173) calls `App.autoFillTides()` but this function was never implemented in `app-monolith.js`. The backend `/api/tides` endpoint exists.
- **Files involved**: `static/app-monolith.js`, `templates/index.html`
- **Estimated effort**: Medium — need to write the JS function to fetch tides and populate schedule

## [P1] Timeline tab always shows blank
- **Discovered**: 2026-04-04
- **Symptoms**: Clicking the Timeline tab shows an empty panel. No error displayed.
- **Likely cause**: `setTab('timeline')` checks `typeof App.renderTimeline === 'function'` — but `renderTimeline` is never defined in `app-monolith.js` or exported. The `timeline.js` file defines `App.renderTimeline = () => Timeline.init()` but `Timeline.init()` renders into `#timeline-content` which may not have the expected structure.
- **Files involved**: `static/js/timeline.js`, `static/app-monolith.js`
- **Estimated effort**: Medium — need to verify timeline.js integration and ensure init() renders correctly

## [P1] Guards tab doesn't reset guardLocSchedules on re-visit (stale data)
- **Discovered**: 2026-04-04
- **Symptoms**: After navigating away from Guards and back, the Location Guards sub-tab may show outdated data
- **Likely cause**: `setTab('guards')` resets `state.guardSchedules` but the default sub-tab uses `state.guardLocSchedules` instead
- **Files involved**: `static/app-monolith.js` (lines 1010, 1355)
- **Estimated effort**: Quick — change reset to target `state.guardLocSchedules`

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
