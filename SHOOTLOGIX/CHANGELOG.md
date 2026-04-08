# CHANGELOG — ShootLogix

## 2026-03-31 — [P1] Add missing seeders to existing-DB startup path

**Problem**: On existing databases (e.g. Railway deployment), the `_seed_helpers`, `_seed_security_boats`, and `_seed_transport` functions were only called during first-time bootstrap but NOT on subsequent startups. This meant if a fresh DB was initialized without these seeds (e.g. DB restored from backup missing this data), helpers, security boat functions, and transport vehicles/functions would never be created.

**Root cause**: The existing-DB startup path in `bootstrap()` (line 355-365) only called `_seed_picture_boats`, `_seed_picture_boat_entries`, `_seed_security_boat_entries`, and downstream seeders. The `_seed_helpers`, `_seed_security_boats`, and `_seed_transport` calls were only in the first-time bootstrap path (line 396-409).

**Fix**: `data_loader.py` — Added `_seed_helpers(prod_id)`, `_seed_security_boats(prod_id)`, and `_seed_transport(prod_id)` to the existing-DB startup path, matching the first-time bootstrap path. All seeders are idempotent (skip if data already exists).

**Verification**: App restarts correctly with all seeders running; no duplicate data created on subsequent restarts.

**Branch**: fix/2026-03-31-seed-picture-security-boats
**Side effects**: None — all seeders check for existing data before inserting
**Next priority**: Merge open PRs (#17-#29) to unblock further P1/P2 work

## 2026-03-31 — [P1] Seed picture boats and security boats data

**Problem**: Picture Boats and Security Boats tabs under Fleet showed empty lists ("No picture boats" / "No security boats"). The `picture_boats` and `security_boats` database tables were never populated — the data loader only created boat functions (YELLOW/RED/NEUTRAL/EXILE for picture, SAFETY GAMES/COUNCIL/ARENA/EVAC/MEDICAL/STANDBY for security) but no actual boat entries.

**Root cause**: The `migrate_from_bateaux()` function loaded all 46 boats into the `boats` table (main fleet). The `_seed_picture_boats()` and `_seed_security_boats()` functions only seeded `boat_functions` records (role definitions), not actual boats in the `picture_boats`/`security_boats` tables. The three-table design (boats, picture_boats, security_boats) requires each category to have its own data.

**Fix**:
- `data_loader.py`: Added `create_picture_boat` to imports. Added `PICTURE_BOAT_SEED` (8 boats: PCC 1-4, BONGO 1-2, GOD IS LOVE, DIOS PERFECTO) and `SECURITY_BOAT_SEED` (6 boats: EVAC, EVAC BOAT, MISHKA, MISHKA 24/7, ESMELDA, DONA LUCILA). Added `_seed_picture_boat_entries()` and `_seed_security_boat_entries()` functions with idempotent checks (only seeds when no active boats exist). Called from both bootstrap paths (existing production + first-time setup).

**Verification**:
- `/api/productions/1/picture-boats` returns 8 boats (was 0)
- `/api/productions/1/security-boats` returns 6 boats (was 0)
- Picture/security boat functions still present (4 + 6)
- Assignment endpoints return 200 (ready for users to assign boats to functions)
- Existing fleet boats (46) unchanged
- Seed is idempotent — won't duplicate on restart

**Branch**: fix/2026-03-31-seed-picture-security-boats
**Side effects**: None — only adds data to previously empty tables
**Next priority**: Test creating/editing/deleting picture boats and security boats via the UI; verify drag-and-drop assignment works

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
