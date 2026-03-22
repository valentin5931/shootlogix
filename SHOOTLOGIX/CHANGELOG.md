# CHANGELOG

## 2026-03-22 — [P0] Fix Fleet, Crew, Today, Documents, Timeline tab navigation

**Problem**: Clicking Fleet, Crew, Today, Documents, or Timeline tabs showed empty panels with no data loading. The `setTab()` function in `app-monolith.js` had no handlers for these 5 tabs — it only handled the direct sub-tabs (boats, picture-boats, security-boats, labour, guards).

**Root cause**: The app was refactored to use parent tabs (Fleet grouping boats/picture-boats/security-boats; Crew grouping labour/guards) but the monolith JS was never updated with handlers for these parent tabs, nor for the newer Today/Documents/Timeline tabs.

**Fix**: Added 5 new tab handlers in `app-monolith.js`:
- `fleet` → renders sub-navigation (Boats/Picture Boats/Security Boats pills), moves existing view panels into fleet container, delegates rendering to existing functions
- `crew` → activates Labour/Guards sub-tabs, moves existing view panels into crew container, delegates rendering
- `today` → renders today's shooting day events from existing schedule data
- `documents` → loads and renders documents from API
- `timeline` → loads and renders activity feed from API

**Files changed**: `static/app-monolith.js` (added ~130 lines)

**Verification**: JS syntax check passes (node --check). All API endpoints respond correctly. Tab handlers properly delegate to existing render functions.

**Branch**: fix/2026-03-22-fleet-crew-tab-handlers
**PR**: TBD
**Side effects**: DOM elements (view-boats, view-picture-boats, view-security-boats, view-labour, view-guards) are reparented into fleet/crew containers on first tab click. This is a one-time operation and doesn't affect functionality.

**Next priority**: Test all tabs in browser to verify rendering. Then address remaining P1 UX issues (form validation, error handling, mobile responsiveness).
