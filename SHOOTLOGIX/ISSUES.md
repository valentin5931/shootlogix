# ShootLogix — Known Issues

## [P0] Documents API endpoint returns 500 (AttributeError)
- **Discovered**: 2026-03-22
- **Symptoms**: GET /api/productions/1/documents returns 500 with `AttributeError: '_GeneratorContextManager' object has no attribute 'execute'`
- **Likely cause**: Database context manager used incorrectly — likely `get_db()` returned a generator context manager instead of a connection object
- **Files involved**: `app.py` (documents endpoint), `database.py` or `db_compat.py`
- **Estimated effort**: Quick fix

## [P0] Timeline API endpoint returns 500 (missing column)
- **Discovered**: 2026-03-22
- **Symptoms**: GET /api/productions/1/timeline returns 500 with `sqlite3.OperationalError: no such column: site`
- **Likely cause**: SQL query references a `site` column that doesn't exist in the schema
- **Files involved**: `app.py` (timeline endpoint)
- **Estimated effort**: Quick fix

## [P1] Module JS files unused — fleet.js, today.js, crew.js etc.
- **Discovered**: 2026-03-22
- **Symptoms**: Files in `static/modules/` are never loaded by index.html
- **Likely cause**: These were written for a modular architecture (using `window._SL`) that was never wired up. The app uses `app-monolith.js` instead.
- **Files involved**: `static/modules/*.js`, `templates/index.html`
- **Estimated effort**: Medium — either wire up `_SL` bridge or merge module code into monolith

## [P1] Picture boats and security boats endpoints return empty arrays
- **Discovered**: 2026-03-22
- **Symptoms**: /api/productions/1/picture-boats returns `[]`, /api/productions/1/security-boats returns `[]`
- **Likely cause**: No picture boats or security boats seeded in database (may be intentional if they haven't been added yet)
- **Files involved**: `app.py`, `data_loader.py`
- **Estimated effort**: Investigation needed
