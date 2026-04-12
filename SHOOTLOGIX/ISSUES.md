# ISSUES — ShootLogix Known Issues Log

## [RESOLVED] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Discovered**: 2026-03-22
- **Resolved**: 2026-03-23 (CSS var fix + height calculation + breadcrumb update)
- **Status**: The sub-nav prepend approach works correctly. Event handlers persist because the element is moved (not cloned). Layout overflow was fixed via `--subnav-bar-h` CSS variable. No remaining DOM issues.

## [P1] Search navigation to Fleet/Crew sub-tabs lacks parent tab context
- **Discovered**: 2026-04-12
- **Symptoms**: When using Ctrl+K search and clicking a result for Boats, Picture Boats, Security Boats, Labour, or Guards, the content loads correctly but the Fleet/Crew parent tab is not highlighted in the topbar and the sub-navigation bar is not shown. Users lose navigation context.
- **Likely cause**: `setTab('boats')` directly shows `view-boats` panel without going through `renderFleetUnified()`. The Fleet tab button is not marked active because `btn.dataset.tab === 'boats'` doesn't match `'fleet'`.
- **Files involved**: `static/app-monolith.js` (setTab function, search result onclick)
- **Estimated effort**: Quick fix — setTab should redirect sub-tab names to their parent (fleet/crew) with the correct sub-tab selected

## [P1] Picture Boats and Security Boats tables have no seed data
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-12
- **Symptoms**: `/api/productions/1/picture-boats` returns `[]`, `/api/productions/1/security-boats` returns `[]`. The function groups are seeded (4 for picture, 6 for security) but no actual boat rows exist in the `picture_boats` or `security_boats` tables.
- **Clarification**: This is partially by design — these are separate tables from the main `boats` table. Users create picture/security boats manually through the UI. The function groups (YELLOW/RED/NEUTRAL/EXILE for picture; SAFETY/EVAC/MEDICAL/STANDBY for security) serve as assignment slots on the board. No data migration from the main boats table is needed.
- **Files involved**: `database.py` (`picture_boats`, `security_boats` tables)
- **Estimated effort**: No code change needed — users populate via UI. Could add sample data to data_loader if desired.

## [RESOLVED] Missing seeders in existing-DB bootstrap path
- **Discovered**: 2026-04-12
- **Resolved**: 2026-04-12 (fix/2026-04-12-bootstrap-missing-seeders)
- **Status**: Added `_seed_security_boats()`, `_seed_helpers()`, `_seed_transport()` to the existing-DB path in `bootstrap()`. All seeders are idempotent.

## [P2] Module files in static/modules/ are dead code
- **Discovered**: 2026-03-22
- **Symptoms**: Files like `fleet.js`, `crew.js`, `today.js`, `documents.js`, etc. in `static/modules/` reference `window._SL` which doesn't exist. They are never loaded by `index.html`.
- **Likely cause**: These were written for a module-loading system that was never implemented in the monolith. The equivalent functionality has now been added directly to `app-monolith.js`.
- **Files involved**: All files in `static/modules/`
- **Estimated effort**: Quick cleanup — these files could be removed or kept for reference
