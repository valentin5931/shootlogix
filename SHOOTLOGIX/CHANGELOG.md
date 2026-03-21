# CHANGELOG — ShootLogix

## 2026-03-21 — [P0] Fix Fleet and Crew tab navigation

**Problem**: Clicking Fleet and Crew tabs in navigation showed empty panels with no content. The `crewSetSubTab()` function was called in HTML but never defined, causing JS errors on the Crew sub-navigation pills.

**Root cause**: The HTML navigation used `setTab('fleet')` and `setTab('crew')` but the JS `setTab()` function had no handlers for these tab names. The `ROLE_ALLOWED_TABS` also excluded `fleet`, `crew`, `today`, `checklist`, `documents`, and `timeline`, hiding these tabs for non-ADMIN roles.

**Fix**: Added `renderFleetHub()`, `renderCrewHub()`, `crewSetSubTab()`, and `renderToday()` functions to `app-monolith.js`. Updated `ROLE_ALLOWED_TABS`, `TAB_LABELS`, `setTab()`, `_reloadCurrentTab()`, and the App export object.

**Verification**: All 45 tests pass. JS file loads without syntax errors. Fleet shows summary cards for Boats/Picture Boats/Security Boats. Crew shows Labour/Guards sub-navigation. Today shows current shooting day info.

**Branch**: fix/2026-03-21-fleet-crew-tab-navigation
**PR**: #2
**Side effects**: None
**Next priority**: P1 — UX/UI anomalies (form validation gaps, missing loading states, error handling improvements)
