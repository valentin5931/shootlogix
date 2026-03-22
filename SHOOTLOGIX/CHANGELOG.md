# CHANGELOG

## 2026-03-22 — [P0] Fix Fleet and Crew tab navigation — tabs non-functional in monolith

**Problem**: Clicking "Fleet" or "Crew" tabs in the top navigation showed empty panels with no content. Users could not access the unified fleet overview or switch between Labour/Guards via the Crew tab.

**Root cause**: The HTML template (`index.html`) defines `fleet` and `crew` tab buttons and view panels added by the modular `app.js` architecture, but the actually-loaded `app-monolith.js` had no handlers for these tabs in its `setTab()` function. The `ROLE_ALLOWED_TABS` also omitted `fleet`, `crew`, and `checklist`, so these tabs were hidden from non-ADMIN roles.

**Fix**: Added to `app-monolith.js`:
- `_loadAndRenderFleet()`: Fetches boats, picture boats, and security boats in parallel; renders a cards overview with vessel counts and names, with click-through to individual module tabs
- `crewSetSubTab()` and `_renderCrewSubTab()`: Manages Labour/Guards sub-tab switching within the crew panel, showing the correct view panel and triggering the appropriate render function
- Added `fleet`, `crew`, and `checklist` to `ROLE_ALLOWED_TABS` for all roles
- Made `_canViewTab()` treat `fleet` and `crew` as composite tabs (fleet = boats OR picture-boats OR security-boats; crew = labour OR guards)
- Added `fleet` and `crew` to `TAB_LABELS`
- Exposed `crewSetSubTab` and `_renderCrewSubTab` in the public API

**Verification**:
- All 45 existing tests pass
- API endpoints for boats, picture-boats, security-boats all return valid data
- Fleet tab renders vessel cards overview
- Crew tab shows Labour/Guards sub-tab navigation

**Branch**: fix/2026-03-22-fleet-crew-tabs-broken
**Side effects**: None
**Next priority**: P0 — `today`, `documents`, and `timeline` tabs also have no handlers in the monolith's `setTab()`, showing empty panels when clicked
