# ISSUES — ShootLogix Known Issues Log

## [RESOLVED 2026-04-01] [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Resolved**: commit 2a93828 `[P0] Fix panel stacking when switching Fleet/Crew sub-tabs (#32)` clears the `active` class from all related panels before activating the target, fixing the sub-nav/panel stacking issue.

## [P2] Same "orphan assignment → '?' body" pattern in 5 other role-card renderers
- **Discovered**: 2026-04-11
- **Symptoms**: Currently dormant in production 1 because the sibling assignment tables (`boat_assignments`, `picture_boat_assignments`, `security_boat_assignments`, `transport_assignments`, `guard_camp_assignments`) have no orphan rows. If future seeding or bulk imports create assignment rows without a matching entity (no `*_id` and no `*_name_override`), the same bug that plagued `renderLbRoleCard` would appear in each of these cards views.
- **Likely cause**: All 6 role-card renderers share the same pattern: `asgns.map(...)` then fall back to `'?'` when no entity is joined. Only `renderLbRoleCard` was fixed in 2026-04-11 because it was the only one with orphans in the current data.
- **Files involved**: `static/app-monolith.js` — `renderRoleCard` (~line 2598), `renderPbRoleCard` (~4459), `renderTbRoleCard` (~5706), `_renderSbRoleCard` (~8261), `renderGcRoleCard` (~10341).
- **Fix shape**: mirror the `filledAsgns = asgns.filter(a => a.*_id || a.*_name_override || a.*_name)` pattern from `renderLbRoleCard` and use `filledAsgns.length` for the drop-zone style/label.
- **Estimated effort**: Quick — 5 near-identical edits.

## [P1] Picture Boats and Security Boats lists are empty
- **Discovered**: 2026-03-22 (re-verified 2026-04-11)
- **Symptoms**: `/api/productions/1/picture-boats` returns `[]`, `/api/productions/1/security-boats` returns `[]`. The DB has 46 rows in `boats` (all with `category='picture'`) but 0 rows in the `picture_boats` and `security_boats` tables.
- **Likely cause**: `_seed_picture_boats` and `_seed_security_boats` in `data_loader.py` only seed the four `YELLOW/RED/NEUTRAL/EXILE` *functions* and the six `SAFETY/EVAC/…` *functions* respectively — they never insert rows into the `picture_boats` / `security_boats` *entity* tables. Users are expected to create those entities manually via the UI, but KLAS7 was bootstrapped from BATEAUX data where everything landed in the main `boats` table.
- **Files involved**: `data_loader.py:222` (`_seed_picture_boats`), `data_loader.py:451` (`_seed_security_boats`), `database.py` migration from BATEAUX.
- **Estimated effort**: Medium — decide whether to migrate matching rows out of `boats` into `picture_boats`/`security_boats`, or to just add seed data here.

## [P1] Helpers list is empty while helper_assignments has 73 rows
- **Discovered**: 2026-03-22 (re-verified 2026-04-11)
- **Symptoms**: `/api/productions/1/helpers` returns `[]`; `helpers` table has 0 rows; `helper_assignments` table has 73 rows — 72 of which are orphan placeholders created by `_seed_helpers` (no `helper_id`, empty `helper_name_override`, but valid dates + `price_override`). The labour cards view previously rendered these as "?" bodies (fixed 2026-04-11 — see CHANGELOG).
- **Likely cause**: `_seed_helpers` in `data_loader.py:405` creates boat_functions (later migrated to context='labour') and pre-allocated `helper_assignments` rows, but never inserts matching rows into the `helpers` table. Admins are expected to add the workers through the UI.
- **Files involved**: `data_loader.py:373` (`HELPER_DATA`), `data_loader.py:405` (`_seed_helpers`).
- **Estimated effort**: Quick — either seed matching `helpers` rows so drag/drop has a sidebar worker list, or delete the orphan `helper_assignments` entries since they're just placeholders. (Current workaround: the cards view now hides them; the schedule and budget views still rely on them for reserved day cells / pre-allocated cost.)

## [RESOLVED PARTIAL] [P1] Transport list empty
- **Re-verified 2026-04-11**: `transport_vehicles` now has 14 rows for production 1 (seeded via `_seed_transport`). The *legacy* `/api/productions/<id>/transport` endpoint (app.py:1892) still returns `[]` because it queries the empty `vehicles` table rather than `transport_vehicles`, but the live UI calls `/transport-vehicles` and works correctly. See new P2 below.

## [P2] Dead legacy endpoints `/api/productions/<id>/transport` and `/api/productions/<id>/guards`
- **Discovered**: 2026-04-11
- **Symptoms**: Both endpoints return `[]` because they call `get_transport_schedules()` / `get_guard_schedules()` (database.py:3052/3069), which JOIN against the empty legacy `vehicles` / `guards` tables. The monolith UI uses `/transport-vehicles` and `/guard-camp-*` instead, so the endpoints are dead but misleading: any external script or curl user will think "no transport / no guards" when the data is actually in `transport_vehicles` / `guard_camp_workers`.
- **Files involved**: `app.py:1892` (`api_transport`), `app.py:1900` (`api_guards`), `database.py:3052` (`get_transport_schedules`), `database.py:3069` (`get_guard_schedules`).
- **Estimated effort**: Quick — either delete the routes or redirect them to the new endpoints. Check `tests/` and external integrations first.

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
