# ShootLogix — Known Issues

## [P0] Fleet tab renders sub-nav but delegates to separate view panels
- **Discovered**: 2026-03-21
- **Symptoms**: Fleet tab switches to Boats/Picture Boats/Security Boats views correctly, but the Fleet sub-nav is injected dynamically via DOM cloning which may not survive React-like re-renders
- **Likely cause**: Architecture mismatch — Fleet was designed as a unified view (static/modules/fleet.js) but current fix delegates to existing per-module views
- **Files involved**: static/app-monolith.js (fleet hub section), static/modules/fleet.js (unused reference implementation)
- **Estimated effort**: Medium — would need to integrate fleet.js merged-view logic into monolith

## [P1] Documents tab has no functionality
- **Discovered**: 2026-03-21
- **Symptoms**: Documents tab shows placeholder text only; no upload, list, or manage capability
- **Likely cause**: Feature was partially implemented in static/modules/documents.js but never integrated into monolith
- **Files involved**: static/modules/documents.js, app.py (document routes exist), templates/index.html
- **Estimated effort**: Medium — routes exist in app.py, need to port render logic from documents.js module

## [P1] Timeline tab has no functionality
- **Discovered**: 2026-03-21
- **Symptoms**: Timeline tab shows placeholder text only; no Gantt chart or schedule visualization
- **Likely cause**: Feature was partially implemented in static/js/timeline.js but never integrated into monolith
- **Files involved**: static/js/timeline.js, static/app-monolith.js
- **Estimated effort**: Medium — need to integrate timeline rendering logic

## [P1] Module files in static/modules/ are never loaded
- **Discovered**: 2026-03-21
- **Symptoms**: 22 module files exist but only app-monolith.js is loaded via script tag
- **Likely cause**: Architectural transition from modular app.js to monolith left orphaned files
- **Files involved**: static/modules/*.js, static/app.js (unused), templates/index.html
- **Estimated effort**: Large refactor — either integrate all modules into monolith or add module loader

## [P1] Picture Boats and Security Boats have 0 entities seeded
- **Discovered**: 2026-03-21
- **Symptoms**: Picture Boats and Security Boats lists show 0 items; boats list shows 46
- **Likely cause**: Seed data only creates boat entities; picture/security boat entities need manual creation
- **Files involved**: database.py (seed functions)
- **Estimated effort**: Quick fix — add seed data for picture and security boats

## [P2] Budget grand_total returns None
- **Discovered**: 2026-03-21
- **Symptoms**: Budget API returns grand_total=None even though boats have assignments with daily rates
- **Likely cause**: Budget calculation may depend on all module data being populated
- **Files involved**: database.py (get_budget function), app.py (budget endpoint)
- **Estimated effort**: Medium — need to trace budget aggregation logic
