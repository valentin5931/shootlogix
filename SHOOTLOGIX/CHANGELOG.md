# ShootLogix — Changelog

## 2026-03-22 — [P0] Fix 5 broken navigation tabs

**Problem**: Fleet, Crew, Today, Documents, and Timeline tabs in the navigation bar were dead — clicking them showed empty panels with no data loaded.

**Root cause**: `setTab()` in `app-monolith.js` had no handler for these 5 tab names. The HTML buttons called `App.setTab('fleet')` etc., but the function only handled individual module tabs (boats, picture-boats, etc.), not the unified parent tabs.

**Fix**: Added tab handlers and render functions in `app-monolith.js`:
- `_renderFleetTab()` — unified fleet view with boats/picture/security sub-tabs
- `_renderCrewTab()` — unified crew view with labour/guards sub-tabs
- `_renderTodayTab()` — today's shooting day + active resources from `/api/productions/:id/today`
- `_renderDocumentsTab()` — document list from `/api/productions/:id/documents`
- Timeline tab connected to existing `Timeline.init()` from `timeline.js`

**Verification**: All 45 tests pass. Tab clicks now load data and render content.

**Branch**: fix/2026-03-22-p0-five-broken-tabs
**PR**: #8
**Side effects**: None
**Next priority**: Remaining P0 issues — verify all data renders correctly in each tab; check for JS console errors on tab interactions
