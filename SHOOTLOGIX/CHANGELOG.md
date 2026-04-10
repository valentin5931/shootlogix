# CHANGELOG — ShootLogix

## 2026-04-10 — [P1] Implement 25 missing onclick handler functions

**Problem**: 25 functions referenced by onclick/onchange handlers in `index.html` were never implemented in `app-monolith.js`, causing JavaScript errors when users interacted with: mobile menu, notification bell, activity panel, comments panel, export date modal, "Create function" button, tide auto-fill, FAB context menu, price override field, and several admin sub-panels.

**Root cause**: HTML templates were wired up with `App.xxx()` calls, but the corresponding JS functions were never defined or exported. This appears to be from features added to the HTML during UI design but whose JS implementations were never completed.

**Fix** (`static/app-monolith.js`):
- **Mobile**: `toggleMobileMenu()` — toggles `#mobile-menu` visibility
- **Notifications**: `toggleNotifPanel()`, `closeNotifPanel()`, `markAllNotificationsRead()`, `_onNotifClick()` — full notification panel with API integration (`/api/notifications`)
- **Activity**: `toggleActivityPanel()`, `closeActivityPanel()`, `loadActivity()`, `loadMoreActivity()` — activity timeline with filters and pagination via `/api/productions/:id/history`
- **Comments**: `closeCommentsPanel()`, `submitComment()`, `handleCommentKeydown()` — comment submission with Enter key support via `/api/productions/:id/comments`
- **Export Date Modal**: `closeExportDateModal()`, `exportDateShortcut()`, `confirmExportDate()` — date range presets (this week, last week, all)
- **Create Function**: `saveFunction()` — alias for existing `createFunction()` (name mismatch fix)
- **Tides**: `autoFillTides()` — fetches tide data from `/api/tides` and updates shooting days
- **FAB**: `_toggleFabMenu()` — handles right-click/long-press on floating action button
- **Price Override**: `onPriceOverrideChange()` — shows/hides override reason field
- **Admin Templates**: `adminShowSaveTemplate()`, `_adminDeleteTemplate()` — save/delete production templates via `/api/admin/templates`
- **Admin Entity Permissions**: `adminEpLoadPerms()`, `adminEpAdd()`, `_adminEpRemove()` — CRUD for entity-level permissions via `/api/admin/users/:id/entity-permissions`
- **Admin Permissions**: `adminPermLoadMembers()`, `adminPermLoadPerms()` — load project members and their module permissions
- **Admin Access Logs**: `adminLoadAccessLogs()`, `adminExportAccessLogs()` — view and export access logs via `/api/admin/access-logs`

All 25 functions added to the public API exports.

**Verification**:
- JS syntax check passes (`node --check`)
- All 163 `App.xxx()` references in HTML now have matching exported functions
- API endpoints return correct responses (notifications, history, comments, templates)
- No regressions on existing tab navigation, CRUD, or export functionality

**Branch**: fix/2026-04-10-missing-onclick-handlers
**Side effects**: None
**Next priority**: Fix `auth_users` table reference in admin access-logs endpoint (backend bug); remaining P1 empty data issues (picture boats, security boats, helpers, guards)

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
