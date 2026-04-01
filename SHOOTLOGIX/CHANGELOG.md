# CHANGELOG — ShootLogix

## 2026-04-01 — [P0] Implement 25 missing UI functions causing JS errors on click

**Problem**: 25 functions called from `index.html` via `App.xxx()` were never implemented in `app-monolith.js`. Clicking the notification bell, mobile burger menu, activity panel, comment submit, create function confirm, export date modal, auto-fill tides, and several admin features all threw `App.xxx is not a function` errors. These functions existed in dead module files (`static/modules/`) that are never loaded.

**Root cause**: When the app was migrated from a modular architecture to the monolith (`app-monolith.js`), these 25 functions were never ported over. The HTML template still referenced them via `onclick="App.xxx()"`.

**Fix** (`static/app-monolith.js`):
Added all 25 missing functions and exported them:
- **Mobile**: `toggleMobileMenu` — burger menu was completely broken on mobile
- **Notifications**: `toggleNotifPanel`, `closeNotifPanel`, `markAllNotificationsRead` — bell icon was broken
- **Activity panel**: `toggleActivityPanel`, `closeActivityPanel`, `loadActivity`, `loadMoreActivity` — history panel was broken
- **Comments**: `submitComment`, `closeCommentsPanel`, `handleCommentKeydown` — contextual comments were broken
- **PDT**: `autoFillTides` — tide auto-fill button was broken
- **Functions**: `saveFunction` — create/edit function modal confirm button was broken
- **Export dates**: `closeExportDateModal`, `confirmExportDate`, `exportDateShortcut` — date range export was broken
- **Price override**: `onPriceOverrideChange` — price override input handler was missing
- **FAB**: `_toggleFabMenu` — floating action button context menu was broken
- **Admin** (7 functions): `adminEpLoadPerms`, `adminEpAdd`, `adminLoadAccessLogs`, `adminExportAccessLogs`, `adminPermLoadMembers`, `adminPermLoadPerms`, `adminShowSaveTemplate`

**Verification**:
- JS syntax check passes (`node --check`)
- All 25 functions now appear in the monolith's export block
- No HTML `App.xxx()` calls remain unmatched
- All existing API endpoints still respond correctly (no regressions)

**Branch**: fix/2026-04-01-missing-monolith-functions
**Side effects**: None
**Next priority**: P1 — Picture boats and security boats tables are empty (data model investigation)

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
