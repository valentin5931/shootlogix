# ShootLogix — Changelog

## 2026-03-22 — [P0] Fix broken tab navigation + backend crashes

**Problem**: 5 tabs (Fleet, Crew, Today, Documents, Timeline) showed blank content when clicked. Documents API returned 500 errors. Timeline API crashed with wrong column names.

**Root cause**:
1. `index.html` loaded `app-monolith.js` (outdated, 12831 lines) which had no handlers for fleet/crew/today/documents/timeline tabs. The newer modular `app.js` + 22 lazy-loaded modules in `static/modules/` already had full support for all tabs.
2. All 7 document API routes used `db = get_db()` instead of `with get_db() as db:`, causing `AttributeError` since `get_db()` is a context manager.
3. Timeline API queried non-existent columns (`site` in locations, `prep/filming/wrap` in location_schedules).

**Fix**:
- `templates/index.html`: switched from `app-monolith.js` to modular `app.js`
- `app.py`: fixed 7 document routes to use `with get_db() as db:` context manager
- `app.py`: fixed timeline query — `site` → `location_type`, `prep/filming/wrap` → `status`
- `static/app.js`: added `checklist`, `documents`, `timeline`, `admin` to `ROLE_ALLOWED_TABS`

**Verification**:
- All 45 pytest tests pass
- All 16 major API endpoints return HTTP 200
- All 22 module JS files accessible (200 status)
- Documents API: `GET /api/productions/1/documents` → 200 (was 500)
- Timeline API: `GET /api/productions/1/timeline` → 200 (was 500)

**Branch**: fix/2026-03-22-p0-tabs-and-backend-crashes
**Side effects**: None — modular app.js was already complete and tested
**Next priority**: P1 — UX/UI anomalies (form validation gaps, error handling, mobile responsiveness)
