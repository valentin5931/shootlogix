# CHANGELOG — ShootLogix

## 2026-03-22 — [P0] Fix Fleet/Crew sub-tab panel switching — previous panel not hidden

**Problem**: When switching between Fleet sub-tabs (Boats → Picture Boats → Security Boats) or Crew sub-tabs (Labor → Guards), the previous sub-tab's panel remained visible behind the new one. Additionally, clicking Fleet or Crew caused a brief flash as the placeholder panel was shown then immediately hidden.

**Root cause**:
1. `renderFleetUnified()` only hid `view-fleet` before showing the target panel, leaving the previous sub-tab panel (e.g., `view-boats`) still active.
2. Same issue in `renderCrewUnified()` — only `view-crew` was hidden, not the previous sub-tab panel.
3. `setTab()` activated `view-fleet`/`view-crew` placeholder panels which were immediately overridden by the render functions, causing a visual flash.

**Fix**:
- `static/app-monolith.js` (`renderFleetUnified`): Hide ALL fleet-related panels (`view-fleet`, `view-boats`, `view-picture-boats`, `view-security-boats`) before showing the target
- `static/app-monolith.js` (`renderCrewUnified`): Hide ALL crew-related panels (`view-crew`, `view-labour`, `view-guards`) before showing the target
- `static/app-monolith.js` (`setTab`): Skip activating placeholder panels for fleet/crew tabs since their render functions manage panel visibility

**Verification**:
- Fleet sub-tab switching shows only the active sub-tab panel
- Crew sub-tab switching shows only the active sub-tab panel
- No flash/flicker when switching to Fleet or Crew tabs
- All other tabs still work (no regressions)
- JS syntax check passes (braces balanced)

**Branch**: fix/2026-03-22-fleet-crew-subtab-panel-switching
**PR**: TBD
**Side effects**: None
**Next priority**: P1 items — investigate empty picture_boats/security_boats tables and whether data should be migrated from boats table

## 2026-03-22 — [P0] Fix 5 broken tabs (Fleet, Crew, Today, Documents, Timeline) + Documents API crash

**Problem**: Fleet, Crew, Today, Documents, and Timeline tabs did nothing when clicked. Additionally, all Documents API endpoints crashed with a 500 error.

**Root cause**:
1. The `setTab()` function in `app-monolith.js` had no handlers for fleet, crew, today, documents, or timeline tabs. Module files existed in `static/modules/` but were never loaded — they relied on a `window._SL` module system that doesn't exist in the monolith architecture.
2. All 7 Documents API endpoints in `app.py` used `db = get_db()` instead of `with get_db() as db:`, causing `AttributeError: '_GeneratorContextManager' object has no attribute 'execute'`.

**Fix**:
- `static/app-monolith.js`: Added setTab handlers and render functions for all 5 tabs (fleet sub-nav, crew sub-nav, today dashboard, documents CRUD, timeline hookup)
- `app.py` (lines 7402-7555): Fixed all 7 Documents endpoints to use `with get_db() as db:` context manager

**Verification**:
- All 5 tabs now render content when clicked
- Documents API returns 200 (was 500)
- All existing tabs still work (no regressions)
- JS syntax check passes

**Branch**: fix/2026-03-22-fleet-crew-today-docs-tabs-broken
**PR**: #14
**Side effects**: None
**Next priority**: Test fleet/crew sub-tab navigation thoroughly; remaining P0 items from CLAUDE.md checklist (modal/form submissions, entity CRUD operations)
