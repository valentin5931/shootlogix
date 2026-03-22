# ISSUES — ShootLogix Known Issues

## [P0] Today, Documents, and Timeline tabs have no handlers in monolith
- **Discovered**: 2026-03-22
- **Symptoms**: Clicking "Today", "Documents", or "Timeline" tabs shows empty panels
- **Likely cause**: `setTab()` in `app-monolith.js` has no render logic for these tabs. The modular `app.js` handles them via dynamically loaded modules (`today.js`, `documents.js`, `timeline.js` in `/static/modules/`)
- **Files involved**: `static/app-monolith.js`, `static/modules/today.js`, `static/modules/documents.js`, `static/modules/timeline.js`
- **Estimated effort**: Medium — need to either port module code into monolith or switch to modular architecture

## [P1] Monolith vs Modular architecture mismatch
- **Discovered**: 2026-03-22
- **Symptoms**: `index.html` loads `app-monolith.js` (a hotfix from when modular loading broke), but the modular `app.js` + `/static/modules/` architecture has more features and better maintainability
- **Likely cause**: A previous modular refactor broke the app, leading to a hotfix that reverted to the monolith. The monolith is now out of sync with newer features.
- **Files involved**: `templates/index.html`, `static/app-monolith.js`, `static/app.js`, `static/modules/*`
- **Estimated effort**: Large refactor — either keep monolith updated or fix the modular loading
