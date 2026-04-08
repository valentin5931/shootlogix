# CHANGELOG — ShootLogix

## 2026-04-08 — [P0] Fix Timeline endpoint crash — wrong column names in SQL queries

**Problem**: `GET /api/productions/<id>/timeline` returned HTTP 500 with `sqlite3.OperationalError: no such column: site`. The entire Timeline tab was unusable — clicking it immediately failed.

**Root cause**: The `api_timeline()` function in `app.py` (~line 7797) had **four** stale SQL references to columns and tables that don't exist in the current schema:
1. `SELECT ... site FROM locations` — the `locations` table has no `site` column (has `type` and `location_type` instead). This is what raised the 500.
2. `loc['site']` used as `subgroup` on the resource row — same non-existent column.
3. `SELECT ... prep, filming, wrap FROM location_schedules` — `location_schedules` stores a single-letter phase in a `status` column (`'P' | 'F' | 'W'`), not separate boolean columns. The old query would have raised a second `OperationalError` the moment the first one was fixed.
4. `FROM guard_camp_assignments WHERE worker_id=?` — `guard_camp_assignments` uses `helper_id` (confirmed by both the table schema and the index `idx_guard_camp_assignments_helper`). Every other caller in `app.py` correctly uses `helper_id`.

These look like leftover references from an older schema that was never fully migrated when the timeline route was added.

**Fix** (`app.py` lines ~7880-7914):
- Changed `WHERE worker_id=?` → `WHERE helper_id=?` for the guard-camp assignments lookup.
- Changed the locations SELECT to `SELECT id, name, location_type FROM locations WHERE production_id=? AND deleted_at IS NULL` (also added the `deleted_at IS NULL` filter for consistency with the rest of the codebase).
- Rewrote the location_schedules SELECT to fetch `status` and emit one assignment per row where `status in ('P','F','W')`, setting `phases` to the single letter.
- Use `loc['location_type']` as the subgroup label instead of `loc['site']`.

**Verification**:
- `GET /api/productions/1/timeline` now returns HTTP 200 with a 40,800-byte payload containing 82 resources (47 Boats, 14 Vehicles, 21 Locations), 14 of which have phase data wired through correctly.
- All 45 existing tests still pass (`pytest -q`).
- Smoke-tested all adjacent endpoints (boats, locations, today, documents, budget, helper-assignments) — all still HTTP 200.

**Branch**: fix/2026-04-08-timeline-endpoint-schema-errors
**Side effects**: None. Pure read path — no writes, no schema changes, no migration. Purely corrects column names.
**Next priority**: The locations `site` / `location_type` / `type` confusion suggests other dead columns may linger. A systematic audit of all SQL queries vs. `PRAGMA table_info` output would be valuable. Also: `ISSUES.md` P1 items — empty Picture Boats / Security Boats / Transport / Helpers / Guards lists — remain and should be investigated next session.

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
