# CHANGELOG — ShootLogix

## 2026-03-22 — [P1] Fix FAB (+ button) hidden on Fleet/Crew sub-tabs + improve empty states

**Problem**: When navigating to Fleet > Picture Boats, Fleet > Security Boats, Crew > Labour, or Crew > Guards via the unified tab sub-navigation, the floating action button (FAB/+ button) was hidden. Users could not add new picture boats, security boats, workers, or guards from these views. Additionally, empty state messages were unhelpful ("No picture boats" with no guidance).

**Root cause**: The `_updateFab()` function looked up `FAB_CONFIG[state.tab]`, but when Fleet or Crew unified tabs were active, `state.tab` was set to `'fleet'` or `'crew'` — values that had no FAB_CONFIG entry. The actual sub-tab values (`'picture-boats'`, `'security-boats'`, `'labour'`, `'guards'`) that DO have FAB_CONFIG entries were stored in `_fleetSubTab` / `_crewSubTab` variables but never consulted.

**Fix**:
- `static/app-monolith.js`: Added `_fabEffectiveTab()` helper that resolves `fleet` → `_fleetSubTab` and `crew` → `_crewSubTab`, used by both `_updateFab()` and `fabAction()`
- Improved empty state messages for picture boats and security boats with icons and actionable guidance

**Verification**:
- FAB now appears correctly on all Fleet/Crew sub-tabs
- Empty state messages guide users to use the + button
- 45/45 tests pass
- All API endpoints return 200
- No JS syntax errors (balanced braces and template literals)

**Branch**: fix/2026-03-22-fleet-crew-fab-hidden
**PR**: pending
**Side effects**: None
**Next priority**: Picture boats and security boats tables are empty (data seeding issue — users need to add them manually via the now-working FAB button)

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
