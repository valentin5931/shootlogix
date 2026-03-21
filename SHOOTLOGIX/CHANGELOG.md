# CHANGELOG

## 2026-03-21 — [P0] Fix missing tab handlers: Fleet, Today, Crew, Documents, Timeline

**Problem**: Clicking Fleet, Today, Crew, Documents, or Timeline tabs showed blank panels. These tabs had `onclick="App.setTab('fleet')"` etc. in the HTML, but the `setTab` function in `app-monolith.js` had no handler for them — the panel div appeared (via CSS class toggle) but no render function was called, leaving it empty.

**Root cause**: A previous hotfix (627761d) switched from the modular `app.js` (which loads `modules/*.js` dynamically) back to `app-monolith.js` because modules weren't being imported. The monolith contained handlers for the original tabs (pdt, boats, transport, fuel, etc.) but was missing the newer unified tabs (fleet, today, crew, documents, timeline) that had been added only in the modular system.

**Fix**:
- Added `_showLoading` / `_hideLoading` helper functions to the monolith (needed by dynamic modules)
- Added `_canViewMoney`, `_getModulePerm`, `_canExport`, `_canImport` permission helpers
- Added `_pushUndo` stub for module compatibility
- Added dynamic module loader (`_loadModule`) for tabs that only exist as modules
- Exposed `window._SL` shared context so modules can access monolith internals
- Updated `setTab()` to handle `fleet`, `today`, `crew`, `documents`, `timeline` tabs
- Implemented `crewSetSubTab` / `_renderCrewSubTab` inline for the Crew unified view
- Updated `TAB_LABELS` to include all tab names

**Files changed**:
- `static/app-monolith.js` — added ~100 lines of module loading infrastructure

**Verification**:
- All 45 tests pass
- All API endpoints return 200
- JS syntax check passes (node -c)
- App starts without errors

**Branch**: fix/2026-03-21-missing-tab-handlers
**Side effects**: None — existing tab handlers unchanged
**Next priority**: Test the dynamic module loading in a browser to confirm fleet/today/documents/timeline render correctly. Then continue with P1 UX/UI anomalies.
