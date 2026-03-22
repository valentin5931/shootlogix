# ShootLogix — Known Issues

## [P1] Dashboard tab hidden and redundant with Today tab
- **Discovered**: 2026-03-22
- **Symptoms**: Dashboard tab button exists in HTML but is hidden (`display:none`). The "Today" tab was added as an alternative, but the dashboard may contain additional aggregated data.
- **Likely cause**: Dashboard was superseded by Today tab during a refactor, but never fully removed or integrated.
- **Files involved**: `templates/index.html`, `static/app-monolith.js` (renderDashboard), `static/js/dashboard-v2.js`
- **Estimated effort**: Medium — need to decide whether to merge Dashboard into Today or make both accessible.

## [P1] Fleet sub-nav injected via `insertAdjacentHTML` duplicates on repeated tab switches
- **Discovered**: 2026-03-22
- **Symptoms**: Each time the Fleet or Crew tab is clicked, a new sub-nav bar is injected. Old ones are removed first via `.fleet-subnav-bar` selector, but this approach is fragile.
- **Likely cause**: Dynamic DOM injection pattern without a stable container.
- **Files involved**: `static/app-monolith.js` (_renderFleetSubNav, _renderCrewSubNav)
- **Estimated effort**: Quick fix — use a stable container element instead of injecting/removing.

## [P1] Picture Boats and Security Boats lists are empty (0 entities)
- **Discovered**: 2026-03-22
- **Symptoms**: API returns empty arrays for `/api/productions/1/picture-boats` and `/api/productions/1/security-boats`. No data seeded.
- **Likely cause**: No seed data for these modules; they need manual population.
- **Files involved**: `database.py`, seed logic
- **Estimated effort**: Quick fix — may just need data entry, not a code bug.

## [P1] Helpers (Labour) list is empty (0 entities)
- **Discovered**: 2026-03-22
- **Symptoms**: API returns empty array for `/api/productions/1/helpers`.
- **Likely cause**: No seed data; manual population needed.
- **Files involved**: `database.py`
- **Estimated effort**: Data entry, not a code bug.

## [P2] CSS style.css loaded from `/static/style.css` but files are in `/static/css/` per CLAUDE.md docs
- **Discovered**: 2026-03-22
- **Symptoms**: The CLAUDE.md architecture docs reference `static/css/style.css` but the actual file is at `static/style.css`. Documentation mismatch.
- **Files involved**: `CLAUDE.md`
- **Estimated effort**: Quick fix — update docs.
