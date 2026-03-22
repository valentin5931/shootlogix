# ShootLogix — Known Issues

## [P1] Module files in static/modules/ are orphaned
- **Discovered**: 2026-03-22
- **Symptoms**: The `static/modules/` directory contains advanced module implementations (fleet.js, crew.js, today.js, documents.js, etc.) that are never loaded by the app
- **Likely cause**: A modular architecture was planned (using `window._SL` and `_loadModule`) but never integrated into the monolith. The monolith was used instead.
- **Files involved**: `static/modules/*.js`, `static/app-monolith.js`
- **Estimated effort**: Large refactor — either port module features into monolith or implement the module loader

## [P1] Guard Camp API endpoint missing or broken
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/guard-camp` returns 404
- **Likely cause**: Route may not be registered or may use a different URL pattern
- **Files involved**: `app.py`
- **Estimated effort**: Quick fix

## [P1] Documents upload/download not fully tested
- **Discovered**: 2026-03-22
- **Symptoms**: Documents API was completely broken (fixed get_db issue), but upload/download flow needs end-to-end testing with actual files
- **Files involved**: `app.py` (document routes), `static/app-monolith.js` (upload form)
- **Estimated effort**: Medium

## [P2] Timeline view is basic
- **Discovered**: 2026-03-22
- **Symptoms**: Timeline tab shows a minimal Gantt chart based only on boat assignments. The module file `static/modules/timeline.js` has a more comprehensive implementation.
- **Likely cause**: Implemented as basic version in this fix; full feature set exists in unused module file
- **Files involved**: `static/app-monolith.js`, `static/js/timeline.js`
- **Estimated effort**: Medium — port timeline.js features into monolith
