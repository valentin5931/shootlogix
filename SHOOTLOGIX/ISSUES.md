# ISSUES — ShootLogix Known Issues

## [P0] FIXED — Fleet, Today, Crew, Documents, Timeline tabs blank
- **Discovered**: 2026-03-21
- **Status**: Fixed in fix/2026-03-21-missing-tab-handlers
- **Symptoms**: Clicking these tabs showed empty panels
- **Root cause**: app-monolith.js missing handlers for tabs added in modular app.js
- **Fix**: Added dynamic module loading + inline crew handler

## [P1] Checklist tab missing from mobile menu
- **Discovered**: 2026-03-21
- **Symptoms**: Checklist tab is in the desktop nav but not in the mobile burger menu
- **Likely cause**: Omitted from mobile-menu-items in index.html
- **Files involved**: templates/index.html
- **Estimated effort**: Quick fix

## [P1] Module loading depends on browser ES module support
- **Discovered**: 2026-03-21
- **Symptoms**: Fleet, Today, Documents tabs use dynamic `import()` which requires modern browsers
- **Likely cause**: Design decision — dynamic import is well-supported in modern browsers
- **Files involved**: static/app-monolith.js, static/modules/*.js
- **Estimated effort**: N/A — acceptable for target user base

## [P2] Monolith and modular app.js divergence
- **Discovered**: 2026-03-21
- **Symptoms**: Two parallel JS entry points (app.js + modules vs app-monolith.js) that may drift apart
- **Likely cause**: Historical split without clean migration
- **Files involved**: static/app.js, static/app-monolith.js, static/modules/
- **Estimated effort**: Large refactor — consider unifying into one approach
