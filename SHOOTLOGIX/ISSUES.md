# ShootLogix — Known Issues

## [P1] Silent API error handling in frontend
- **Discovered**: 2026-03-22
- **Symptoms**: When API calls fail, user sees no feedback — data just doesn't appear
- **Likely cause**: `fetch()` calls in modules don't always show error toasts on failure
- **Files involved**: `static/modules/*.js`, `static/app.js`
- **Estimated effort**: Medium

## [P1] Mobile responsiveness issues
- **Discovered**: 2026-03-22
- **Symptoms**: Some tabs/modals may not render well on mobile devices
- **Likely cause**: CSS not fully optimized for small screens
- **Files involved**: `static/style.css`, `templates/index.html`
- **Estimated effort**: Medium

## [P1] Missing confirmation dialogs for destructive actions
- **Discovered**: 2026-03-22
- **Symptoms**: Delete buttons may execute without asking for confirmation
- **Likely cause**: JS handlers call API directly without `confirm()` dialog
- **Files involved**: `static/modules/*.js`
- **Estimated effort**: Quick fix

## [P1] RBAC-related UI issues
- **Discovered**: 2026-03-22
- **Symptoms**: Non-admin users may see admin controls they shouldn't access
- **Likely cause**: Frontend doesn't consistently check role permissions before rendering controls
- **Files involved**: `static/modules/admin.js`, `static/app.js`
- **Estimated effort**: Medium

## [P2] 10 competing open PRs need cleanup
- **Discovered**: 2026-03-22
- **Symptoms**: PRs #1-10 all attempt to fix the same P0 tab navigation issue
- **Likely cause**: Multiple automated sessions created overlapping fixes
- **Action needed**: Close duplicate PRs after this comprehensive fix is merged
- **Estimated effort**: Quick fix
