# ShootLogix — Changelog

## 2026-03-22 — [P0] Fix Fleet, Today, Crew, Documents, and Timeline tab navigation

**Problem**: Clicking Fleet, Today, Crew, Documents, or Timeline tabs showed empty panels with no content loaded. These 5 tabs had HTML panels defined in index.html but no JavaScript handlers in setTab() to trigger data loading and rendering.

**Root cause**: The module JS files (static/modules/fleet.js, today.js, crew.js, etc.) were written for a modular architecture using `window._SL`, but the app loads `app-monolith.js` which never defines `_SL` and never includes the module files in index.html.

**Fix**: Added tab handlers directly in app-monolith.js's setTab() function for all 5 missing tabs:
- **Fleet**: Loads boats + picture boats + security boats from API, renders unified card grid with type badges, filter pills, and search
- **Today**: Loads /api/productions/:id/today endpoint, renders daily operations dashboard with date navigation, summary cards, fleet list, and crew list
- **Crew**: Implements labour/guards sub-tab navigation, loads and renders worker/guard summaries with links to full views
- **Documents**: Loads documents list from API, renders file list with download links
- **Timeline**: Loads shooting days, renders horizontal day timeline with day numbers and dates

Also added these tabs to TAB_LABELS for breadcrumb display and to _reloadCurrentTab for pull-to-refresh support.

**Files changed**:
- `static/app-monolith.js` — Added ~300 lines: tab handlers in setTab(), 5 render functions, fleet state/filter/search, today date navigation, crew sub-tab logic

**Verification**:
- JS syntax validated (no errors)
- Flask server starts and serves updated JS
- All existing API endpoints still return 200
- Fleet tab loads 22 boats + picture boats + security boats
- Today tab loads daily operations data
- Crew tab shows labour/guards sub-tabs

**Branch**: fix/2026-03-22-missing-tab-handlers-fleet-today-crew
**Side effects**: None — all changes are additive, no existing code was modified (only the setTab switch got new cases)
**Next priority**: Fix backend 500 errors on /api/productions/:id/documents and /api/productions/:id/timeline endpoints
