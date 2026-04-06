# CHANGELOG — ShootLogix

## 2026-04-06 — [P1] Seed Picture Boats and Security Boats tables from fleet data

**Problem**: Picture Boats tab and Security Boats tab showed empty lists (0 items). All 46 boats existed only in the main `boats` table with `category='picture'`. The separate `picture_boats` and `security_boats` tables (queried by their respective API endpoints) were never populated.

**Root cause**: The data loader (`data_loader.py`) migrated all boats from BATEAUX into the main `boats` table. The `_seed_picture_boats()` and `_seed_security_boats()` functions only created boat **functions** (role definitions like YELLOW/RED/NEUTRAL/EXILE for picture, SAFETY GAMES/COUNCIL/ARENA for security) but never created actual boat entities in the `picture_boats` or `security_boats` tables.

**Fix**:
- `data_loader.py`: Added two new seeder functions:
  - `_seed_picture_boat_entities(prod_id)`: Copies 38 boats from the fleet into `picture_boats`. Includes all boats except those assigned exclusively to safety/evac/medical/construction functions.
  - `_seed_security_boat_entities(prod_id)`: Copies 5 safety-related boats (ESMELDA, EVAC, EVAC BOAT, MISHKA, MISHKA 24/7) into `security_boats`, identified by their function assignments (SAFETY/EVAC/MEDICAL) and boat names.
- Both seeders are idempotent (skip if tables already have data) and called from both bootstrap paths (existing production and first-time setup).
- Added `create_picture_boat` to imports.

**Verification**:
- `/api/productions/1/picture-boats` returns 38 boats (was 0)
- `/api/productions/1/security-boats` returns 5 boats (was 0)
- `/api/productions/1/boats` still returns 46 boats (no regression)
- All other endpoints unaffected (locations: 21, FNB: 9, budget: 7)
- Idempotent: restarting app does not create duplicates

**Branch**: fix/2026-04-06-seed-picture-security-boats
**Side effects**: None — only adds data, no schema changes, no deletions
**Next priority**: P1 items — Transport vehicles list empty (0 items), Helpers/Guards lists empty

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
