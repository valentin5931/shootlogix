# CHANGELOG — ShootLogix

## 2026-04-15 — [P0] Fix Timeline API 500 — stale column references (locations.site, location_schedules.prep/filming/wrap, guard_camp_assignments.worker_id)

**Problem**: `GET /api/productions/<id>/timeline` returned HTTP 500 with `sqlite3.OperationalError: no such column: site`. After fixing that, it also failed on `no such column: prep`. The Timeline tab therefore could not render anything — users only saw a silent failure on the front-end.

**Root cause**: The timeline aggregator in `app.py` (`api_timeline`) referenced three column names that no longer match the current SQLite schema:
1. `locations.site` — the column is now `location_type` (plus legacy `type`); `site` was dropped in a prior migration.
2. `location_schedules.prep`, `.filming`, `.wrap` — the table now stores phases as a single `status` column with values `'P'`, `'F'`, or `'W'` (one row per phase per date).
3. `guard_camp_assignments.worker_id` — the actual FK column is `helper_id` (guard camp workers reuse the helpers-assignment schema).

Because it was the only 500-ing endpoint in the diagnostic sweep, the Timeline tab was the highest-priority unfixed P0.

**Fix** (`app.py`, `api_timeline` around lines 7892–7918):
- Select `location_type, type` instead of `site`, and exclude soft-deleted rows (`deleted_at IS NULL`).
- Read `location_schedules.status` and group phases by date, emitting one `loc_assignment` per date with `phases` like `'P/F/W'` ordered P→F→W. Also match schedules by `location_id` OR `location_name` to catch legacy rows without a joined id.
- Change `guard_camp_assignments WHERE worker_id=?` to `WHERE helper_id=?`.
- Use `loc['location_type'] or loc['type'] or 'Location'` for the resource subgroup label.

**Verification**:
- `curl -H "Authorization: Bearer …" /api/productions/1/timeline` → HTTP 200, 40628 bytes, 81 resources (46 boats, 14 vehicles, 21 locations), 32 shooting days, 121 functions. Location resources carry aggregated phase assignments (e.g. `{id: 42, phases: 'F', start_date: '2026-04-02'}`).
- Full pytest suite: 45 passed.
- JS and Python syntax checks pass.

**Branch**: fix/2026-04-15-timeline-500-locations-site-column
**Side effects**: None — endpoint was entirely non-functional before; downstream callers received a 500 and showed nothing.
**Next priority**: Seed / investigate empty lists (picture_boats, security_boats, transport, helpers, guards, fuel) — see ISSUES.md. These are P1 because the endpoints work but data is missing.

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
