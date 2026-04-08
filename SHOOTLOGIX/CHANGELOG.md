# CHANGELOG — ShootLogix

## 2026-04-08 — [P1] Fix stale state-variable names in `_findAssignment` and picture-boats refresh handler

**Problem**:
1. `_findAssignment(assignmentId)` in `static/app-monolith.js` iterated over `state.pbAssignments`, `state.sbAssignments`, and `state.helperAssignments` — none of which exist. The canonical state arrays are `state.pictureAssignments`, `state.securityAssignments`, and `state.labourAssignments`. Result: when a user multi-selected schedule cells covering picture-boat, security-boat or labour assignments and tried to set/clear a day override status, `_findAssignment()` returned `null` and the override silently failed.
2. The Picture Boats tab refresh handler (single-line `else if (tab === 'picture-boats')` block at the bottom of `static/app-monolith.js`) wrote the freshly-fetched functions and assignments into `state.pbFunctions` and `state.pbAssignments` — orphan state slots that nothing reads — instead of into `state.pictureFunctions` and `state.pictureAssignments`. Result: clicking the refresh button on Picture Boats kept rendering stale function/assignment data.

**Root cause**: Two separate naming-convention typos that crept in over the course of refactors. The canonical state slots use the long form (`pictureAssignments`, `securityAssignments`, `labourAssignments`); a few call sites still used the short form (`pbAssignments`, `sbAssignments`, `helperAssignments`) that was either never declared or renamed. Because JS silently returns `undefined` for missing object keys, both bugs were silent failures.

**Fix**:
- `static/app-monolith.js` `_findAssignment()` (around line 3522): replaced `state.pbAssignments`, `state.sbAssignments`, `state.helperAssignments` with the canonical `state.pictureAssignments`, `state.securityAssignments`, `state.labourAssignments`.
- `static/app-monolith.js` picture-boats refresh handler (around line 13004): replaced `state.pbFunctions=f; state.pbAssignments=a;` with `state.pictureFunctions=f; state.pictureAssignments=a;`.

**Verification**:
- `node --check static/app-monolith.js` passes.
- Full pytest suite (45 tests) passes.
- Grep confirms no remaining `state.pbAssignments`, `state.sbAssignments`, `state.pbFunctions`, or `state.helperAssignments` references in `static/app-monolith.js`.

**Branch**: `fix/2026-04-08-state-name-typos`
**PR**: TBD
**Side effects**: None — both bugs were silent failures, so the fix only restores intended behaviour.
**Next priority**: Picture Boats and Security Boats lists are empty (P1 in ISSUES.md) — investigate whether the legacy `boats` table data should be migrated to `picture_boats` on bootstrap, or whether the architecture intentionally requires user-driven population.

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
