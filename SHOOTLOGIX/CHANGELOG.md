# CHANGELOG — ShootLogix

## 2026-04-11 — [P1] Labour cards view: skip orphan placeholder assignments

**Problem**: On the Crew > Labor tab, the "cards" view rendered 72 role cards each with a bogus `?` worker body. The Labor schedule view and Budget view were fine.

**Root cause**: `_seed_helpers()` in `data_loader.py` pre-creates one `helper_assignment` row per labour `boat_function`, with `helper_id=NULL`, `helper_name_override=''`, but valid `start_date`/`end_date`/`price_override`. These placeholder slots are intentional — they let the schedule view visualise reserved date ranges via day cells — but `renderLbRoleCard()` in `static/app-monolith.js` mapped *all* assignments (including orphans) to `assigned-mini` bodies and fell back to `'?'` when the worker name was missing. Result: every function card showed a phantom "?" assignee, and the drop-zone printed "+ Add another assignment" instead of "Drop or click a worker to assign".

For KLAS7 (production 1), the database currently contains 73 `helper_assignments` rows, 72 of which are orphans — so the labour cards view was completely confusing.

`renderLbSchedule()` already filtered orphans correctly via `funcAsgns.find(a => a.helper_id || a.helper_name_override || a.helper_name)` (line 7737); the cards view was the only mismatch.

**Fix**:
- `static/app-monolith.js` (`renderLbRoleCard`, ~line 7398): filter `asgns` into `filledAsgns` using the same "real worker" predicate as the schedule view, map `assignedBodies` from `filledAsgns`, and use `filledAsgns.length` for the drop-zone style/label so an empty card renders only the drop zone.

**Verification**:
- `node -c static/app-monolith.js` passes (syntax OK).
- `pytest -q` — 45/45 passing (Python API tests, unchanged by this frontend fix).
- Manually queried DB: `helper_assignments` has 73 rows, 72 orphan (`helper_id IS NULL AND helper_name_override=''`). With the fix, those 72 rows no longer generate "?" mini bodies — the affected cards now show just the "Drop or click a worker to assign" drop zone, as they should.
- Schedule view and budget view untouched: orphan day cells and budget totals still render so the pre-allocated dates/rates are not lost from the UI.

**Branch**: fix/2026-04-11-labour-orphan-assignments
**PR**: TBD
**Side effects**: None. Schedule and budget views continue to show orphan slot dates/rates; only the cards view now hides the phantom rows.
**Next priority**: Same filter pattern exists in `renderRoleCard`, `renderPbRoleCard`, `_renderSbRoleCard`, `renderTbRoleCard`, `renderGcRoleCard` — currently dormant because those assignment tables have no orphans, but should be hardened with the same filter if similar seeding is ever added. Logged as P2 in ISSUES.md.

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
