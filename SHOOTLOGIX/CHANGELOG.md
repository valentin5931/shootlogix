# ShootLogix Changelog

## 2026-03-22 — [P0] Restore modular app.js — fix broken tab navigation

**Problem**: Clicking Today, Fleet, Crew, Documents, Timeline, and Checklist tabs did nothing. These tabs were not handled by the old `app-monolith.js` which was loaded by `index.html`.

**Root cause**: A previous hotfix (commit 627761d) switched `index.html` to load `app-monolith.js` instead of the modular `app.js` because the modular version was incomplete at the time. Since then, `app.js` was fully updated with lazy module loading (MODULE_MAP + dynamic `import()`) and the module files in `/static/modules/` were all created. However, `index.html` was never switched back to load `app.js`.

The `app-monolith.js` (12831 lines) is an old monolithic file that handles: PDT, Boats, Picture Boats, Security Boats, Transport, Fuel, Labour, Guards, FNB, Budget, Locations, Checklist, Admin. But it does NOT handle the newer tabs: Today, Fleet (unified), Crew (unified), Documents, Timeline.

The modular `app.js` (2509 lines) + 22 module files in `/static/modules/` handle ALL tabs including the newer ones.

**Fix**:
- `templates/index.html`: Changed `<script src="/static/app-monolith.js">` to `<script src="/static/app.js">`
- Created `static/modules/checklist.js`: Extracted checklist logic from monolith into a standalone module
- `static/app.js`: Added `checklist` to MODULE_MAP, TAB_LABELS, ROLE_ALLOWED_TABS, and setTabLazy handler
- `static/app.js`: Added `documents` and `timeline` to ROLE_ALLOWED_TABS for all roles

**Verification**:
- App starts without errors
- All 45 pytest tests pass
- All API endpoints return 200
- All module JS files are accessible (200 status)
- Login works

**Branch**: fix/2026-03-22-restore-modular-app-js
**Side effects**: None expected. The modular app.js exposes the same App API surface.
**Next priority**: Test all tabs in a browser to verify rendering. Check for any remaining P0 console errors.
