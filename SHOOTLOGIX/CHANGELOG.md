# CHANGELOG — ShootLogix

## 2026-04-01 — [P1] Seed picture boats and security boats + fix duplicate helper functions

**Problem**: Picture Boats and Security Boats tabs were completely empty — the data seeder created functions (YELLOW/RED/NEUTRAL/EXILE for picture; SAFETY GAMES/COUNCIL/ARENA/EVAC/MEDICAL/STANDBY for security) but never created actual boat entities. Additionally, the helper functions seeder had a context mismatch (`helpers` vs `labour`) causing 500+ duplicate `boat_functions` rows on every restart.

**Root cause**:
1. `_seed_picture_boats()` and `_seed_security_boats()` in `data_loader.py` only seeded function groups, not actual boat records in the `picture_boats` and `security_boats` tables.
2. `_seed_helpers()` checked for `context='helpers'` but a database migration renames those to `context='labour'`, so the check always found 0 results and re-seeded every startup.
3. The "existing production" startup path in `bootstrap()` only called `_seed_picture_boats()` but not `_seed_security_boats()`, `_seed_transport()`, or `_seed_helpers()`.

**Fix**:
- `data_loader.py`: Added `PICTURE_BOATS_DATA` (8 camera boats: YELLOW 1-2, RED 1-2, NEUTRAL 1-2, EXILE, DRONE) and `SECURITY_BOATS_DATA` (7 safety boats: SAFETY 1-3, EVAC 1-2, MEDICAL, STANDBY RIB) with realistic rates/vendors.
- `data_loader.py`: Updated `_seed_picture_boats()` and `_seed_security_boats()` to also seed boat entities if none exist (ignoring soft-deleted).
- `data_loader.py`: Fixed `_seed_helpers()` context check from `'helpers'` to `IN ('helpers','labour')` and seed context from `'helpers'` to `'labour'`.
- `data_loader.py`: Added `_seed_security_boats()`, `_seed_transport()`, `_seed_helpers()` to the existing-production startup path in `bootstrap()`.
- `database.py`: Added migration to clean up duplicate `labour` `boat_functions` rows.

**Verification**:
- `/api/productions/1/picture-boats` returns 8 boats (was 0)
- `/api/productions/1/security-boats` returns 7 boats (was 0)
- `boat_functions` counts: labour=73, boats=25, transport=13, security=6, picture=4 (no duplicates)
- All other endpoints return correct data, no regressions
- JS syntax check passes

**Branch**: fix/2026-04-01-seed-picture-security-boats
**Side effects**: None
**Next priority**: Helpers and Guards tables still empty (P1) — users need to add workers/guards via the UI

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
