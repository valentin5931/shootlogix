# CHANGELOG — ShootLogix

## 2026-04-11 — [P0] Fix Timeline API 500 crash — wrong column names on locations/location_schedules

**Problem**: `GET /api/productions/<id>/timeline` returned HTTP 500 with `sqlite3.OperationalError: no such column: site`. After fixing the first column, a second crash surfaced: `no such column: prep`. The Timeline tab was unusable — any attempt to load it crashed the endpoint before any location data could be returned.

**Root cause**: `api_timeline()` in `app.py` read two non-existent columns from the locations schema:
1. `SELECT id, name, site FROM locations` — the `locations` table has `location_type`, not `site` (its columns are `id, production_id, name, lat, lng, type, location_type, access_note, price_p, price_f, price_w, global_deal, version, deleted_at`).
2. `SELECT id, date, prep, filming, wrap FROM location_schedules` — that table stores a single-letter `status` column (`'P'`, `'F'`, or `'W'`), not three boolean columns. One row per (location, date) via `INSERT OR REPLACE`.

The previous Timeline fix (commit `f2394ac`) repaired other crashes but never touched these queries, so the bug stayed live.

**Fix** (`app.py` ~line 7893):
- `locations` query now reads `SELECT id, name, location_type ... AND deleted_at IS NULL` (also skips soft-deleted rows).
- `location_schedules` query now reads `SELECT id, date, status` and maps the single status letter to the `phases` field (`'P'`/`'F'`/`'W'`).
- Subgroup label now reads `loc['location_type']` instead of the non-existent `loc['site']`.

**Verification**:
- `GET /api/productions/1/timeline` now returns 200 with 81 resources (46 boats, 14 vehicles, 21 locations) on a fresh bootstrap DB.
- Full `pytest` suite: 45/45 passing, no regressions.
- `python -c "import ast; ast.parse(open('app.py').read())"` passes.

**Branch**: fix/2026-04-11-timeline-locations-site-column
**Side effects**: Soft-deleted locations are now correctly excluded from the Timeline (previously would have crashed before reaching them, so this is a strict improvement).
**Next priority**: Picture Boats and Security Boats lists remain empty (P1 in ISSUES.md). Need to decide whether this is a data seeding gap or a code bug before fixing.

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
