# CHANGELOG — ShootLogix

## 2026-04-06 — [P1] Fix broken mobile menu, activity panel, notifications panel, and comments panel

**Problem**: Tapping the hamburger menu on mobile threw a JS error (`App.toggleMobileMenu is not a function`), making the app completely un-navigable on mobile devices. The Activity Timeline button, Notifications bell, and Comments panel all had the same issue — their handler functions were defined in `static/modules/*.js` files that were never loaded by `index.html`.

**Root cause**: The module files (`activity.js`, `notifications.js`, `comments.js`) in `static/modules/` were written for a `window._SL` module-loading system that was never implemented in the monolith architecture. They patched `App.*` properties at load time, but since the files were never loaded, `App.toggleMobileMenu`, `App.toggleActivityPanel`, `App.toggleNotifPanel`, `App.openCommentsPanel` etc. were all `undefined`.

**Fix**:
- `static/app-monolith.js`: Added all missing functions directly inside the App IIFE:
  - `toggleMobileMenu()` — toggles `#mobile-menu` hidden class
  - `toggleActivityPanel()`, `closeActivityPanel()`, `loadActivity()` — full activity timeline panel with date grouping, filters, and API integration
  - `toggleNotifPanel()`, `closeNotifPanel()`, `clickNotification()`, `markAllNotificationsRead()` — notifications panel with badge count and read state
  - `openCommentsPanel()`, `closeCommentsPanel()`, `submitComment()`, `deleteComment()`, `handleCommentKeydown()` — contextual comments panel
  - All functions exported in the `return {}` block

**Verification**:
- Mobile menu opens/closes correctly (burger button, backdrop click, close button, menu item click)
- Activity panel opens with filter controls, loads history from API
- Notification panel opens, displays notifications, supports mark-as-read
- Comments panel opens for entity contexts, supports add/delete
- All existing tabs still work (no regressions)
- JS brace/paren/bracket balance verified
- All API endpoints return 200

**Branch**: fix/2026-04-06-missing-mobile-menu-and-panel-functions
**Side effects**: None
**Next priority**: P1 — Empty picture_boats/security_boats tables (data model investigation)

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
