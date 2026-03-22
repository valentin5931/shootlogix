# ShootLogix — Known Issues

## [P1] app.js vs app-monolith.js architecture mismatch
- **Discovered**: 2026-03-22
- **Symptoms**: `app.js` defines a modular lazy-loading architecture with `MODULE_MAP` and `setTabLazy`, but `index.html` only loads `app-monolith.js`. Module files in `static/modules/` (fleet.js, crew.js, today.js, etc.) are never loaded.
- **Likely cause**: Incomplete migration from monolith to modular architecture. The `app.js` skeleton and `static/modules/` were added but never wired into `index.html`.
- **Files involved**: `templates/index.html`, `static/app.js`, `static/app-monolith.js`, `static/modules/*`
- **Estimated effort**: Large refactor — either complete the migration to `app.js` + modules, or continue adding features to monolith. Current fix adds fleet/crew/today to monolith.

## [P1] Helpers/Guard-camp empty — no workers seeded
- **Discovered**: 2026-03-22
- **Symptoms**: Labour and Guards tabs show 0 workers. Crew tab shows empty state.
- **Likely cause**: No seed data for helpers or guard_camp_workers tables (unlike boats which have extensive seed data).
- **Files involved**: `app.py` (bootstrap/seed section), `database.py`
- **Estimated effort**: Quick fix — add seed data or verify manual data entry works

## [P1] Picture Boats and Security Boats return empty arrays
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/picture-boats` returns `[]`, `/api/productions/1/security-boats` returns `[]`
- **Likely cause**: No seed data for these tables, or data not yet entered
- **Files involved**: `app.py`, `database.py`
- **Estimated effort**: Quick fix — verify CRUD works for manual entry

## [P1] Transport endpoint returns data but transport tab needs verification
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/transport-vehicles` returns 4080 bytes of data, transport tab loads via `_loadAndRenderTransport()`
- **Likely cause**: Needs browser testing to verify full rendering
- **Files involved**: `static/app-monolith.js` (transport section)
- **Estimated effort**: Quick check
