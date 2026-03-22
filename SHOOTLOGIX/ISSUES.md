# ISSUES — ShootLogix Known Issues

## [P1] Picture boats and security boats return empty arrays
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/picture-boats` and `/api/productions/1/security-boats` return `[]` even though boat functions exist with picture/security context
- **Likely cause**: No picture boat or security boat entities seeded in the database (only boat functions are seeded, not the boats themselves)
- **Files involved**: `app.py` (seed logic), `database.py` (schema)
- **Estimated effort**: Quick fix (seed data or investigate if this is expected)

## [P1] Helpers/labour returns empty array
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/helpers` returns `[]`
- **Likely cause**: Helper entities may not be seeded (only helper functions exist from boat_functions context migration)
- **Files involved**: `app.py`, `database.py`
- **Estimated effort**: Quick fix

## [P1] Guard camp workers returns empty array
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/guard-camp-workers` returns `[]`
- **Likely cause**: Guard camp worker entities not seeded
- **Files involved**: `app.py`, `database.py`
- **Estimated effort**: Quick fix

## [P1] Modular JS files not loaded
- **Discovered**: 2026-03-22
- **Symptoms**: Files in `/static/modules/` (fleet.js, crew.js, today.js, etc.) exist but are never loaded in `index.html` — only `app-monolith.js` is loaded
- **Likely cause**: The app was reverted from modular `app.js` to `app-monolith.js` (see commit 627761d) but the module files weren't integrated
- **Files involved**: `templates/index.html`, `static/modules/*.js`, `static/app-monolith.js`
- **Estimated effort**: Large refactor — either integrate module code into monolith or switch to modular loading

## [P2] Duplicate branch attempts on remote
- **Discovered**: 2026-03-22
- **Symptoms**: Multiple branches with similar names exist on remote (fix/2026-03-21-*, fix/2026-03-22-*)
- **Likely cause**: Multiple automated sessions created similar fix branches
- **Files involved**: N/A (git cleanup)
- **Estimated effort**: Quick fix — delete stale branches after PR merge
