# ISSUES — ShootLogix Known Issues Log

## [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Discovered**: 2026-03-22
- **Symptoms**: When clicking Fleet > Picture Boats or Fleet > Security Boats, the sub-tab content is rendered in the original view panel. Interactive elements (drag-drop, inline edits) work because they use the original DOM, but the fleet sub-nav is injected via `prepend()` which may cause layout shifts.
- **Likely cause**: The fleet/crew unified tabs switch the active view panel rather than cloning content, so event handlers work. However, the injected sub-nav element is moved between panels on each sub-tab switch.
- **Files involved**: `static/app-monolith.js` (renderFleetUnified, renderCrewUnified)
- **Estimated effort**: Quick fix — may need to keep sub-nav in a fixed position outside view panels

## [P1] Physical helpers/guards/picture-boat/security-boat entities are not seeded, only assignments are
- **Discovered**: 2026-04-16 (supersedes earlier 2026-03-22 entries below for picture-boats, security-boats, helpers, guards)
- **Symptoms**: `/api/productions/1/helpers`, `/api/productions/1/picture-boats`, `/api/productions/1/security-boats`, `/api/productions/1/guards` all return `[]`. However `/helper-assignments` returns 73 items, `/boat-functions?context=picture` returns functions, etc. So the functional/scheduling layer has data but the physical-entity layer does not. Before today's fix, this caused 65/66 labour cards on the Today tab to render with a blank bold header.
- **Likely cause**: The seed/bootstrap code (`database.py`, `data_loader.py`) populates `boat_functions` and `*_assignments` rows but never creates rows in the `helpers`, `picture_boats`, `security_boats`, `guards` tables. Assignments end up with `helper_id=None`, `helper_name_override=''`.
- **Workaround shipped**: Today tab now promotes the function name to the primary label when the entity name is missing (see CHANGELOG 2026-04-16). Other tabs (Fleet/Crew per-entity detail views) still show empty entity lists.
- **Files involved**: `database.py`, `data_loader.py`, `static/app-monolith.js` (tab renderers)
- **Estimated effort**: Medium — need to seed realistic entity rows OR wire a "generate helpers from assignments" maintenance action.

## [P1] Transport: `/api/productions/<id>/transport` returns empty despite 14 vehicles
- **Discovered**: 2026-04-16
- **Symptoms**: The legacy `/transport` endpoint returns `[]` because `get_transport_schedules()` in `database.py` joins `transport_schedules` + `vehicles` tables — but current data lives in `transport_vehicles` + `transport_assignments`. The frontend has already migrated to `/transport-vehicles` + `/transport-assignments` (correctly returns 14 vehicles / 0 assignments), so the broken endpoint is mostly dead weight today.
- **Likely cause**: Leftover from an earlier data model.
- **Files involved**: `app.py` (line 1892), `database.py` (`get_transport_schedules`)
- **Estimated effort**: Quick — either fix the query to use the new tables or remove the dead endpoint.

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
