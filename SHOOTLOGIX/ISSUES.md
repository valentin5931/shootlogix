# ISSUES — ShootLogix Known Issues

## [P0] Fleet sub-tab rendering in containers — FIXED 2026-03-22
- **Discovered**: 2026-03-22
- **Status**: Fixed in fix/2026-03-22-fleet-crew-tab-handlers
- **Symptoms**: Fleet, Crew, Today, Documents, Timeline tabs showed blank panels
- **Root cause**: Missing setTab() handlers in app-monolith.js
- **Files involved**: static/app-monolith.js
- **Estimated effort**: Quick fix

## [P1] _esc() undefined in checklist rendering
- **Discovered**: 2026-03-22
- **Symptoms**: Checklist tab may throw JS error — uses `_esc()` but function is named `esc()`
- **Likely cause**: Copy-paste from a different context
- **Files involved**: static/app-monolith.js line ~12666
- **Estimated effort**: Quick fix (rename `_esc` to `esc`)

## [P1] Dashboard tab hidden in topbar
- **Discovered**: 2026-03-22
- **Symptoms**: Dashboard tab button has `style="display:none"` in index.html (line 89), not accessible from desktop topbar
- **Likely cause**: Design decision or oversight during refactor
- **Files involved**: templates/index.html line 89
- **Estimated effort**: Quick fix

## [P1] Today tab has no data-fetching — relies on pre-loaded shootingDays
- **Discovered**: 2026-03-22
- **Symptoms**: Today tab shows schedule data only if shootingDays were already loaded by PDT tab
- **Likely cause**: Today was designed as a module that fetches its own data, but monolith version reuses state
- **Files involved**: static/app-monolith.js, static/modules/today.js
- **Estimated effort**: Medium (should fetch data if not already loaded)

## [P1] Modular app.js not functional — only monolith works
- **Discovered**: 2026-03-22
- **Symptoms**: app.js (2509 lines) is a modular loader that imports from static/modules/, but templates load app-monolith.js instead
- **Likely cause**: Module system was work-in-progress, monolith kept as fallback
- **Files involved**: static/app.js, static/modules/*, templates/index.html
- **Estimated effort**: Large refactor (not recommended to change)

## [P2] Picture boats and security boats return empty arrays
- **Discovered**: 2026-03-22
- **Symptoms**: /api/productions/1/picture-boats and /api/productions/1/security-boats return empty []
- **Likely cause**: No picture boats or security boats seeded in database (boats all have category="picture")
- **Files involved**: database.py, data_loader.py
- **Estimated effort**: Data issue, not code bug
