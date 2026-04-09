# ISSUES — ShootLogix Known Issues Log

## [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM — FIXED
- **Discovered**: 2026-03-22
- **Fixed**: 2026-03-23 (commits 6bff757, 2a93828)
- **Resolution**: Fixed panel stacking, sub-nav injection, CSS variable definitions, and topbar role restrictions. Fleet/Crew sub-tabs now switch panels correctly without stacking.

## [P1] Picture Boats and Security Boats lists are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/picture-boats` returns `[]`, `/api/productions/1/security-boats` returns `[]`. The `picture_boats` and `security_boats` tables have no rows.
- **Likely cause**: The data loader seeds all boats into the `boats` table (46 boats with category "picture"). The separate `picture_boats` and `security_boats` tables were never populated by the seeder. CRUD endpoints for both tables work correctly (POST creates, GET returns).
- **Files involved**: `database.py`, `data_loader.py`
- **Estimated effort**: Medium — could seed sample data or improve empty-state UX with "Add your first picture boat" guidance

## [P1] Helpers (Labour) list is empty
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-09
- **Symptoms**: `/api/productions/1/helpers` returns `[]`. However, 73 helper_assignments exist (linked to boat_functions, with `helper_id: NULL` — these represent unfilled positions/slots). CRUD for helpers works correctly.
- **Likely cause**: No helpers were seeded. The helper assignments use positions (boat_functions) rather than named workers.
- **Files involved**: `database.py`, `data_loader.py`
- **Estimated effort**: Quick — data seeding or UX improvement

## [P1] Guards (Guard Camp Workers) list is empty
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-09
- **Symptoms**: `/api/productions/1/guard-camp-workers` returns `[]`. Guard posts (8) and guard location schedules (31) exist. CRUD for guard camp workers works correctly.
- **Likely cause**: No guard camp workers were seeded.
- **Files involved**: `database.py`, `data_loader.py`
- **Estimated effort**: Quick

## [P1] Transport and Helpers lists noted as empty — PARTIALLY RESOLVED
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-09
- **Current state**: Transport vehicles now has 14 entries (data was seeded). Helpers is still empty (see above). Original issue is outdated for transport.

## [P1] Fuel entries and machinery are empty
- **Discovered**: 2026-03-22
- **Updated**: 2026-04-09
- **Symptoms**: `/api/productions/1/fuel-entries` returns `[]`, `/api/productions/1/fuel-machinery` returns `[]`. Fuel entries are created per-assignment through the fuel grid UI, so empty is expected until users interact. Fuel machinery CRUD works.
- **Likely cause**: No data seeded — normal state before user interaction
- **Estimated effort**: Not a bug — expected behavior

## [P1] API error responses returned HTML instead of JSON — FIXED
- **Discovered**: 2026-04-09
- **Fixed**: 2026-04-09
- **Symptoms**: Any unhandled API error (500, IntegrityError, etc.) returned HTML (Werkzeug debugger) instead of JSON. Frontend `api()` function silently failed on HTML responses.
- **Resolution**: Added global JSON error handlers for 404, 405, 500, IntegrityError, and OperationalError on `/api/` routes.

## [P2] Module files in static/modules/ are dead code
- **Discovered**: 2026-03-22
- **Symptoms**: Files like `fleet.js`, `crew.js`, `today.js`, `documents.js`, etc. in `static/modules/` reference `window._SL` which doesn't exist. They are never loaded by `index.html`.
- **Likely cause**: These were written for a module-loading system that was never implemented in the monolith. The equivalent functionality has now been added directly to `app-monolith.js`.
- **Files involved**: All files in `static/modules/`
- **Estimated effort**: Quick cleanup — these files could be removed or kept for reference
