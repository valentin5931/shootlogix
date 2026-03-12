"""
db_compat.py — PostgreSQL / SQLite compatibility layer for ShootLogix.

Detects DATABASE_URL (PostgreSQL) or falls back to SQLite via DATABASE_PATH.
Provides a unified get_db() context manager and SQL helpers that work on both backends.
"""
import os
import re
import sqlite3
import json
from contextlib import contextmanager

# ---------------------------------------------------------------------------
# Backend detection
# ---------------------------------------------------------------------------

DATABASE_URL = os.environ.get("DATABASE_URL")  # PostgreSQL connection string

_default_db = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shootlogix.db")
DATABASE_PATH = os.environ.get("DATABASE_PATH", _default_db)

_use_postgres = bool(DATABASE_URL)

# Lazy-import psycopg2 only when needed
_pg_pool = None


def is_postgres():
    """Return True if the app is running against PostgreSQL."""
    return _use_postgres


def _get_pg_pool():
    """Create or return a psycopg2 connection pool (lazy singleton)."""
    global _pg_pool
    if _pg_pool is None:
        import psycopg2.pool
        # Railway may provide postgres:// instead of postgresql://
        url = DATABASE_URL
        if url and url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        _pg_pool = psycopg2.pool.SimpleConnectionPool(1, 10, url)
    return _pg_pool


# ---------------------------------------------------------------------------
# SQL rewriting helpers
# ---------------------------------------------------------------------------

# Regex to match ? placeholders that are NOT inside quoted strings.
# Simple approach: replace all standalone ? with %s (works for parameterised queries).
_PARAM_RE = re.compile(r'\?')


def _sqlite_to_pg_params(sql):
    """Convert SQLite-style ? placeholders to PostgreSQL %s placeholders."""
    return _PARAM_RE.sub('%s', sql)


# INSERT OR REPLACE → INSERT ... ON CONFLICT DO UPDATE
_INSERT_OR_REPLACE_RE = re.compile(
    r'INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)',
    re.IGNORECASE | re.DOTALL
)

# INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
_INSERT_OR_IGNORE_RE = re.compile(
    r'INSERT\s+OR\s+IGNORE\s+INTO',
    re.IGNORECASE
)


def _rewrite_upsert(sql, table_conflicts=None):
    """Rewrite SQLite upsert syntax to PostgreSQL ON CONFLICT syntax.

    table_conflicts maps table names to their conflict columns.
    """
    if not _use_postgres:
        return sql

    # Handle INSERT OR IGNORE
    if _INSERT_OR_IGNORE_RE.search(sql):
        sql = _INSERT_OR_IGNORE_RE.sub('INSERT INTO', sql)
        # Add ON CONFLICT DO NOTHING before any trailing clause or at end
        # Find the VALUES(...) part and add after it
        sql = sql.rstrip().rstrip(';')
        sql += ' ON CONFLICT DO NOTHING'
        return sql

    # Handle INSERT OR REPLACE
    m = _INSERT_OR_REPLACE_RE.search(sql)
    if m:
        table = m.group(1)
        cols_str = m.group(2).strip()
        vals_str = m.group(3).strip()
        cols = [c.strip() for c in cols_str.split(',')]

        # Determine conflict target from known tables
        conflict_cols = _get_conflict_cols(table, table_conflicts)

        # Build SET clause for non-conflict columns
        update_cols = [c for c in cols if c not in conflict_cols]
        if update_cols:
            set_clause = ', '.join(f'{c} = EXCLUDED.{c}' for c in update_cols)
            conflict_target = ', '.join(conflict_cols)
            replacement = (
                f'INSERT INTO {table} ({cols_str}) VALUES ({vals_str}) '
                f'ON CONFLICT ({conflict_target}) DO UPDATE SET {set_clause}'
            )
        else:
            # All columns are conflict columns - just do nothing
            replacement = (
                f'INSERT INTO {table} ({cols_str}) VALUES ({vals_str}) '
                f'ON CONFLICT DO NOTHING'
            )

        # Replace the matched portion, preserving any COALESCE/subquery parts after VALUES
        sql = sql[:m.start()] + replacement + sql[m.end():]

    return sql


# Known UNIQUE/PK constraints per table for ON CONFLICT targets
_TABLE_CONFLICTS = {
    'fuel_entries': ['source_type', 'assignment_id', 'date'],
    'fuel_locked_prices': ['date'],
    'location_schedules': ['production_id', 'location_name', 'date'],
    'guard_location_schedules': ['production_id', 'location_name', 'date'],
    'fnb_daily_tracking': ['production_id', 'date', 'category'],
    'fnb_entries': ['item_id', 'entry_type', 'date'],
    'settings': ['key'],
}


def _get_conflict_cols(table, extra=None):
    """Get the conflict columns for a table's UNIQUE/PK constraint."""
    if extra and table in extra:
        return extra[table]
    return _TABLE_CONFLICTS.get(table, ['id'])


def _rewrite_sql(sql):
    """Apply all necessary SQL rewrites for the current backend."""
    if not _use_postgres:
        return sql

    # Parameter placeholders
    sql = _sqlite_to_pg_params(sql)

    # PRAGMA → no-op (handled elsewhere)
    # datetime('now') → CURRENT_TIMESTAMP (in DDL and inline)
    sql = sql.replace("datetime('now')", "CURRENT_TIMESTAMP")

    return sql


# ---------------------------------------------------------------------------
# Cursor / Row wrappers for PostgreSQL
# ---------------------------------------------------------------------------

class PgRow(dict):
    """A dict subclass that also supports attribute-style access and index access
    for compatibility with sqlite3.Row usage patterns like row['col'] and dict(row).
    """
    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


class PgCursorWrapper:
    """Wraps a psycopg2 cursor to provide sqlite3-compatible interface."""

    def __init__(self, cursor):
        self._cursor = cursor
        self.lastrowid = None
        self.rowcount = 0
        self.description = None

    def execute(self, sql, params=None):
        original_sql = sql

        # Skip PRAGMAs
        stripped = sql.strip().upper()
        if stripped.startswith('PRAGMA'):
            return self

        # Rewrite upserts
        sql = _rewrite_upsert(sql)

        # Rewrite parameters and syntax
        sql = _rewrite_sql(sql)

        # For INSERT statements, add RETURNING id to capture lastrowid
        needs_returning = False
        stripped_rewritten = sql.strip().upper()
        if (stripped_rewritten.startswith('INSERT') and
                'RETURNING' not in stripped_rewritten):
            # Only add RETURNING if the table likely has an id column
            # Skip for tables with composite PKs or non-id PKs
            skip_returning = any(t in sql.lower() for t in [
                'shooting_day_locations', 'settings', 'fuel_locked_prices'
            ])
            if not skip_returning:
                sql = sql.rstrip().rstrip(';') + ' RETURNING id'
                needs_returning = True

        try:
            self._cursor.execute(sql, params)
        except Exception as e:
            # If RETURNING id fails (no id column), retry without
            if needs_returning and 'column "id"' in str(e).lower():
                sql_no_ret = sql.rsplit('RETURNING id', 1)[0].strip()
                self._cursor.execute(sql_no_ret, params)
                needs_returning = False
            else:
                raise

        self.rowcount = self._cursor.rowcount
        self.description = self._cursor.description

        if needs_returning:
            try:
                row = self._cursor.fetchone()
                if row:
                    self.lastrowid = row[0] if isinstance(row, tuple) else row.get('id')
            except Exception:
                self.lastrowid = None
        else:
            self.lastrowid = None

        return self

    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None:
            return None
        if isinstance(row, dict):
            return PgRow(row)
        return row

    def fetchall(self):
        rows = self._cursor.fetchall()
        if rows and isinstance(rows[0], dict):
            return [PgRow(r) for r in rows]
        return rows


class PgConnectionWrapper:
    """Wraps a psycopg2 connection to provide sqlite3-compatible interface."""

    def __init__(self, conn):
        self._conn = conn
        self._cursor = None

    def execute(self, sql, params=None):
        cur = self._get_cursor()
        wrapper = PgCursorWrapper(cur)
        return wrapper.execute(sql, params)

    def executescript(self, sql_script):
        """Execute a multi-statement SQL script.
        Converts SQLite DDL to PostgreSQL DDL on the fly.
        """
        cur = self._get_cursor()
        pg_script = _convert_ddl_to_pg(sql_script)
        cur.execute(pg_script)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        if self._cursor:
            self._cursor.close()
            self._cursor = None

    def _get_cursor(self):
        if self._cursor is None:
            import psycopg2.extras
            self._cursor = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        return self._cursor


# ---------------------------------------------------------------------------
# DDL conversion (SQLite → PostgreSQL)
# ---------------------------------------------------------------------------

def _convert_ddl_to_pg(sql_script):
    """Convert a SQLite DDL script to PostgreSQL-compatible DDL."""
    # Replace INTEGER PRIMARY KEY AUTOINCREMENT with SERIAL PRIMARY KEY
    result = re.sub(
        r'(\w+)\s+INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT',
        r'\1 SERIAL PRIMARY KEY',
        sql_script,
        flags=re.IGNORECASE
    )

    # Replace DEFAULT (datetime('now')) with DEFAULT CURRENT_TIMESTAMP
    result = result.replace("DEFAULT (datetime('now'))", "DEFAULT CURRENT_TIMESTAMP")
    result = result.replace("datetime('now')", "CURRENT_TIMESTAMP")

    # SQLite TEXT PRIMARY KEY → PostgreSQL TEXT PRIMARY KEY (no change needed)

    # Remove IF NOT EXISTS from CREATE INDEX (PostgreSQL supports it, but
    # ensure the syntax matches)
    # Actually PostgreSQL supports CREATE INDEX IF NOT EXISTS, so keep it.

    return result


# ---------------------------------------------------------------------------
# Unified connection context managers
# ---------------------------------------------------------------------------

@contextmanager
def get_db():
    """Get a database connection — PostgreSQL if DATABASE_URL is set, else SQLite."""
    if _use_postgres:
        pool = _get_pg_pool()
        raw_conn = pool.getconn()
        conn = PgConnectionWrapper(raw_conn)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
            pool.putconn(raw_conn)
    else:
        raw_conn = sqlite3.connect(DATABASE_PATH)
        raw_conn.row_factory = sqlite3.Row
        raw_conn.execute("PRAGMA journal_mode=DELETE")
        raw_conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield raw_conn
            raw_conn.commit()
        except Exception:
            raw_conn.rollback()
            raise
        finally:
            raw_conn.close()


@contextmanager
def get_auth_db():
    """Get a database connection for auth operations."""
    if _use_postgres:
        # PostgreSQL: same pool, auth operations are just regular queries
        pool = _get_pg_pool()
        raw_conn = pool.getconn()
        conn = PgConnectionWrapper(raw_conn)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
            pool.putconn(raw_conn)
    else:
        raw_conn = sqlite3.connect(DATABASE_PATH)
        raw_conn.row_factory = sqlite3.Row
        raw_conn.execute("PRAGMA journal_mode=WAL")
        raw_conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield raw_conn
            raw_conn.commit()
        except Exception:
            raw_conn.rollback()
            raise
        finally:
            raw_conn.close()


# ---------------------------------------------------------------------------
# Schema introspection helpers
# ---------------------------------------------------------------------------

def get_table_columns(conn, table_name):
    """Get column names for a table — works on both backends."""
    if _use_postgres:
        rows = conn.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = %s ORDER BY ordinal_position",
            (table_name,)
        ).fetchall()
        return [r['column_name'] if isinstance(r, dict) else r[0] for r in rows]
    else:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        return [r[1] for r in rows]


def get_table_names(conn):
    """Get all table names — works on both backends."""
    if _use_postgres:
        rows = conn.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' ORDER BY table_name"
        ).fetchall()
        return [r['table_name'] if isinstance(r, dict) else r[0] for r in rows]
    else:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
        return [r[0] for r in rows]


# ---------------------------------------------------------------------------
# Info
# ---------------------------------------------------------------------------

def get_backend_info():
    """Return a dict describing the active database backend."""
    if _use_postgres:
        return {
            "backend": "postgresql",
            "url": DATABASE_URL[:30] + "..." if DATABASE_URL else None,
        }
    else:
        return {
            "backend": "sqlite",
            "path": DATABASE_PATH,
        }
