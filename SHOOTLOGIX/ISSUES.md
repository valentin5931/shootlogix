# ISSUES — ShootLogix Known Issues Log

## [P1] Documents tab has no render function
- **Discovered**: 2026-03-21
- **Symptoms**: Clicking Documents tab shows empty panel
- **Likely cause**: No `renderDocuments()` function exists in app-monolith.js
- **Files involved**: `static/app-monolith.js`, `templates/index.html`
- **Estimated effort**: Medium

## [P1] Timeline tab has no render function
- **Discovered**: 2026-03-21
- **Symptoms**: Clicking Timeline tab shows empty panel
- **Likely cause**: No `renderTimeline()` function exists in app-monolith.js (timeline.js exists as separate file but may not be integrated)
- **Files involved**: `static/app-monolith.js`, `static/js/timeline.js`, `templates/index.html`
- **Estimated effort**: Medium

## [P1] Today tab shows basic info only
- **Discovered**: 2026-03-21
- **Symptoms**: Today tab shows minimal shooting day info — could show assignments, weather, crew status
- **Likely cause**: `renderToday()` was just added with basic implementation
- **Files involved**: `static/app-monolith.js`
- **Estimated effort**: Medium

## [P1] Picture Boats, Security Boats, Guards tables have 0 data
- **Discovered**: 2026-03-21
- **Symptoms**: These entities return empty lists from the API
- **Likely cause**: No seed data for picture_boats, security_boats, guard_camp_workers tables
- **Files involved**: `app.py` (bootstrap/seed logic)
- **Estimated effort**: Quick fix (add seed data)

## [P1] Helpers table returns 0 workers despite 73 helper assignments
- **Discovered**: 2026-03-21
- **Symptoms**: `/api/productions/1/helpers` returns empty list but `/api/productions/1/helper-assignments` returns 73
- **Likely cause**: Helper assignments were seeded with function references but no helper worker entities were created
- **Files involved**: `app.py`, `database.py`
- **Estimated effort**: Quick fix
