# ShootLogix — Known Issues

## [P0] Modal/form submission may fail silently
- **Discovered**: 2026-03-22
- **Symptoms**: Creating or editing entities from the Fleet/Crew unified views may not work since they link to detail tabs rather than having inline forms
- **Likely cause**: The unified tab views (Fleet, Crew) show summary cards that navigate to individual tabs for editing — this is by design but could confuse users
- **Files involved**: `static/app-monolith.js` (fleet/crew render functions)
- **Estimated effort**: Medium — could add inline create/edit modals to unified views

## [P1] Fleet unified view lacks schedule and budget sub-views
- **Discovered**: 2026-03-22
- **Symptoms**: The Fleet panel HTML has `fleet-schedule-container` and `fleet-budget-container` divs but they are not populated
- **Likely cause**: Only the card grid view was implemented; schedule/budget views need cross-vessel aggregation
- **Files involved**: `static/app-monolith.js`, `templates/index.html`
- **Estimated effort**: Medium

## [P1] Crew unified view shows basic card summaries only
- **Discovered**: 2026-03-22
- **Symptoms**: Labour and Guards panels in the Crew tab show simple card lists rather than the full schedule/assignment views available in dedicated tabs
- **Likely cause**: Crew tab was designed as an overview; full functionality requires the dedicated Labour/Guards tabs
- **Files involved**: `static/app-monolith.js`
- **Estimated effort**: Medium — could embed the full schedule views

## [P1] Multiple duplicate fix branches on remote
- **Discovered**: 2026-03-22
- **Symptoms**: Several branches with similar names exist on remote: `fix/2026-03-21-fleet-crew-tab-navigation`, `fix/2026-03-21-missing-tab-handlers`, `fix/2026-03-22-fleet-today-crew-tabs`, etc.
- **Likely cause**: Multiple automated sessions attempted the same fix
- **Files involved**: Git branches
- **Estimated effort**: Quick fix — clean up stale branches after merging the correct PR
