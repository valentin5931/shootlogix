# CHANGELOG — ShootLogix

## 2026-03-22 — [P0] Fix Checklist tab completely non-functional

**Problem**: Clicking the Checklist tab showed an empty view with no data loading, no errors, and no way to generate or interact with checklists.

**Root cause**: The checklist functions (`loadChecklist`, `generateChecklist`, `toggleChecklistItem`) in `app-monolith.js` referenced `state.production` and `state.production.id`, but `state.production` was never set anywhere in the codebase. The rest of the app uses `state.prodId`. This caused all 3 functions to silently `return` on the guard clause `if (!state.production) return;`, making the entire Checklist tab non-functional.

**Fix**: `static/app-monolith.js` (lines 12999-13022) — Replaced all 6 references to `state.production` / `state.production.id` with `state.prodId`:
- `loadChecklist()`: guard clause + API URL
- `generateChecklist()`: guard clause + API URL
- `toggleChecklistItem()`: guard clause + API URL

**Verification**:
- JS syntax check passes
- All 45 tests pass
- Checklist API endpoints return correct data (GET returns null for empty dates, POST generates items)
- No regressions in other tabs

**Branch**: fix/2026-03-22-checklist-tab-broken
**PR**: (pending)
**Side effects**: None
**Next priority**: P1 — Timeline tab has no `renderTimeline` implementation; Picture Boats/Security Boats/Labour/Guards tabs show empty lists (data model issue)

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
