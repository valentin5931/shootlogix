# ISSUES — ShootLogix Known Issues Log

## [RESOLVED] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Discovered**: 2026-03-22
- **Resolved**: 2026-03-23 (CHANGELOG: fixed sub-nav layout overflow + CSS variables)
- **Note**: Event handlers were never broken — they use the original DOM. Layout shift was fixed via `--subnav-bar-h` CSS variable.

## [P1] Picture Boats and Security Boats lists are empty
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-09 — Investigation complete. The `picture_boats` and `security_boats` tables are intentionally separate from the `boats` table. Functions exist (4 picture, 6 security) but no physical boats have been created. CRUD operations work — users can add boats via the UI's "+" button. The `category='picture'` on all 46 main `boats` is a default value, not meaningful categorization. The fix is either: (a) seed production-specific boats if known, or (b) improve the empty-state UX with a clear CTA to add the first boat.
- **Files involved**: `data_loader.py` (seeding), `static/app-monolith.js` (empty state rendering)
- **Estimated effort**: Quick (UX improvement) or Medium (data seeding if boat names are known)

## [RESOLVED] Transport list is empty / Helpers list is empty
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-09 — Transport: 14 vehicles are seeded correctly at `/api/productions/1/transport-vehicles`. The `/transport` endpoint is for schedules (separate). Helpers: the `helpers` table is empty by design — the Labour tab uses `boat_functions` (context=labour) + `helper_assignments` (73 seeded), which render correctly without physical helper entities. The `_seed_helpers` context bug was fixed (was using 'helpers' instead of 'labour').

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
