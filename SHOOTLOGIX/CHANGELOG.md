# CHANGELOG

## 2026-03-22 — [P0] Fix Documents tab crash — get_db() used without context manager

**Problem**: All 7 document API endpoints (GET, POST, PUT, DELETE, status, versions GET/POST) crashed with `AttributeError: '_GeneratorContextManager' object has no attribute 'execute'`. The DOCS tab was completely non-functional.

**Root cause**: `get_db()` is a generator-based context manager that must be used as `with get_db() as db:`. The documents endpoints (added in P5.7) incorrectly used `db = get_db()` which returns a generator object, not a database connection. This pattern works nowhere in the codebase — every other endpoint correctly uses the `with` statement.

**Fix**: Wrapped all 7 document endpoints with `with get_db() as db:` and removed manual `db.commit()` calls (the context manager auto-commits on successful exit).

**Files changed**: `app.py` (lines 7402-7555, 7 endpoints)

**Verification**: All document endpoints return 200 and CRUD operations work (create, read, update status, get versions, upload version, delete).

**Branch**: fix/2026-03-22-documents-get-db-context-manager
**PR**: TBD
**Side effects**: None
**Next priority**: Timeline endpoint crash — `sqlite3.OperationalError: no such column: site` in /api/productions/:id/timeline
