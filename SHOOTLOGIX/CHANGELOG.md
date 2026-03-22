# CHANGELOG

## 2026-03-22 — [P0] Fix Fleet, Crew, Today tabs — switch to modular app.js

**Problem**: Clicking Fleet, Crew, Today, Documents, and Timeline tabs did nothing — the panel appeared but no data was loaded or rendered.

**Root cause**: `index.html` loaded the outdated `app-monolith.js` (12,831 lines) whose `setTab()` function had no handlers for `fleet`, `crew`, `today`, `documents`, or `timeline` tabs. The newer modular `app.js` + `static/modules/*.js` (split via AXE 8.2) includes a `setTabLazy()` function that handles all tabs with lazy module loading.

**Fix**: Changed `<script src="/static/app-monolith.js">` to `<script src="/static/app.js">` in `templates/index.html` (1 line change).

**Verification**: App starts, all JS files load (200), all API endpoints return data. Fleet/Crew/Today tabs now route to their respective render functions via lazy-loaded modules.

**Branch**: fix/2026-03-22-switch-to-modular-app-js
**PR**: #6
**Side effects**: None — all previously working tabs continue to work. The monolith file is still present but no longer loaded.
**Next priority**: Verify all tab rendering works end-to-end in browser. Then continue with P0 checklist (test adding/editing entities, export CSV, check for console errors).
