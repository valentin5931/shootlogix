# ISSUES — ShootLogix Known Issues Log

## [FIXED] [P1] RBAC UI controls visible to READER role
- **Discovered**: 2026-03-22
- **Fixed**: 2026-04-12
- **Fix**: Added `write-only` CSS class to 39 static buttons, `_canEdit()` guards to 10 dynamic buttons, CSS rule to hide `.boat-edit-btn` and `.card-delete-btn` for reader

## [P1] FNB module empty state — categories exist but no items
- **Discovered**: 2026-04-12
- **Symptoms**: FNB tab shows 9 categories but 0 items and 0 entries. The grid renders but is empty.
- **Likely cause**: No items have been created yet via the UI. Categories were seeded but items need manual creation.
- **Files involved**: `static/app-monolith.js` (renderFnb, _fnbRenderGrid)
- **Estimated effort**: Quick — may need better empty state UX or sample data

## [P1] Form validation — no inline field error display on submission failures
- **Discovered**: 2026-04-12
- **Symptoms**: When creating/editing entities, if validation fails the error toast appears briefly but no inline indication on which field is wrong. Backend returns field-level errors (422 with `fields` object) but the frontend only shows them in a generic toast.
- **Likely cause**: The `api()` function at line 842 concatenates field errors into a single message and throws. Modal forms don't highlight individual invalid fields.
- **Files involved**: `static/app-monolith.js` (api function, all modal save functions)
- **Estimated effort**: Medium — need to propagate field errors to modal form inputs

## [P1] Schedule cell click actions not RBAC-guarded in all modules
- **Discovered**: 2026-04-12
- **Symptoms**: READER users can still click schedule grid cells in Locations and Guards tabs to toggle status. The existing CSS makes inputs readonly but some onclick handlers on table cells bypass this.
- **Likely cause**: Dynamic cell rendering uses inline onclick without `_canEdit()` checks
- **Files involved**: `static/app-monolith.js` (location schedule cells, guard schedule cells)
- **Estimated effort**: Quick fix — add `_canEdit()` conditional to cell onclick handlers

## [P0] Fleet/Crew sub-tab event handlers may not fire on cloned DOM
- **Discovered**: 2026-03-22
- **Symptoms**: When clicking Fleet > Picture Boats or Fleet > Security Boats, the sub-tab content is rendered in the original view panel. Interactive elements (drag-drop, inline edits) work because they use the original DOM, but the fleet sub-nav is injected via `prepend()` which may cause layout shifts.
- **Likely cause**: The fleet/crew unified tabs switch the active view panel rather than cloning content, so event handlers work. However, the injected sub-nav element is moved between panels on each sub-tab switch.
- **Files involved**: `static/app-monolith.js` (renderFleetUnified, renderCrewUnified)
- **Estimated effort**: Quick fix — may need to keep sub-nav in a fixed position outside view panels

## [P1] Picture Boats and Security Boats lists are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/picture-boats` returns `[]`, `/api/productions/1/security-boats` returns `[]`. All boats are in the main boats table with category "picture".
- **Likely cause**: The data loader may not be seeding picture_boats and security_boats tables separately, or the boats were all created in the main `boats` table regardless of intended category.
- **Files involved**: `database.py`, `data_loader.py`, `app.py` (picture-boats/security-boats routes)
- **Estimated effort**: Medium — need to investigate data model and potentially migrate boats to correct tables

## [P1] Transport and Helpers lists are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/transport` returns `[]`, `/api/productions/1/helpers` returns `[]` (but helper-assignments has data). No transport vehicles or helpers have been created.
- **Likely cause**: Data was never seeded for these modules, or they need to be created manually by users.
- **Files involved**: `database.py`, `data_loader.py`
- **Estimated effort**: Quick — may just need user to add data through the UI

## [P1] Fuel entries and machinery are empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/fuel-entries` returns `[]`, `/api/productions/1/fuel-machinery` returns `[]`
- **Likely cause**: No data seeded for fuel module
- **Files involved**: `database.py`
- **Estimated effort**: Quick — user needs to add data

## [P1] Guards list is empty
- **Discovered**: 2026-03-22
- **Symptoms**: `/api/productions/1/guards` returns `[]` but guard-posts has data (1643 bytes)
- **Likely cause**: Guards need to be created separately from guard posts
- **Files involved**: `database.py`
- **Estimated effort**: Quick

## [P2] Module files in static/modules/ are dead code
- **Discovered**: 2026-03-22
- **Symptoms**: Files like `fleet.js`, `crew.js`, `today.js`, `documents.js`, etc. in `static/modules/` reference `window._SL` which doesn't exist. They are never loaded by `index.html`.
- **Likely cause**: These were written for a module-loading system that was never implemented in the monolith. The equivalent functionality has now been added directly to `app-monolith.js`.
- **Files involved**: All files in `static/modules/`
- **Estimated effort**: Quick cleanup — these files could be removed or kept for reference
