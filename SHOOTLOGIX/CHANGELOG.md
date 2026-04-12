# CHANGELOG — ShootLogix

## 2026-04-12 — [P0] Fix Timeline tab completely broken (SQL schema + monolith compat)

**Problem**: Clicking the Timeline tab was a dead end:
1. `GET /api/productions/<id>/timeline` returned **HTTP 500** — `sqlite3.OperationalError: no such column: site`, then (after that first fix) `no such column: prep`. The endpoint queried `SELECT id, name, site FROM locations` and `SELECT id, date, prep, filming, wrap FROM location_schedules`, but neither schema has those columns.
2. Even if the backend had worked, `static/js/timeline.js` pulled `prodId` from `window._SL.state.prodId` (which only exists in the legacy module architecture, not the monolith) and read the JWT from `localStorage['sl_token']` (the monolith writes it as `access_token`). So the UI showed "No production selected." regardless.

**Root cause**:
- `api_timeline()` in `app.py` was written against a phantom/older schema. The real `locations` table has `location_type` (`'game'`/`'tribal_camp'`/`'reward'`), and `location_schedules` stores a single `status` TEXT column with values `'P'`/`'F'`/`'W'`, not three booleans.
- `static/js/timeline.js` was authored for the `window._SL` module system referenced in `static/app.js`, but `templates/index.html` only loads `app-monolith.js` + `timeline.js`, so `window._SL` is always undefined at runtime.

**Fix**:
- `app.py` (`api_timeline`, lines ~7892–7915): `SELECT id, name, site …` → `SELECT id, name, location_type …`; `SELECT id, date, prep, filming, wrap …` → `SELECT id, date, status …`; build `phases` from `s['status']` directly (single phase letter per row, consistent with the unique `(production_id, location_name, date)` constraint). Subgroup now uses `loc['location_type']`.
- `static/js/timeline.js` (`_loadData`): fall back to `localStorage.getItem('currentProdId')` when `window._SL` is absent (the monolith writes this key in `_selectProject`).
- `static/js/timeline.js` (`_api`): read `access_token` first, fall back to legacy `sl_token`.

**Verification**:
- `curl /api/productions/1/timeline` with a valid JWT → **HTTP 200**, 40.6 KB JSON, 81 resources (39 boats/boat-family items, 3 vehicles, 21 locations), 32 shooting days, 2026-02-20 → 2026-05-04.
- All 21 locations render with subgroup = `location_type`; e.g. `ARENA (SABOGA)` (`game`, 4 assignments), `CAMP YELLOW` (`tribal_camp`, 0).
- `node -e new Function(readFileSync(...))` JS syntax check passes for `timeline.js` and `app-monolith.js`.
- `python -m pytest tests/` → **45 passed** (no regressions).

**Branch**: fix/2026-04-12-timeline-500-site-column
**PR**: (filed via MCP below)
**Side effects**: None. The monolith token fallback is additive — legacy `sl_token` still works if present.
**Next priority**: P1 — Picture Boats / Security Boats / Guards / Transport lists are empty (data seeding, tracked in ISSUES.md).

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
