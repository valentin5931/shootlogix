# CHANGELOG — ShootLogix

## 2026-04-08 — [P0] Fix Timeline tab (500 crash + missing frontend renderer)

**Problem**:
1. `GET /api/productions/<id>/timeline` crashed with `sqlite3.OperationalError: no such column: site` (then cascaded to `no such column: prep`, `worker_id` once the first was fixed). The endpoint was unusable — any call returned HTTP 500.
2. Even if the backend had worked, clicking the Timeline tab in the UI rendered an empty panel: `setTab('timeline')` called `App.renderTimeline` behind a `typeof === 'function'` guard, but no such function was ever defined in `app-monolith.js`.

**Root cause**:
- The timeline endpoint (`app.py:api_timeline`) was written against a stale/assumed schema:
  - `SELECT site FROM locations` — locations has no `site` column, it has `location_type` (game / tribal_camp / reward).
  - `SELECT prep, filming, wrap FROM location_schedules` — those columns don't exist; `location_schedules` stores a single `status` column with values `'P'` / `'F'` / `'W'`.
  - `SELECT ... FROM guard_camp_assignments WHERE worker_id=?` — the FK column is named `helper_id`, not `worker_id`.
  - Resource queries (boats, picture_boats, security_boats, transport_vehicles, helpers) did not filter `deleted_at IS NULL`, so soft-deleted entities would have leaked into the Gantt view.
- `renderTimeline` was listed in a previous session's changelog ("timeline hookup") but only the `setTab` dispatch line was wired in — the actual render function body was never written.

**Fix**:
- `app.py` (lines ~7814-7930, `api_timeline`):
  - `locations`: `SELECT id, name, location_type ... AND deleted_at IS NULL`; updated `subgroup` to read `loc['location_type']`.
  - `location_schedules`: `SELECT id, date, status ... WHERE location_id=? AND status IS NOT NULL AND status != ''`; each schedule row now emits a single assignment with `phases = status` instead of the deleted prep/filming/wrap tri-column logic.
  - `guard_camp_assignments`: fixed column reference to `helper_id`; added `group_name` to the worker SELECT and fell back through `group_name → role → 'Guards'` for the subgroup label.
  - Added `AND deleted_at IS NULL` to the `boats`, `picture_boats`, `security_boats`, `transport_vehicles`, `helpers`, and `guard_camp_workers` SELECTs so the timeline matches the resource lists shown in the main tabs.
- `static/app-monolith.js`:
  - Added module-level `_timelineGroupFilter` state, `_timelineFilter(g)` helper, and a full `renderTimeline()` function just above `setTab`. It fetches `/api/productions/<id>/timeline`, builds a date-range header from `start_date → end_date`, groups resources into Boats / Vehicles / Crew / Locations, and renders a sticky-header/sticky-first-column Gantt grid with one cell per day. Assignments honour `day_overrides` (`removed` / `off` / `false` / `0` hide the bar). Locations render their phase letter (`P` / `F` / `W`) with phase-specific colours; other resource types render a coloured bar (blue confirmed, amber tentative, green otherwise).
  - Replaced the defensive `if (typeof App.renderTimeline === 'function') App.renderTimeline()` call in `setTab` with a direct `renderTimeline()` now that the function exists.
  - Exported `renderTimeline` and `_timelineFilter` from the public App return object.

**Verification**:
- `python -m pytest tests/` — all 45 tests pass.
- `GET /api/productions/1/timeline` with an ADMIN token now returns HTTP 200 / ~40 KB of JSON: 81 resources (46 Boats, 14 Vehicles, 21 Locations), 32 shooting days, 121 boat functions, 57 assignments total (26 boat / 31 location phase entries). Previously returned HTTP 500.
- Manual spot-checks against sample rows confirm: boat assignments include `start_date/end_date/function_id/day_overrides`; location assignments include `phases` ('F'/'P'/'W'); guard/helper subgroups fall back through `group_name → role`.
- JS syntax check (`node -c`) and Python syntax check (`ast.parse`) both pass.

**Branch**: fix/2026-04-08-timeline-tab-broken
**Side effects**: None expected. The `deleted_at IS NULL` filter additions align the timeline with the rest of the app; no other callers of `api_timeline` exist. Frontend `_timelineGroupFilter` state is module-local and only read by `renderTimeline`.
**Next priority**: The ISSUES.md entries for empty Picture Boats / Security Boats / Transport / Helpers / Guards / Fuel lists are still open (P1). The earliest quick win is probably investigating why `boats.category = 'picture'` rows are never surfaced under `/api/productions/<id>/picture-boats` — either the data loader should seed the dedicated `picture_boats` table, or the Fleet > Picture Boats tab should query `boats WHERE category='picture'`.

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
