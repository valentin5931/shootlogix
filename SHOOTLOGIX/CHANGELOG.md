# CHANGELOG — ShootLogix

## 2026-04-08 — [P0] Fix Labour tab empty on fresh DB — data_loader seeded wrong context

**Problem**: On any fresh deployment (or any environment where the DB is rebuilt), the Labour/Crew tab showed an empty list of workers/functions. `GET /api/productions/1/boat-functions?context=labour` returned `[]`, while the database actually contained 73 `boat_functions` rows — but they were stored with `context='helpers'` instead of `context='labour'`. The frontend, the migration, and every other consumer use `'labour'`, so nothing could find them.

**Root cause**: `data_loader._seed_helpers()` seeded rows with the legacy string `context='helpers'` (lines 409 & 427). `database.init_db()` has a one-shot migration that renames `context='helpers'` → `context='labour'`, but that migration runs BEFORE `data_loader.bootstrap()` in the startup sequence (`init_db → migrate_auth_tables → bootstrap → seed_auth_data`). So the order on a fresh DB was:

1. `init_db()` runs the rename migration — nothing to rename (empty DB)
2. `bootstrap()` → `_seed_helpers()` inserts 73 rows with `context='helpers'`
3. App starts → Labour tab queries `?context=labour` → 0 rows

The idempotency guard at the top of `_seed_helpers()` also checked for `context='helpers'`, so on every subsequent boot the migration renamed the stale rows to `'labour'` but the guard saw zero `'helpers'` rows and re-seeded them with the wrong context, perpetually recreating the orphan state.

**Fix**: `SHOOTLOGIX/data_loader.py` (`_seed_helpers`, ~L405–L436): changed both the existence check and the `create_boat_function` call to use `context='labour'`. Added a comment explaining the ordering constraint so the next person doesn't flip it back. The DB-side rename migration in `database.py` is left in place as a safety net for any legacy prod data.

**Verification**:
- Wiped `shootlogix.db`, re-ran full bootstrap → `boat_functions` now has `('labour', 73)` instead of `('helpers', 73)`.
- `GET /api/productions/1/boat-functions?context=labour` returns 73 entries (was `[]`).
- Re-ran `_seed_helpers()` on a DB that already has seeded data → no duplicates (idempotent).
- Simulated legacy state (renamed `'labour'` back to `'helpers'`) → `init_db()` migration renamed them to `'labour'`, then `_seed_helpers()` correctly skipped seeding → still 73 rows, still all `'labour'`.
- `pytest tests/` → 45 passed, 0 failed.

**Branch**: fix/2026-04-08-labour-context-mismatch
**PR**: pending
**Side effects**: None. The rename migration in `database.py` remains as-is for any deployments whose DB still contains `context='helpers'` rows.
**Next priority**: Picture Boats / Security Boats tables still empty (P1 in ISSUES.md — architectural, all picture boats currently live in the main `boats` table with `category='picture'`).

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
