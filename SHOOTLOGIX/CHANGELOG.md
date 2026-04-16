# CHANGELOG — ShootLogix

## 2026-04-16 — [P0] Fix Timeline (Gantt) endpoint: 500 → 200 (wrong column names)

**Problem**: `GET /api/productions/<id>/timeline` returned HTTP 500, breaking the Timeline tab entirely. The browser saw an empty/error response and the Gantt view never rendered.

**Root cause**: Two schema mismatches in `api_timeline()` (`app.py:7893`):
1. `SELECT id, name, site FROM locations` — the `locations` table has no `site` column; the categorical field was renamed to `location_type` long ago. Query raised `sqlite3.OperationalError: no such column: site`.
2. `SELECT id, date, prep, filming, wrap FROM location_schedules` — the table doesn't have boolean `prep`/`filming`/`wrap` columns. It stores one row per (location, date, phase) with a single `status` column whose value is `'P'`, `'F'`, or `'W'`. Even after fixing #1 the query failed with `no such column: prep`.

**Fix** (`app.py:7892-7921`):
- Switched `locations` query to `SELECT id, name, location_type` and added `AND deleted_at IS NULL` so soft-deleted locations don't pollute the timeline.
- Replaced the per-row phase logic with a `by_date` dict that groups schedules on the same date and joins their statuses (e.g. a day with both prep and filming becomes `phases: "P/F"`). External response shape unchanged.
- Used `loc['location_type']` for the `subgroup` field, consistent with how the rest of the codebase categorizes locations (`app.py:4092`, `4414`, `7251`).

**Verification**:
- `GET /api/productions/1/timeline` → HTTP 200, 40 628 bytes, 81 resources, 21 location resources with 31 grouped assignments (`tribal_camp`, `game`, `reward` subgroups all populated correctly).
- All 14 other production-scoped endpoints in the diagnostic checklist still return 200 (no regressions).
- `python -c "import app"` clean.

**Branch**: fix/2026-04-16-timeline-locations-site-column
**Side effects**: None. Soft-deleted locations are now excluded from the timeline (intended; matches behavior of other list endpoints).
**Next priority**: P1 — empty Picture Boats / Security Boats / Transport / Helpers / Fuel / Guards lists (data seeding gap, see ISSUES.md).

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
