# CHANGELOG — ShootLogix

## 2026-04-09 — [P0] Fleet/Crew sub-nav: replace DOM moving with static per-panel hosts

**Problem**: `renderFleetUnified()` and `renderCrewUnified()` used `targetPanel.prepend(nav)` to move a single sub-nav DOM node between view panels on every sub-tab switch. This was fragile: it caused layout shifts, relied on the node still being found via `$('fleet-sub-nav')` even after being relocated, and risked invalidating event handlers if the host panel was ever re-rendered. The crew version was worse — it created a detached `crew-sub-nav-injected` element and also kept a duplicate static `.crew-sub-nav` inside `view-crew` that was never shown.

**Root cause**: Both fleet and crew sub-navs tried to share one DOM node across multiple absolute-positioned view panels. Since each `.view-panel` fills `#main-content`, the sub-nav had to live inside the *currently active* panel — so the code moved it around.

**Fix**:
- `templates/index.html`:
  - Added `<div class="fleet-subnav-host"></div>` as the first child of `view-boats`, `view-picture-boats`, and `view-security-boats`.
  - Added `<div class="crew-subnav-host"></div>` as the first child of `view-labour` and `view-guards`.
  - Removed the now-unused `<div id="fleet-sub-nav"></div>` from `view-fleet`.
  - Removed the now-unused static `<div class="crew-sub-nav">` and associated buttons from `view-crew` (view-crew is never shown directly).
- `static/app-monolith.js`:
  - `renderFleetUnified()`: builds the sub-nav HTML as a string and writes it into `targetPanel.querySelector('.fleet-subnav-host')`. No DOM moving.
  - `renderCrewUnified()`: same pattern using `.crew-subnav-host`. Dropped the `crew-sub-nav-injected` element entirely.
  - `--subnav-bar-h` CSS var is still updated from the host's measured height so the existing layout height calculations keep working.

**Verification**:
- `node -c static/app-monolith.js` — JS syntax OK.
- `python -m pytest tests/` — 45/45 pass.
- Served index.html contains 3 `fleet-subnav-host` and 2 `crew-subnav-host` divs; the old `id="fleet-sub-nav"` is gone.
- All key API endpoints (`/boats`, `/picture-boats`, `/security-boats`, `/helpers`, `/guard-camp-workers`) return 200 with the running Flask server.

**Branch**: fix/2026-04-09-fleet-crew-subnav-static-hosts
**Side effects**: None. The rendered sub-nav HTML is identical (same button classes, same onclick handlers, same styling). Only the DOM ownership model changed.
**Next priority**: P1 data-population issues in ISSUES.md (picture_boats / security_boats / transport / helpers / fuel / guards tables are empty — users need to create data through the UI or via CSV import).

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
