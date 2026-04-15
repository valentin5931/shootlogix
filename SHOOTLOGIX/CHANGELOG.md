# CHANGELOG — ShootLogix

## 2026-04-15 — [P0] Stop moving Fleet/Crew sub-nav DOM node between panels

**Problem**: `renderFleetUnified()` and `renderCrewUnified()` kept a single sub-nav element and moved it between sub-panels on every sub-tab switch using `targetPanel.prepend(nav)`. Each switch (Boats→Picture Boats→Security Boats, Labour→Guards) triggered a DOM move that caused layout shifts, forced reflow of the sub-panel's padding area, and risked resetting any transient UI state attached to the nav element. The fleet sub-nav was even declared inside `view-fleet` (a panel never shown) and yanked out on first use.

**Root cause**: The sub-nav was maintained as a single reusable element whose parent changed on every render. DOM mutations scale with sub-tab switch frequency rather than staying a one-time cost.

**Fix**:
- `templates/index.html`: Added a static `<div class="fleet-sub-nav-bar">` as first child of `view-boats`, `view-picture-boats`, `view-security-boats`. Added a static `<div class="crew-sub-nav-bar">` as first child of `view-labour` and `view-guards`. Each bar has data-attribute buttons (`data-fleet-sub`, `data-crew-sub`) for active-state tracking. Removed the now-unused `<div id="fleet-sub-nav">` from `view-fleet`.
- `static/style.css`: Added `.fleet-sub-nav-bar, .crew-sub-nav-bar` base styles matching the previous inline styling. Scoped `--subnav-bar-h: 39px` to the 5 panels that actually contain a sub-nav so layout height calcs get the right value automatically without JS.
- `static/app-monolith.js`: `renderFleetUnified()` and `renderCrewUnified()` no longer build innerHTML, prepend DOM nodes, or measure offsetHeight. They just toggle the `.active` class on `[data-fleet-sub]` / `[data-crew-sub]` buttons. `setTab()` no longer needs to reset `--subnav-bar-h` — per-panel CSS scoping handles it.

**Verification**:
- `node -c static/app-monolith.js` passes.
- `pytest tests/` — all 45 tests pass.
- Flask app boots cleanly, `GET /` returns 200 and the rendered HTML contains exactly 3 `fleet-sub-nav-bar` (one per fleet sub-panel) and 2 `crew-sub-nav-bar` (one per crew sub-panel). No residual `id="fleet-sub-nav"`.
- Switching Fleet sub-tabs (Boats ↔ Picture Boats ↔ Security Boats) and Crew sub-tabs (Labor ↔ Guards) now only mutates button classes, not DOM structure.

**Branch**: fix/2026-04-15-fleet-crew-subnav-no-dom-move
**Side effects**: None. The legacy `<div class="crew-sub-nav">` still inside `view-crew` is harmless (panel never activates). The old `crew-sub-nav-injected` element created by JS on previous loads is no longer produced.
**Next priority**: P1 — Picture Boats and Security Boats lists are empty (investigate data model / seeding in `database.py` and `data_loader.py`).

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
