# CHANGELOG — ShootLogix

## 2026-04-12 — [P1] Populate picture_boats and security_boats tables (empty list fix)

**Problem**: The Picture Boats and Security Boats tabs showed empty lists. `/api/productions/1/picture-boats` returned `[]` and `/api/productions/1/security-boats` returned `[]`, despite 46 boats existing in the main `boats` table.

**Root cause**: The `_seed_picture_boats()` and `_seed_security_boats()` functions in `data_loader.py` only created `boat_functions` (role/team definitions like YELLOW, RED, SAFETY GAMES, etc.) but never populated the `picture_boats` and `security_boats` entity tables themselves. The API routes correctly query these tables — they were simply empty.

**Fix**:
- `data_loader.py`: Added `_populate_picture_boats(prod_id)` — one-time migration that copies all `category='picture'` boats from the `boats` table into `picture_boats` (46 entries).
- `data_loader.py`: Added `_populate_security_boats(prod_id)` — seeds 6 known safety vessels (EVAC, EVAC BOAT, MISHKA, MISHKA 24/7, ESMELDA, RD) into `security_boats`.
- Both functions are protected by settings flags (`picture_boats_populated_v1`, `security_boats_populated_v1`) for idempotency.
- Added `create_picture_boat` to imports.
- Both functions called from both bootstrap paths (existing production + first-time setup).

**Verification**:
- `/api/productions/1/picture-boats` → 46 picture boats (was 0)
- `/api/productions/1/security-boats` → 6 security boats (was 0)
- All 45 pytest tests pass
- CRUD create works for both picture boats and security boats
- No regressions on any other endpoint (boats, transport, locations, FNB, budget, etc.)
- Migration is idempotent (restarting the app does not re-add boats)

**Branch**: fix/2026-04-12-populate-picture-security-boats
**Side effects**: None
**Next priority**: Crew > Helpers (0 items) and Crew > Guards (0 items) — similar empty-table issue. Also, DELETE endpoints for picture_boats/security_boats return 404 (missing routes).

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
