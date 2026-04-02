# ISSUES — ShootLogix Known Issues Log

## [RESOLVED] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Discovered**: 2026-03-22
- **Resolved**: 2026-03-23 (layout overflow fix + CSS variables)
- **Notes**: Sub-nav injection approach works correctly. Layout was fixed by using `--subnav-bar-h` CSS variable. Event handlers use `onclick` attributes so cloning is not an issue.

## [P1] Picture Boats and Security Boats tables are empty
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-02
- **Symptoms**: `/api/productions/1/picture-boats` returns `[]`, `/api/productions/1/security-boats` returns `[]`. All 47 boats are in the main `boats` table (46 category "picture", 1 "support"). The `picture_boats` and `security_boats` tables exist but have 0 rows.
- **Likely cause**: The data loader seeds `boat_functions` for picture/security contexts but never creates actual picture_boats or security_boats entries. All boats were imported into the main boats table. Users need to create picture/security boats manually through the UI (CRUD endpoints work correctly).
- **Files involved**: `database.py`, `data_loader.py`
- **Estimated effort**: Medium — either a data migration script or user-driven data entry. Cannot auto-migrate without knowing which boats belong in which table.

## [RESOLVED] Transport and Helpers lists are empty
- **Discovered**: 2026-03-22
- **Resolved**: 2026-04-02 (diagnostic confirmed data exists)
- **Notes**: Transport vehicles (14) exist via `/api/productions/1/transport-vehicles`. Helpers (2+) exist via `/api/productions/1/helpers`. The old `/transport` endpoint returns transport_schedules (empty), but the frontend correctly uses `/transport-vehicles`.

## [P1] Guard camp assignment endpoint mismatch
- **Discovered**: 2026-04-02
- **Resolved**: 2026-04-02
- **Symptoms**: `_getAssignmentEndpoint()` returned `/api/helper-assignments/` for guard camp assignments because both share a `helper_id` field.
- **Fix**: Added `source` parameter tracking in `_clearDayOverride()` to correctly route gc assignments to `/api/guard-camp-assignments/`.

## [P1] Export menu close handlers missing for SB and GC
- **Discovered**: 2026-04-02
- **Resolved**: 2026-04-02
- **Symptoms**: Security Boats and Guard Camp export dropdown menus didn't auto-close when clicking outside.
- **Fix**: Added `sb-export-wrap` and `gc-export-wrap` to the global click-outside handler.

## [P2] Module files in static/modules/ are dead code
- **Discovered**: 2026-03-22
- **Symptoms**: Files like `fleet.js`, `crew.js`, `today.js`, `documents.js`, etc. in `static/modules/` reference `window._SL` which doesn't exist. They are never loaded by `index.html`.
- **Likely cause**: These were written for a module-loading system that was never implemented in the monolith. The equivalent functionality has now been added directly to `app-monolith.js`.
- **Files involved**: All files in `static/modules/`
- **Estimated effort**: Quick cleanup — these files could be removed or kept for reference
