# CHANGELOG — ShootLogix

## 2026-04-12 — [P1] Hide write controls (Add/Edit/Delete) from READER role across all modules

**Problem**: Users with READER role could see all Add, Edit, Delete, Import, Undo, and Groups buttons across every module (Boats, Picture Boats, Security Boats, Transport, Labour, Guards, FNB, Fuel, Locations, PDT). Clicking these buttons would open modals or trigger API calls that returned FORBIDDEN errors — confusing UX.

**Root cause**: The `_canEdit()` function existed but was only used in the Documents tab and the floating action button (FAB). The existing CSS rules in `style.css` covered some buttons via `[onclick*="add"]` pattern matching, but missed: CSV Import buttons (`openCsvImportModal`), Groups buttons, Auto-fill/Resync buttons, boat edit pencil buttons (`.boat-edit-btn`), and dynamically rendered buttons in FNB, Fuel, and Locations.

**Fix**:
- `templates/index.html`: Added `write-only` CSS class to 39 static toolbar buttons across PDT, Boats, Picture Boats, Security Boats, Transport, Labour, Guard Camp modules (Add, CSV Import, Function, Groups, Undo, Photo upload, Edit, Save, Delete buttons)
- `static/style.css`: Added CSS rule `body.role-reader .write-only, .card-delete-btn, .boat-edit-btn { display: none !important; }` to hide write controls
- `static/app-monolith.js`: Added `_canEdit()` guards to 10 dynamically rendered buttons in FNB (+ Category, + Item), Fuel (+ Add machinery, Edit/Delete machinery), and Locations (+ Add Location, Auto-fill, Resync, Import CSV). Made boat detail modal inputs readonly/disabled for READER. Made location name cells non-clickable for READER.

**Verification**:
- All 45 existing tests pass
- JS syntax validation passes (Node.js check)
- Backend RBAC enforcement still works (READER gets FORBIDDEN on API mutations)
- ADMIN/UNIT/TRANSPO roles see all controls (no `role-reader` class on body)
- READER role: write controls hidden, read/export/filter/navigation still functional

**Branch**: fix/2026-04-12-rbac-ui-hide-write-controls
**Side effects**: None — existing CSS rules for `role-reader` still apply; new rules are additive
**Next priority**: P1 — Form validation UX (show inline field errors, validate before submit) or P1 — FNB module items rendering with no data state

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
