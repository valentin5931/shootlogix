# CHANGELOG — ShootLogix

## 2026-04-16 — [P1] Fix Today tab rendering blank cards when entity (helper/boat/vehicle) is unassigned

**Problem**: On the Today tab, each card (boat, transport vehicle, labour helper, guard) rendered
the entity name as a `<strong>` primary label and the function name as the subtitle. When an
assignment exists but the entity name is null/empty (e.g. a helper_assignment with no
`helper_id` and no `helper_name_override`), the card displayed an empty `<strong></strong>`
above the function name. On the live KLAS7 data, this caused 65 of 66 labour cards on the
Today tab to render with a blank bold header — looking broken to the user.

**Root cause**: `renderToday()` in `static/app-monolith.js` passed `b.boat_name`,
`v.vehicle_name`, `h.helper_name`, `g.helper_name` directly to `esc()` with no fallback.
`esc(null)` returns `''`, so cards with missing entity names rendered as `<strong></strong>`.
The helpers, picture_boats, security_boats, and guards tables are often empty on a fresh
production while their assignments (linked only to a function) are seeded — this is an
intentional data model decision, but the UI wasn't handling it.

**Fix**: `static/app-monolith.js` `renderToday()`: introduced a `_todayCard(borderColor,
entityName, functionName, prefix)` helper that promotes the function name to the primary
label when the entity name is missing and shows `(Unassigned)` as the subtitle. All six
card-rendering loops (boats, picture_boats, security_boats, transport, labour, guards)
now go through this helper. Keeps the visual style identical for populated entities.

**Verification**:
- Loaded `/api/productions/1/today?date=2026-04-16` — 20 boats render with their names
  (unchanged), 65/66 labour cards now show the function name prominently instead of
  a blank header.
- `node --check static/app-monolith.js` passes.
- All 45 tests in `tests/` pass.
- Simulated renderer with five scenarios (boat with name, helper no name, guard no name,
  picture boat with name, both null) — all produce valid non-empty cards.

**Branch**: fix/2026-04-16-today-empty-entity-names
**Side effects**: None. Only changes visual fallback for already-empty fields.
**Next priority**: Seed or allow manual creation of physical helpers/guards/picture-boat/
security-boat records so the cards can show real names (tracked in ISSUES.md).

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
