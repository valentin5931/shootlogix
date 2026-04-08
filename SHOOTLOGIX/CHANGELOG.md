# CHANGELOG — ShootLogix

## 2026-04-08 — [P0] Stabilize Fleet/Crew sub-nav (stop moving element between view panels)

**Problem**: Fleet (Boats/Picture Boats/Security Boats) and Crew (Labor/Guards) each kept a single sub-nav DOM element that was prepended into whichever sub-panel was active. On every sub-tab switch, that element was physically moved from one `view-panel` to another. This caused layout shifts, forced re-layout of every target panel, and was fragile (e.g. event bindings attached in JS rather than inline `onclick` would be at risk). ISSUES.md tracked this as P0 "Fleet/Crew sub-tab event handlers may not fire on cloned DOM".

**Root cause**: `renderFleetUnified()` and `renderCrewUnified()` used `targetPanel.prepend(nav)` to inject the sub-nav into the currently active sub-panel. Since each sub-tab owns its own `view-panel`, this meant the sub-nav element was shuttled across panels on every click.

**Fix**:
- `templates/index.html`: Added two persistent sub-nav containers — `#fleet-subnav-bar` and `#crew-subnav-bar` — as siblings of the view panels inside `#main-content`. Removed the now-unused `<div id="fleet-sub-nav"></div>` from inside `#view-fleet`.
- `static/style.css`: Added `.subnav-bar` rule (absolute-positioned at the top of `#main-content`, hidden by default, `.active` shows it). Changed `.view-panel` from `inset: 0` to `top: var(--subnav-bar-h); right: 0; bottom: 0; left: 0;` so panels shift down by the sub-nav height when fleet/crew is active. Existing layout-div height formulas (`calc(100vh - 48px - 2.5rem - var(--subnav-bar-h))`) continue to work unchanged.
- `static/app-monolith.js`:
  - `renderFleetUnified()` now writes the sub-nav HTML into `#fleet-subnav-bar` and toggles `.active` on it (hiding `#crew-subnav-bar`). No DOM node is moved between panels.
  - `renderCrewUnified()` does the same for `#crew-subnav-bar`.
  - `setTab()` now hides both sub-nav bars (and resets `--subnav-bar-h` to `0px`) when switching to a tab other than fleet/crew.

**Verification**:
- `node -e 'new Function(fs.readFileSync("static/app-monolith.js","utf8"))'` → JS parses cleanly.
- `python3 -m pytest -q` → 45 passed.
- Manual trace of setTab → renderFleetUnified → fleetSetSubTab → renderFleetUnified → setTab('transport') confirms the sub-nav bar is shown/updated in place and hidden on leave, with `--subnav-bar-h` correctly cycling between measured height and `0px`.
- `view-fuel`'s `height: 100%` override is safe because fuel is not a fleet/crew tab, so `--subnav-bar-h` is always `0px` when it is active.

**Branch**: fix/2026-04-08-fleet-crew-subnav-outside-panels
**Side effects**: None. `.fleet-sub-nav` CSS class (line 4674) remains but is only referenced from the dead `static/modules/fleet.js` (tracked as P2 in ISSUES.md); left in place per the "no unrelated refactors" rule.
**Next priority**: P1 — Picture Boats / Security Boats lists returning `[]` from the API (data model investigation).

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
