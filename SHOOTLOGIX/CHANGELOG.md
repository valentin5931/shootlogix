# ShootLogix Changelog

## 2026-03-22 — [P0] Fix Fleet, Today, and Crew tab navigation — dead tabs with no JS handlers

**Problem**: Clicking "Fleet", "Today", or "Crew" in the top navigation bar showed a blank panel. Users could not access Boats, Picture Boats, Security Boats, Labor, or Guards through the main navigation.

**Root cause**: The HTML template (`index.html`) defines `fleet`, `today`, and `crew` as visible top-bar tabs with `onclick="App.setTab('fleet')"` etc., but the `setTab()` function in `app-monolith.js` had no handlers for these tab names. The individual sub-modules (boats, picture-boats, security-boats, labour, guards) had their own tab buttons in the HTML, but they were hidden (`style="display:none"`), making them unreachable.

**Fix**: Added handlers for `fleet`, `today`, and `crew` in `setTab()`:
- **Fleet**: acts as a parent tab with sub-navigation (Boats / Picture Boats / Security Boats). Clicking Fleet defaults to Boats view, with a sub-nav bar injected at the top of the active panel.
- **Crew**: acts as a parent tab with sub-navigation (Labor / Guards). Same pattern — defaults to Labor with injected sub-nav.
- **Today**: renders a "Today's shooting day" summary view showing the current day's schedule, location, events.

Files changed:
- `static/app-monolith.js` — added `_renderFleetSubNav`, `fleetSetSubTab`, `_renderCrewSubNav`, `crewSetSubTab`, `_renderToday` functions; updated `setTab()` with fleet/crew/today handlers; added labels to `TAB_LABELS`; exported new functions.

**Verification**: All 45 existing tests pass. App starts without errors. All API endpoints return 200.

**Branch**: fix/2026-03-22-fleet-today-crew-tabs
**PR**: pending
**Side effects**: None — all existing tab handlers unchanged; only new handlers added
**Next priority**: P1 — UX/UI anomalies (form validation, error handling, mobile responsiveness)
