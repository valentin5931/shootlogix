"""
auth/models.py — Database schema migrations and helpers for auth tables.

Tables managed:
  - users (modified: add nickname, is_admin, created_at columns)
  - project_memberships (new: user_id, production_id, role)
  - refresh_tokens (new: for JWT refresh token storage)

Roles: ADMIN, UNIT, TRANSPO, READER
"""
import os
import sqlite3
from contextlib import contextmanager

# Re-use the same DB path as database.py (respects DATABASE_PATH env var)
_default_db = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "shootlogix.db")
DB_PATH = os.environ.get("DATABASE_PATH", _default_db)

# Valid membership roles
VALID_ROLES = ("ADMIN", "UNIT", "TRANSPO", "READER")


@contextmanager
def get_auth_db():
    """Separate connection context for auth operations."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def migrate_auth_tables():
    """
    Run auth-related migrations. Safe to call multiple times (idempotent).

    This modifies the existing 'users' table and creates new tables
    for project memberships and refresh tokens.
    All existing data is preserved.
    """
    with get_auth_db() as conn:
        # --- Evolve users table (only if it already exists) ---
        user_cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]

        if not user_cols:
            # Fresh deploy: users table not created yet. init_db() handles it.
            print("Auth migration: users table not yet created — skipping ALTER migrations")
        else:
            # Add 'nickname' column (unique, used for login instead of email)
            if "nickname" not in user_cols:
                conn.execute("ALTER TABLE users ADD COLUMN nickname TEXT")
                conn.execute("UPDATE users SET nickname = name WHERE nickname IS NULL")
                print("Auth migration: added users.nickname")

            # Add 'is_admin' column (global admin flag)
            if "is_admin" not in user_cols:
                conn.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0")
                print("Auth migration: added users.is_admin")

            # Add 'created_at' column
            if "created_at" not in user_cols:
                conn.execute(
                    "ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT (datetime('now'))"
                )
                print("Auth migration: added users.created_at")

        # --- Create project_memberships table ---
        # Only create tables with FK references to users/productions if those tables exist
        tables = [r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()]

        if "users" in tables:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS project_memberships (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
                    role            TEXT NOT NULL DEFAULT 'READER',
                    created_at      TEXT DEFAULT (datetime('now')),
                    UNIQUE(user_id, production_id)
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS refresh_tokens (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    token       TEXT NOT NULL UNIQUE,
                    expires_at  TEXT NOT NULL,
                    created_at  TEXT DEFAULT (datetime('now'))
                )
            """)

            # Create indexes for performance
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_project_memberships_user
                ON project_memberships(user_id)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_project_memberships_production
                ON project_memberships(production_id)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
                ON refresh_tokens(user_id)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token
                ON refresh_tokens(token)
            """)
            conn.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname
                ON users(nickname)
            """)

    print("Auth migration: complete")


# --- Helper functions for auth data access ---

def get_user_by_nickname(nickname):
    """Fetch a user by nickname. Returns dict or None."""
    with get_auth_db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE nickname = ?", (nickname,)
        ).fetchone()
        return dict(row) if row else None


def get_user_by_id(user_id):
    """Fetch a user by id. Returns dict or None."""
    with get_auth_db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        return dict(row) if row else None


def create_user(nickname, password_hash, is_admin=False):
    """Create a new user. Returns the new user id."""
    with get_auth_db() as conn:
        cur = conn.execute(
            """INSERT INTO users (name, nickname, email, password_hash, is_admin, created_at)
               VALUES (?, ?, ?, ?, ?, datetime('now'))""",
            (nickname, nickname, f"{nickname.lower()}@shootlogix.local", password_hash, 1 if is_admin else 0)
        )
        return cur.lastrowid


def get_all_users():
    """Return all users (without password_hash)."""
    with get_auth_db() as conn:
        rows = conn.execute(
            "SELECT id, name, nickname, is_admin, created_at FROM users ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]


def update_user_password(user_id, password_hash):
    """Update a user's password hash."""
    with get_auth_db() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (password_hash, user_id)
        )


def delete_user(user_id):
    """Delete a user and all their memberships."""
    with get_auth_db() as conn:
        conn.execute("DELETE FROM project_memberships WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM refresh_tokens WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


# --- Project membership helpers ---

def get_user_memberships(user_id):
    """Get all project memberships for a user."""
    with get_auth_db() as conn:
        rows = conn.execute("""
            SELECT pm.*, p.name as production_name, p.status as production_status
            FROM project_memberships pm
            JOIN productions p ON p.id = pm.production_id
            WHERE pm.user_id = ?
            ORDER BY p.name
        """, (user_id,)).fetchall()
        return [dict(r) for r in rows]


def get_project_members(production_id):
    """Get all members of a project."""
    with get_auth_db() as conn:
        rows = conn.execute("""
            SELECT pm.*, u.nickname, u.is_admin
            FROM project_memberships pm
            JOIN users u ON u.id = pm.user_id
            WHERE pm.production_id = ?
            ORDER BY u.nickname
        """, (production_id,)).fetchall()
        return [dict(r) for r in rows]


def get_membership(user_id, production_id):
    """Get a specific membership. Returns dict or None."""
    with get_auth_db() as conn:
        row = conn.execute(
            "SELECT * FROM project_memberships WHERE user_id = ? AND production_id = ?",
            (user_id, production_id)
        ).fetchone()
        return dict(row) if row else None


def create_membership(user_id, production_id, role="READER"):
    """Add a user to a project with a role."""
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role: {role}. Must be one of {VALID_ROLES}")
    with get_auth_db() as conn:
        conn.execute(
            """INSERT OR IGNORE INTO project_memberships (user_id, production_id, role)
               VALUES (?, ?, ?)""",
            (user_id, production_id, role)
        )


def update_membership_role(user_id, production_id, role):
    """Change a user's role on a project."""
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role: {role}. Must be one of {VALID_ROLES}")
    with get_auth_db() as conn:
        conn.execute(
            "UPDATE project_memberships SET role = ? WHERE user_id = ? AND production_id = ?",
            (role, user_id, production_id)
        )


def delete_membership(user_id, production_id):
    """Remove a user from a project."""
    with get_auth_db() as conn:
        conn.execute(
            "DELETE FROM project_memberships WHERE user_id = ? AND production_id = ?",
            (user_id, production_id)
        )


# --- Refresh token helpers ---

def store_refresh_token(user_id, token, expires_at):
    """Store a refresh token."""
    with get_auth_db() as conn:
        conn.execute(
            "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)",
            (user_id, token, expires_at)
        )


def get_refresh_token(token):
    """Fetch a refresh token record. Returns dict or None."""
    with get_auth_db() as conn:
        row = conn.execute(
            "SELECT * FROM refresh_tokens WHERE token = ?", (token,)
        ).fetchone()
        return dict(row) if row else None


def delete_refresh_token(token):
    """Delete a specific refresh token."""
    with get_auth_db() as conn:
        conn.execute("DELETE FROM refresh_tokens WHERE token = ?", (token,))


def delete_user_refresh_tokens(user_id):
    """Delete all refresh tokens for a user (logout from all sessions)."""
    with get_auth_db() as conn:
        conn.execute("DELETE FROM refresh_tokens WHERE user_id = ?", (user_id,))


def cleanup_expired_tokens():
    """Remove all expired refresh tokens."""
    with get_auth_db() as conn:
        conn.execute(
            "DELETE FROM refresh_tokens WHERE expires_at < datetime('now')"
        )
