# ShootLogix — Known Issues

## [P1] Verify all tabs render correctly with modular app.js
- **Discovered**: 2026-03-22
- **Symptoms**: Need browser testing to confirm all tabs render data properly after switching from monolith to modular app.js
- **Likely cause**: Some functions in the monolith may not have been fully ported to modules
- **Files involved**: `static/app.js`, `static/modules/*.js`
- **Estimated effort**: Quick fix per tab

## [P1] app-monolith.js cleanup
- **Discovered**: 2026-03-22
- **Symptoms**: The old `app-monolith.js` (12831 lines) remains in the repo but is no longer loaded
- **Likely cause**: N/A — it's dead code after this fix
- **Files involved**: `static/app-monolith.js`
- **Estimated effort**: Quick — delete the file once modular version is confirmed stable

## [P1] Missing /data directory warning on startup
- **Discovered**: 2026-03-22
- **Symptoms**: "ShootLogix: /data directory does NOT exist!" warning on startup
- **Likely cause**: The app expects a `/data` directory for uploads but it's not created locally
- **Files involved**: `app.py`
- **Estimated effort**: Quick fix — create directory in startup or adjust path

## [P2] JWT_SECRET not set warning
- **Discovered**: 2026-03-22
- **Symptoms**: "JWT_SECRET not set — using random secret" warning on every startup
- **Likely cause**: Environment variable not configured in dev
- **Files involved**: `auth/tokens.py`
- **Estimated effort**: Quick — add to .env.example or documentation
