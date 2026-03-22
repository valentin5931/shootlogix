# ISSUES — ShootLogix Known Issues

## [P0] Fleet/Crew/Today tabs not rendering (FIXED — PR #6)
- **Discovered**: 2026-03-22
- **Symptoms**: Clicking Fleet, Crew, Today, Documents, Timeline tabs shows empty panel
- **Cause**: index.html loaded outdated app-monolith.js missing tab handlers
- **Fix**: Switched to modular app.js
- **Status**: Fixed in PR #6

## [P1] app-monolith.js still present in static/
- **Discovered**: 2026-03-22
- **Symptoms**: No user-facing issue, but unused 600KB file adds to repo size
- **Likely cause**: Legacy file from before AXE 8.2 module split
- **Files involved**: `static/app-monolith.js`
- **Estimated effort**: Quick fix (delete file, verify nothing references it functionally)

## [P1] Service Worker (sw.js) caching strategy unknown
- **Discovered**: 2026-03-22
- **Symptoms**: app.js registers a service worker; unclear if it properly cache-busts when modules update
- **Likely cause**: May serve stale cached app-monolith.js to returning users
- **Files involved**: `static/sw.js`, `static/app.js`
- **Estimated effort**: Medium — review SW caching strategy, ensure module updates are picked up

## [P1] No helpers/workers found in labour tab
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/helpers` returns empty array `[]`
- **Likely cause**: No helper/worker data seeded or populated yet
- **Files involved**: `app.py` (helpers endpoints), `database.py`
- **Estimated effort**: Quick investigation — check if data exists or if it's expected to be empty

## [P1] Verify all tabs render data correctly after modular switch
- **Discovered**: 2026-03-22
- **Symptoms**: Need browser testing to confirm each module renders properly
- **Likely cause**: Potential subtle differences between monolith and modular code paths
- **Files involved**: `static/app.js`, `static/modules/*.js`
- **Estimated effort**: Medium (browser testing + fixes)

## [P1] /data directory does not exist warning on startup
- **Discovered**: 2026-03-22
- **Symptoms**: Log shows "ShootLogix: /data directory does NOT exist!" on every startup
- **Likely cause**: Railway deployment expects /data mount but local dev doesn't have it
- **Files involved**: `app.py` (startup code)
- **Estimated effort**: Quick fix (create dir or suppress warning in dev mode)
