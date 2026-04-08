# CHANGELOG — ShootLogix

## 2026-04-08 — [P0] Stabilize Fleet/Crew sub-nav (stop moving it between view panels)

**Problem**: The Fleet sub-nav (`#fleet-sub-nav`) lived inside `#view-fleet` and was moved via `prepend()` into `view-boats`, `view-picture-boats`, or `view-security-boats` on every sub-tab switch. The Crew sub-nav worked the same way via an on-the-fly `crew-sub-nav-injected` element. Each click detached the sub-nav from one panel and re-attached it to another, causing layout thrash, race conditions on `offsetHeight` measurement, and a fragile coupling between a navigation element and the content panels it controls.

**Root cause**: `renderFleetUnified()` and `renderCrewUnified()` in `static/app-monolith.js` treated the sub-nav as content that belonged inside the currently active panel, so they had to move the DOM node on every sub-tab switch.

**Fix**:
- `templates/index.html`: Moved `#fleet-sub-nav` out of `#view-fleet` to be a direct child of `#main-content` (sibling of all view panels). Added matching `#crew-sub-nav` sibling. Removed the inline `.crew-sub-nav` bar from inside `#view-crew`.
- `static/style.css`: Added `.fleet-crew-sub-nav` rule that absolutely positions the bar at top of `#main-content`, hidden by default, shown via `.active` class. Added `#main-content.has-sub-nav > .view-panel.active` rule that adds `padding-top: calc(1.25rem + var(--subnav-bar-h))` so panel content never renders under the sub-nav. Layout div heights already use `calc(... - var(--subnav-bar-h))` and remain correct.
- `static/app-monolith.js`: `renderFleetUnified()` and `renderCrewUnified()` now render into the stable sub-nav element instead of moving it. They toggle `.active` on the correct bar, add `has-sub-nav` to `#main-content`, and measure height inside `requestAnimationFrame()` to avoid layout-race bugs. `setTab()` clears both bars and the `has-sub-nav` class when leaving fleet/crew.

**Verification**:
- JS syntax check (`node -c`) passes.
- All 18 relevant pytest tests pass (`test_health`, `test_boats`, `test_picture_boats`, `test_security_boats`, `test_labour`, `test_guards`, `test_e2e_smoke`).
- Manual verification via curl: rendered HTML places `#fleet-sub-nav` and `#crew-sub-nav` at positions outside `#view-fleet` and `#view-crew`.
- App boots cleanly; API endpoints (`/api/productions/1/boats`, `/picture-boats`, `/security-boats`, `/helpers`, `/guards`, `/guard-posts`, `/boat-functions`) all return 200.

**Branch**: fix/2026-04-08-fleet-crew-subnav-stability
**Side effects**: None. The sub-nav no longer has a `border-bottom` inline on the inner div (CSS handles it on the outer container). Visually identical.
**Next priority**: P1 — investigate why Picture Boats, Security Boats, Transport, Helpers, Fuel, Guards lists are empty despite endpoints returning 200. Data seeding likely needs to populate these tables (see ISSUES.md).

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
