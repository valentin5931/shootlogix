# CHANGELOG — ShootLogix

## 2026-04-14 — [P0] Add global API error handlers + fuel entry validation

**Problem**: Multiple API endpoints crash with unhandled 500 errors (sqlite3.IntegrityError) instead of returning proper JSON error responses. For example, `POST /api/productions/{id}/fuel-entries` without `source_type` crashes with `IntegrityError: NOT NULL constraint failed: fuel_entries.source_type`. Similarly, `POST /api/productions/{id}/fnb-entries` with an invalid `item_id` crashes with `IntegrityError: FOREIGN KEY constraint failed`. The Werkzeug debug page is returned as HTML instead of JSON, and the frontend's `catch(e) { /* silent */ }` blocks silently swallow the error — meaning users lose data without any feedback.

**Root cause**:
1. No global error handler for `sqlite3.IntegrityError` — any database constraint violation crashes the whole request with a 500 HTML page.
2. `validate_fuel_entry()` in `validation.py` did not validate required fields `source_type` and `assignment_id`, so malformed requests passed validation but crashed at the database layer.
3. No general `@app.errorhandler(500)` to return JSON for API routes.

**Fix**:
- `app.py`: Added `import sqlite3`. Added `@app.errorhandler(sqlite3.IntegrityError)` that returns JSON 400 for NOT NULL violations, 400 for FOREIGN KEY violations, and 409 for UNIQUE violations. Added `@app.errorhandler(500)` that returns JSON for `/api/` routes and default HTML for non-API routes.
- `validation.py`: Enhanced `validate_fuel_entry()` to check that `source_type` is present and one of the valid enum values (`boats`, `picture_boats`, `security_boats`, `transport`, `machinery`), and that `assignment_id` is present.

**Verification**:
- Fuel entry missing `source_type` → 422 with `{"error": "Validation failed", "fields": {"source_type": "...", "assignment_id": "..."}}` (was 500 crash)
- Fuel entry with invalid `source_type` → 422 with enum validation error
- Fuel entry with correct data → 200 success (no regression)
- FNB entry with invalid `item_id` → 400 `{"error": "Referenced entity does not exist"}` (was 500 crash)
- All 45 tests pass
- All 19 GET endpoints return 200

**Branch**: fix/2026-04-14-api-error-handlers-fuel-validation
**Side effects**: None
**Next priority**: P1 — Frontend silent error handling (`catch(e) { /* silent */ }` blocks should show toast notifications to users); P1 — Empty lists for Picture Boats, Security Boats, Transport, Helpers (seeding or data migration)

## 2026-03-23 — [P0/P1] Fix fleet/crew sub-nav layout overflow + missing CSS variables

**Problem**:
1. Fleet (Boats/Picture Boats/Security Boats) and Crew (Labor/Guards) sub-navs are injected by prepending into the target view panels. The layout divs inside (`#boats-layout`, `#pb-boats-layout`, `#sb-boats-layout`, `#lb-layout`, `#gc-layout`) use hardcoded `height: calc(100vh - 48px - 2.5rem)` which doesn't account for the sub-nav height (~37px), causing all sidebar/main content to overflow and be cut off at the bottom.
2. `--bg-2` CSS variable used in 13+ inline JS-rendered elements (Today tab, Documents, etc.) was never defined, causing all those elements to render with transparent backgrounds — making text float on nothing.
3. `--blue` CSS variable used in the dashboard burn chart and legend was also undefined, making chart lines invisible.
4. Fleet/Crew breadcrumb always showed "Overview" regardless of which sub-tab was active.

**Root cause**:
- The sub-nav injection approach (prepend into view panels) was added in a previous session but height calculations were never updated to compensate.
- `--bg-2` and `--blue` were used as CSS vars in the JS template strings but never added to the `:root` declarations in `style.css`.

**Fix**:
- `static/style.css`: Added `--subnav-bar-h: 0px` to `:root`. Changed all 5 layout div height calculations to `calc(100vh - 48px - 2.5rem - var(--subnav-bar-h))`. Added `--bg-2` (`#131929` dark / `#F1F5F9` light) and `--blue` (`#3B82F6`) to both `:root` and `[data-theme="light"]`.
- `static/app-monolith.js`: `renderFleetUnified()` and `renderCrewUnified()` now set `--subnav-bar-h` to the measured sub-nav height after injecting it. `setTab()` resets `--subnav-bar-h` to `0px` when switching to non-fleet/non-crew tabs. Fleet/crew sub-tab switches now update the breadcrumb correctly.

**Verification**:
- Fleet > Boats/Picture Boats/Security Boats: sidebar and main content fill the panel correctly, sub-nav visible at top.
- Crew > Labor/Guards: same.
- Today tab: date input and boat cards now have visible background color.
- Dashboard burn chart: line now visible in blue.
- Breadcrumb shows "Fleet › Boats", "Fleet › Picture Boats", "Crew › Labor", "Crew › Guards" etc.
- JS syntax check passes.

**Branch**: claude/fix-display-issues-q03dh
**Side effects**: None
**Next priority**: Test Picture Boats and Security Boats empty list issue (P1)

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
