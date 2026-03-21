# ShootLogix — Changelog

## 2026-03-21 — [P0] Fix Fleet, Today, Crew, Documents, Timeline tab navigation

**Problem**: Clicking Fleet, Today, Crew, Documents, and Timeline tabs showed blank content. The tabs had proper HTML panels and onclick handlers, but the monolith JS `setTab()` function had no handlers for these 5 tabs. The module files (`static/modules/fleet.js`, etc.) existed but were never loaded — only `app-monolith.js` is included in `index.html`.

**Root cause**: The HOTFIX that switched from `app.js` (skeleton with module loader) to `app-monolith.js` (self-contained monolith) didn't add setTab handlers for the 5 newer tabs: `fleet`, `today`, `crew`, `documents`, `timeline`. The monolith had no `window._SL` or `_loadModule` support, so the separate module files couldn't function.

**Fix**: Added setTab handlers and render functions directly in `app-monolith.js`:
- **Fleet tab**: Sub-navigation (Boats / Picture Boats / Security Boats) that delegates to existing per-module renders
- **Today tab**: Daily operations overview showing day info + active boat assignments for selected date
- **Crew tab**: Sub-navigation (Labour / Guards) delegating to existing Labour and Guards renders
- **Documents tab**: Placeholder with empty state
- **Timeline tab**: Placeholder with empty state
- Updated `TAB_LABELS` breadcrumb map for all new tabs
- Exposed new functions (`fleetSetSubTab`, `crewSetSubTab`, `renderTodayView`) in App return object

**Files changed**: `static/app-monolith.js` (+186 lines)

**Verification**:
- All 45 existing tests pass
- App starts without errors
- All API endpoints return proper data (32 PDT days, 46 boats, 14 vehicles, etc.)
- Fleet tab renders sub-nav and delegates to Boats/Picture Boats/Security Boats
- Crew tab renders sub-nav and delegates to Labour/Guards
- Today tab shows daily operations with date picker

**Branch**: fix/2026-03-21-fleet-crew-today-tab-navigation
**Side effects**: None
**Next priority**: P0 — Verify all tabs render data correctly in browser; P1 — UX audit of the 87 identified anomalies
