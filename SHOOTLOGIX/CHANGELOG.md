# CHANGELOG — ShootLogix

## 2026-04-15 — [P0] Stabilize Fleet/Crew sub-nav position (no more DOM moves between panels)

**Problem**: Every time the user switched Fleet sub-tabs (Boats/Picture Boats/Security Boats) or Crew sub-tabs (Labor/Guards), the sub-nav element was physically moved between view panels via `prepend()`. This caused layout shifts/reflows on every switch and left two duplicate crew sub-navs in the DOM (one static in `view-crew`, one dynamically created as `crew-sub-nav-injected`). The architecture was fragile and was logged as the top P0 issue in ISSUES.md.

**Root cause**:
- `#fleet-sub-nav` lived inside `#view-fleet`; `renderFleetUnified()` moved it via `targetPanel.prepend(nav)` into whichever sub-panel was active.
- `renderCrewUnified()` created a separate floating `#crew-sub-nav-injected` div and prepended it into the active crew sub-panel, while a duplicate static crew sub-nav also existed in `templates/index.html` inside `view-crew`.
- Height compensation via `--subnav-bar-h` was recomputed after every move — any layout change in the target panel could desync it.

**Fix**:
- `templates/index.html`: Added a single `#sub-nav-bar` container as the first child of `#main-content` (outside all `.view-panel` elements). Removed the in-panel `#fleet-sub-nav` from `#view-fleet` and the duplicate static crew sub-nav from `#view-crew`.
- `static/style.css`: Gave `#sub-nav-bar` absolute positioning at the top of `#main-content` with a higher z-index. Changed `.view-panel` from `inset: 0` to `top: var(--subnav-bar-h); right:0; bottom:0; left:0;` so panels sit below the bar without covering it.
- `static/app-monolith.js`: `renderFleetUnified()` and `renderCrewUnified()` now rewrite `#sub-nav-bar`'s innerHTML in place (no DOM move) and set `--subnav-bar-h` from `bar.offsetHeight`. `setTab()` hides and clears `#sub-nav-bar` when switching to any non-fleet/non-crew tab.

**Verification**:
- `node -c static/app-monolith.js`: passes.
- `python -m pytest tests/`: 45/45 passing.
- Rendered `/` HTML contains exactly one `#sub-nav-bar` (outside panels); no stale `fleet-sub-nav` or in-panel `crew-sub-nav` references remain.
- API smoke test through authenticated `ADMIN` session: `/api/productions/1/boats`, `/transport`, `/locations` all return 200.

**Branch**: fix/2026-04-15-subnav-stable-position
**Side effects**: None. Panel content area is unchanged because the `100vh - 48px - 2.5rem - var(--subnav-bar-h)` formula on `#boats-layout`, `#pb-boats-layout`, `#sb-boats-layout`, `#lb-layout`, `#gc-layout` continues to work — the panels themselves are simply offset by the same variable now.
**Next priority**: Seed/backfill the Picture Boats and Security Boats tables (P1 from ISSUES.md), or delete the dead `static/modules/*.js` files (P2).

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
