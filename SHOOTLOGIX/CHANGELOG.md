# CHANGELOG — ShootLogix

## 2026-04-16 — [P0] Fix Timeline API 500 — wrong column names in locations join

**Problem**: `GET /api/productions/<id>/timeline` always returned HTTP 500 with
`sqlite3.OperationalError: no such column: site` (and once that was patched, a
follow-on `no such column: prep`). The Timeline tab was effectively broken for
every user — the request 500'd before any timeline data could render.

**Root cause**: Two stale schema assumptions in `api_timeline()`
(`app.py:7797`):
1. The query selected `site` from `locations`, but the `locations` table has
   no such column. The codebase uses `location_type` (`game`/`camp`/etc.)
   everywhere else as the canonical grouping field (see `app.py:4063`,
   `app.py:7251`).
2. The query selected `prep, filming, wrap` from `location_schedules` as if
   they were three boolean columns. The actual schema stores one row per
   (location, date, phase) with a single `status` column holding `'P'`,
   `'F'`, or `'W'`.

**Fix** (`SHOOTLOGIX/app.py:7892-7929`):
- Replace `SELECT id, name, site …` with `SELECT id, name, location_type …`,
  and use `loc['location_type']` as the Timeline subgroup label.
- Replace `SELECT id, date, prep, filming, wrap …` with
  `SELECT id, date, status …` and aggregate phases per date by collecting
  the distinct `status` codes for each date into the existing `phases`
  string (e.g. `"P/F"`).

**Verification**:
- `curl /api/productions/1/timeline` → HTTP 200, 40 KB payload, 32 shooting
  days, 81 resources (46 boats + 21 locations + 14 vehicles), 121 boat
  functions. Sample location `ARENA (SABOGA)` now returns `subgroup=game`
  with 4 dated phase assignments.
- `python -m py_compile app.py` passes.
- Full pytest suite: **45 passed**.
- Re-ran the 17-endpoint diagnostic checklist — every endpoint returns 200
  (no regressions on boats, locations, budget, documents, fnb, etc.).

**Branch**: `fix/2026-04-16-timeline-500-no-such-column-site`
**Side effects**: None. Locations with no scheduled phases produce an empty
`assignments` array (same as before). Locations with multiple phases on the
same date now correctly merge to e.g. `"P/F"` — previously this code path
crashed before producing any output.
**Next priority**: P1 — investigate why `picture_boats` and `security_boats`
tables are empty (boats categorized as `picture` may live in the main
`boats` table; see ISSUES.md).

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
