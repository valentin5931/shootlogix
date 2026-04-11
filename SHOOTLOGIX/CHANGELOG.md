# CHANGELOG — ShootLogix

## 2026-04-11 — [P0] Fix fleet/crew sub-nav DOM reparenting (stable location, no more prepend)

**Problem**: The Fleet sub-nav (`#fleet-sub-nav`) and the Crew sub-nav (`#crew-sub-nav-injected`) were being `prepend()`ed into the active sub-panel (`view-boats`, `view-picture-boats`, `view-security-boats`, `view-labour`, or `view-guards`) on every render. This meant the sub-nav DOM element was torn from one parent and inserted into another each time the user switched sub-tabs. Consequences:
1. Layout shifts on each sub-tab switch (the prior panel was mutated, the new panel gained the nav).
2. The original `#view-fleet` panel was permanently stripped of its sub-nav after the first render, leaving its HTML in an inconsistent state with the template.
3. Any listener/observer attached to the nav's original parent chain was broken after reparenting.
4. Fragile: future code touching `view-fleet.firstChild` would hit `fleet-cards` instead of the nav.

**Root cause**: `renderFleetUnified()` and `renderCrewUnified()` in `static/app-monolith.js` both used `targetPanel.prepend(nav)` to insert the sub-nav into the active sub-panel, rather than keeping the sub-nav in a stable location and only toggling its visibility.

**Fix**:
- `templates/index.html`: Removed `<div id="fleet-sub-nav">` from inside `#view-fleet`. Added two persistent sub-nav bars (`#fleet-sub-nav` and `#crew-sub-nav-outer`) as direct children of `#main-content`, with class `subnav-bar` and `style="display:none"` by default.
- `static/style.css`: Changed `.view-panel` from `inset: 0` to `top: var(--subnav-bar-h); left:0; right:0; bottom:0;` so the view-panel is vertically offset by the sub-nav height when a sub-nav is visible. Added `.subnav-bar { position:absolute; top:0; left:0; right:0; z-index:5; background:var(--bg-base); }` so the sub-nav sits in the gap left by the offset view-panel.
- `static/app-monolith.js`:
  - `renderFleetUnified()`: No longer calls `targetPanel.prepend(nav)`. Updates `#fleet-sub-nav` innerHTML in place, sets `display:block`, hides `#crew-sub-nav-outer`, and sets `--subnav-bar-h` to `nav.offsetHeight`.
  - `renderCrewUnified()`: No longer creates/prepends `#crew-sub-nav-injected`. Updates the persistent `#crew-sub-nav-outer` in place, hides `#fleet-sub-nav`, and sets `--subnav-bar-h`.
  - `setTab()`: On non-fleet/non-crew tabs, hides both persistent sub-navs in addition to resetting `--subnav-bar-h` to `0px`.

**Verification**:
- Full pytest suite: 45/45 passing.
- JS syntax check (`node -c static/app-monolith.js`): passes.
- Smoke test of Flask app: `GET /` returns 200 with 117462 bytes; API endpoints `/api/productions/1/{boats,picture-boats,security-boats,helpers,guards}` all return 200 JSON arrays.
- Manual DOM reasoning: sub-nav is never moved; switching between Fleet > Boats / Picture Boats / Security Boats and Crew > Labor / Guards only mutates innerHTML of the persistent bar. View-panel top is offset by `--subnav-bar-h` so the content grid starts below the sub-nav. Layout grid heights (`#boats-layout`, `#pb-boats-layout`, `#sb-boats-layout`, `#lb-layout`, `#gc-layout`) already subtract `--subnav-bar-h`, so they keep their previous correct heights.

**Branch**: fix/2026-04-11-fleet-crew-subnav-stable
**Side effects**: None. The dead divs inside `#view-fleet` (`#fleet-cards`, `#fleet-schedule-container`, etc.) are untouched — they were not used by the current unified fleet flow and are left for potential future use.
**Next priority**: P1 — Picture Boats / Security Boats / Transport / Helpers / Guards empty list issues (investigate whether seeding logic is missing data or whether the data model splits boats incorrectly).

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
