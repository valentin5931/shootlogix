# ShootLogix Changelog

## 2026-03-22 — [P0] Fix Fleet, Crew, and Today tabs not loading

**Problem**: Clicking Fleet, Crew, or Today tabs in the navigation showed empty panels — no data loaded, no content rendered. These tabs were completely non-functional.

**Root cause**: The app loads `app-monolith.js` which defines the `setTab()` function, but this function had no handlers for `fleet`, `crew`, or `today` tabs. The newer `app.js` file (which handles these via lazy-loaded modules) is NOT loaded by `index.html`. When users clicked Fleet/Crew/Today, the view panel was shown (empty) but no data fetching or rendering occurred.

**Fix**: Added tab handlers directly in `app-monolith.js`:
- **Fleet tab**: Renders sub-navigation (Boats / Picture Boats / Security Boats) with filter pills. Loads and displays vessel cards from all three endpoints, filtered by selected sub-tab. Cards link to full individual module views.
- **Crew tab**: Implements `crewSetSubTab()` for Labour/Guards switching. Each sub-tab loads worker/guard data and renders summary cards with links to full views.
- **Today tab**: Fetches daily operations data from `/api/productions/:id/today` endpoint. Shows date navigation (prev/next/today/date picker) and renders all active resources (boats, picture boats, security boats, transport, labour, guards) grouped by section with counts and status badges.

**Files changed**: `static/app-monolith.js` (added ~200 lines)

**Verification**:
- All 45 existing tests pass
- JS syntax validation passes (node)
- Today API returns correct data (22 boats for 2026-03-22)
- Fleet/Crew/Today tabs now have functional handlers in setTab()
- New functions properly exposed in App return object

**Branch**: fix/2026-03-22-fleet-crew-today-tabs
**Side effects**: None — all existing tab handlers unchanged
**Next priority**: P0 — Verify all remaining tabs load data correctly (test full click-through), then P1 UX/UI anomalies
