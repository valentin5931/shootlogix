# CHANGELOG — ShootLogix

## 2026-04-09 — [P0] Fix daily checklist first-generate returning null

**Problem**: Clicking "Generate" on the Daily Checklist tab for a new date returned HTTP 201 with a body of `null`. The UI treated the `null` response as "no items" and showed the empty-state message, even though the checklist items were actually inserted into the database. A second click would then display them correctly.

**Root cause**: `generate_daily_checklist()` in `database.py` opens a write transaction via `with get_db() as conn:`, performs all the INSERTs, and then returns `get_daily_checklist(prod_id, date)` — *while still inside the outer transaction*. `get_daily_checklist()` opens a *new* SQLite connection, which in DELETE journal mode cannot see the uncommitted writes from the outer connection. On a brand-new date, the `daily_checklists` row therefore didn't exist in the read snapshot and the function returned `None`. On the second call, the first call's writes had already committed, so it worked — hiding the bug from casual testing.

**Fix**: `database.py` — inlined the readback inside the same `conn` used for the writes. No new connection, no transaction isolation issue. The returned dict is assembled from the rows we just wrote. Also added a comment explaining why a fresh `get_db()` call here would be wrong.

**Verification**:
- `POST /api/productions/1/checklists/generate?date=2026-04-15` (brand-new date) now returns the full checklist payload with all items on the first call (previously returned `null`).
- `POST /api/productions/1/checklists/generate?date=2026-04-16` (second brand-new date) — same, works on first call.
- `GET /api/productions/1/checklists?date=2026-04-15` still returns the same data (no regression on read path).
- All 45 existing tests pass (`pytest tests/`).

**Branch**: fix/2026-04-09-checklist-first-generate-returns-null
**Side effects**: None — the return value is identical to what `get_daily_checklist()` would have returned, just read within the same connection.
**Next priority**: Audit other `database.py` helpers that `return another_helper(...)` from inside an active `with get_db()` block (ripgrep confirmed only this one existed for the checklist helper, but a broader audit is worth one session). After that, the remaining P1 items from ISSUES.md (empty picture-boats/security-boats/transport/helpers/fuel/guards seed data).

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
