# CHANGELOG — ShootLogix

## 2026-04-11 — [P0] Fix SQLite "database is locked" on every concurrent request

**Problem**: Every API request that happens to overlap with any other request failed with
`HTTP 500 — sqlite3.OperationalError: database is locked`. The browser app, which fires
many API calls in parallel (e.g. on project load), was reliably hitting this: loading the
Fleet/Boats/Transport/Budget/Fuel/Crew tabs left entire panels blank or showing
"Error: HTTP 500". In the browser-side JSDOM smoke test, 43 out of 45 fetches returned 500.

**Root cause**: `db_compat.py` used two contradictory journal modes on the **same**
`shootlogix.db` file:
- `get_db()` (main data routes) set `PRAGMA journal_mode=DELETE` on every connection.
- `get_auth_db()` (auth middleware, runs on every authenticated request) set
  `PRAGMA journal_mode=WAL` on every connection.

Because every authenticated request touches both code paths (auth check → data query),
SQLite was constantly asked to flip between WAL and DELETE. Switching journal modes
requires an **exclusive lock** on the database file, which fails whenever any other
connection is open, throwing `database is locked`. This was introduced in
`a77e95a [AXE8.1] Migration PostgreSQL: dual-backend SQLite/PostgreSQL avec fallback auto`
(2026-03-12) and had been silently breaking concurrent requests ever since.

**Fix**:
- `db_compat.py:337` — Changed `PRAGMA journal_mode=DELETE` to `PRAGMA journal_mode=WAL`
  in `get_db()` so both code paths use the same journal mode. WAL is also the
  recommended mode for concurrent reader/writer workloads like a Flask app.
- Added a comment explaining the invariant so this doesn't regress.

**Verification**:
- Serial 10 requests to `/api/productions/1/boats`: **10/10 → 200** (was 10/10 → 500).
- Parallel 20 requests to `/api/productions/1/boats`: **20/20 → 200**.
- Parallel 80 requests across 8 different endpoints (boats, picture-boats,
  security-boats, transport, helpers, guard-camp-workers, fnb, budget): **80/80 → 200**.
- Python stress test with 8 threads × 60 requests (480 total) across 12 endpoints:
  **480/480 → 200**, zero `database is locked` entries in the Flask log.
- Full pytest suite: **45/45 passed**.
- JSDOM smoke test loading the real `index.html` + all JS modules and clicking through
  every top-level tab and every fleet/crew sub-tab: **0 JS errors, 0 failed fetches**.

**Branch**: fix/2026-04-11-sqlite-journal-mode-lock
**Side effects**: SQLite will now run the data DB in WAL mode (producing `.db-wal` and
`.db-shm` sidecar files), matching what the auth DB already did. No schema changes. No
data changes. Deployments running on PostgreSQL (Railway production) are unaffected —
the Postgres branch of `get_db()` is untouched.
**Next priority**: After deploying this, re-run the diagnostic checklist in a real
browser: with the lock bug gone, the next highest-value items are likely the P1 empty
lists for Picture Boats / Security Boats / Transport / Helpers that may have been
masked by the 500s on initial load.

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
