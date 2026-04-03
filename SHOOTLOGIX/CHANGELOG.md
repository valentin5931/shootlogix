# CHANGELOG — ShootLogix

## 2026-04-03 — [P0] Fix 25 missing function exports in app-monolith.js

**Problem**: 25 functions referenced via `App.xxx()` onclick handlers in `index.html` were never defined or exported in `app-monolith.js`. They existed only in dead module files (`static/modules/*.js`, `static/app.js`) that are never loaded by the HTML template. This caused silent failures when users clicked buttons — nothing happened, no error feedback.

**Root cause**: When the app was consolidated into `app-monolith.js`, these 25 functions were missed during the port. The old modular files relied on `window._SL` which doesn't exist in the monolith architecture.

**Fix**: Ported all 25 functions from the dead modules into `app-monolith.js` and added them to the return/export object:
- `toggleMobileMenu` — hamburger menu on mobile (P0: ALL mobile navigation was broken)
- `saveFunction` — create/edit boat functions (enhanced version supporting both create and update)
- `closeExportDateModal`, `confirmExportDate`, `exportDateShortcut` — export date range modal
- `toggleActivityPanel`, `closeActivityPanel`, `loadActivity`, `loadMoreActivity` — activity history
- `toggleNotifPanel`, `closeNotifPanel`, `markAllNotificationsRead` — notifications panel
- `closeCommentsPanel`, `submitComment`, `deleteComment`, `handleCommentKeydown`, `openCommentsPanel` — comments
- `onPriceOverrideChange` — price override field in assignment modal
- `autoFillTides` — tide auto-fill for shooting days
- `_toggleFabMenu`, `_fabCtxAction` — FAB context menu
- `adminPermLoadMembers`, `adminPermLoadPerms`, `adminShowSaveTemplate` — admin permissions
- `adminEpLoadPerms`, `adminEpAdd`, `adminEpDelete` — admin entity permissions
- `adminLoadAccessLogs`, `adminExportAccessLogs` — admin access logs

**Verification**: 
- All 163 `App.xxx()` calls from HTML now have matching exports (was 138/163)
- JS syntax check passes (`node --check`)
- All 45 Python tests pass
- App starts and serves correctly

**Branch**: fix/2026-04-03-missing-function-exports
**Side effects**: None — only additions, no existing code modified
**Next priority**: P1 UX issues — inconsistent use of native `confirm()` vs custom `showConfirm()` in 5 places; verify all admin panel features work end-to-end

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
