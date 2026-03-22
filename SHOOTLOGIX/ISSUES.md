# ISSUES — ShootLogix Known Issues

## [P0] Timeline endpoint crash — missing `site` column
- **Discovered**: 2026-03-22
- **Symptoms**: Clicking the TIMELINE tab returns a 500 error. API returns `sqlite3.OperationalError: no such column: site`.
- **Likely cause**: A query in the timeline endpoint references a `site` column that doesn't exist in the current schema (possibly renamed or never migrated).
- **Files involved**: `app.py` (timeline endpoint), database schema
- **Estimated effort**: Quick fix (rename column reference or add migration)
