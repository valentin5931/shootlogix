# CHANGELOG — ShootLogix

## 2026-04-08 — [P0] Fix path traversal + missing access control in document download

**Problem**: `GET /api/documents/download/<path:filepath>` built the served
file path with `os.path.join(os.path.dirname(__file__), filepath)` and passed
the result straight to `send_file`, with no validation that the resolved path
stayed inside `data/documents/`. Any authenticated user could therefore
download arbitrary files readable by the Flask process, e.g.
`GET /api/documents/download/../app.py`,
`GET /api/documents/download/../.env`, or the SQLite database itself.
Additionally, there was no per-production access check: a user who is a member
of production 1 could download documents belonging to production 2 by guessing
the path.

**Root cause**: The handler trusted the `<path:filepath>` URL parameter. `..`
segments are resolved by the filesystem, so `os.path.isfile` and `send_file`
happily followed traversal sequences. And because the endpoint lives under
`/api/documents/...` (not `/api/productions/<id>/...`), the global
`before_request` hook only enforced authentication — it never checked that the
current user was a member of the production whose file was being served.

**Fix**:
- `app.py` `api_download_document`: resolve `base_dir` and `requested` with
  `os.path.realpath`, and reject anything that is not inside `data/documents/`
  with 403. Parse the production id out of the validated relative path
  (`data/documents/<prod_id>/…`) and, for non-admin users, verify
  `get_membership(g.user_id, prod_id)` is not None before serving the file.
  Preserves the legitimate download flow used by the Documents tab.
- `tests/test_document_download_security.py` (new): 6 tests covering the
  legit download path, missing files, traversal via `../app.py`, deep
  traversal via `../../../../etc/passwd`, traversal that starts from inside
  `data/documents/`, and the unauthenticated case.

**Verification**:
- `pytest tests/` — 51 passed (45 existing + 6 new).
- Confirmed the vulnerability on the unpatched code: the two traversal tests
  returned **200 OK** with the contents of `app.py` and `/etc/passwd` before
  the fix, and are rejected with 403/404 after.
- Legit downloads (`data/documents/<prod_id>/<file>`) still succeed with 200.

**Branch**: fix/2026-04-08-document-download-path-traversal
**Side effects**: Non-admin users who could previously download documents
belonging to productions they are not members of can no longer do so. This is
the intended behaviour and matches the project isolation rules documented in
`SECURITY.md`.
**Next priority**: `api_upload_picture_boat_image` /
`api_upload_security_boat_image` accept any user-supplied extension — consider
whitelisting image extensions to avoid uploading `.html`/`.svg` that render as
HTML from `/static/uploads/`. Also: the picture-boats and security-boats lists
are still empty in production (existing P1 in ISSUES.md).

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
