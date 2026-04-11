# CHANGELOG — ShootLogix

## 2026-04-11 — [P0] Fix Timeline API 500 — schema drift in app.py::api_timeline

**Problem**: GET `/api/productions/<id>/timeline` returned HTTP 500
(`sqlite3.OperationalError: no such column: site`). The Timeline tab could not
load any data for the production. The Documents API crash was already fixed on
2026-03-22, but `api_timeline` still referenced columns that no longer exist
(or never existed) in the current schema.

**Root cause**: `app.py::api_timeline` (lines ~7880–7914) carried four schema
drift bugs:
1. `SELECT id, name, site FROM locations` — `locations` has no `site` column.
   The intended subgroup field is `location_type`.
2. `SELECT id, date, prep, filming, wrap FROM location_schedules` — these
   columns do not exist. `location_schedules` stores one row per
   `(location, date, status)` tuple where `status` is `'P' | 'F' | 'W'`.
3. `loc['site']` — `KeyError` once the SELECT was corrected.
4. `FROM guard_camp_assignments WHERE worker_id=?` — `guard_camp_assignments`
   uses `helper_id` (FK → `guard_camp_workers.id`), not `worker_id`. Latent
   bug: only fires when `guard_camp_workers` has rows (currently 0).

**Fix**:
- `app.py` (api_timeline, ~7880–7916):
  - Locations SELECT now pulls `location_type`; `subgroup` uses it.
  - Location schedules SELECT now pulls `(id, date, status)` and aggregates
    statuses per date into a `phases` string (e.g. `"P/F"`).
  - Guard-camp assignments query now joins on `helper_id`.
- `tests/test_timeline.py` (new): 3 regression tests covering the timeline
  endpoint — 200 status, resource shape validation, and P/F/W phase
  aggregation invariants.

**Verification**:
- `curl /api/productions/1/timeline` → HTTP 200, 40628 bytes.
- Payload contains 81 resources (46 boats, 14 vehicles, 21 locations) plus
  32 shooting days and 121 boat functions.
- Location phases correctly aggregated: e.g. `ARENA (SABOGA)` has two date
  entries with `phases: "F"`.
- `pytest` — 48/48 passing (was 45; +3 new timeline tests).
- No regressions on `/boats`, `/picture-boats`, `/security-boats`,
  `/transport-vehicles`, `/helpers`, `/helper-assignments`, `/guards`,
  `/guard-posts`, `/fuel-entries`, `/fuel-machinery`, `/locations`,
  `/shooting-days`, `/budget`, `/documents`.

**Branch**: fix/2026-04-11-timeline-endpoint-schema-drift
**Side effects**: None
**Next priority**: The picture_boats / security_boats / helpers / guards
seed tables remain empty on a fresh bootstrap (P1 items in ISSUES.md).
`_seed_picture_boats` and `_seed_security_boats` only seed `boat_functions`,
not the entity tables themselves. Decide whether to backfill with sample data
or document as expected user-entered state.

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
