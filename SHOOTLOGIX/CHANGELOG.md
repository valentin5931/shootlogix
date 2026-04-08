# CHANGELOG — ShootLogix

## 2026-04-08 — [P0] Fix timeline API 500 crash (locations schema mismatch)

**Problem**: `GET /api/productions/1/timeline` returned 500 Internal Server Error with `sqlite3.OperationalError: no such column: site`. The Timeline tab was completely broken — no resources, no assignments, blank view.

**Root cause**: The `api_timeline` handler in `app.py` queried `SELECT id, name, site FROM locations` but the `locations` table has no `site` column (it has `type` and `location_type`). A second query read `prep, filming, wrap` from `location_schedules`, but that table stores a single `status` column with character codes `'P' / 'F' / 'W'`, one row per (location, date, phase). Both queries were written against a schema that never existed in this database.

**Fix**:
- `app.py` (lines ~7892-7930): Rewrote the locations block of `api_timeline`.
  - Query `location_type` instead of non-existent `site`.
  - Query `status` from `location_schedules` and group rows by date in Python, joining the single-char phase codes into the `phases` string the frontend already expects (e.g. `"P/F"`, `"F"`, `"F/W"`).
  - Stable assignment ordering via `ORDER BY date, id` and `sorted()` on the date keys.

**Verification**:
- `GET /api/productions/1/timeline` → 200, 40KB payload.
- Response contains 21 location resources, 14 with assignments. Example: `ARENA (SABOGA)` → 4 filming days; `subgroup: "game"` (from `location_type`).
- Smoke-tested all other endpoints from the CLAUDE.md diagnostic checklist — all return 200, no regressions.
- `python -c "import ast; ast.parse(open('app.py').read())"` passes.

**Branch**: fix/2026-04-08-timeline-site-column
**Side effects**: None
**Next priority**: P1 — Fleet/Crew sub-tab event handler issue tracked in ISSUES.md, and the 404s on `/api/productions/1/budget-lines`, `/api/productions/1/schedules`, `/api/productions/1/holidays` endpoints seen during the checklist (investigate whether the routes are under different paths).

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
