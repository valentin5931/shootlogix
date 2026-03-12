"""
auth/models.py — Database schema migrations and helpers for auth tables.

Tables managed:
  - users (modified: add nickname, is_admin, created_at columns)
  - project_memberships (new: user_id, production_id, role)
  - refresh_tokens (new: for JWT refresh token storage)
  - user_permissions (new: granular per-module permissions — RBAC V2)
  - user_global_permissions (new: cross-module permissions — RBAC V2)

Roles: ADMIN, UNIT, TRANSPO, READER (V1 — kept for backward compat)
RBAC V2: ADMIN flag + per-user, per-module configurable permissions
"""
import os
import sys

# Import from the compatibility layer (supports both SQLite and PostgreSQL)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_compat import (
    get_auth_db, get_table_columns, get_table_names, is_postgres,
)

# Valid membership roles
VALID_ROLES = ("ADMIN", "UNIT", "TRANSPO", "READER")


def migrate_auth_tables():
    """
    Run auth-related migrations. Safe to call multiple times (idempotent).

    This modifies the existing 'users' table and creates new tables
    for project memberships and refresh tokens.
    All existing data is preserved.
    """
    with get_auth_db() as conn:
        # --- Evolve users table (only if it already exists) ---
        user_cols = get_table_columns(conn, 'users')

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
                if is_postgres():
                    conn.execute(
                        "ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP"
                    )
                else:
                    conn.execute(
                        "ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT (datetime('now'))"
                    )
                print("Auth migration: added users.created_at")

        # --- Create project_memberships table ---
        tables = get_table_names(conn)

        if "users" in tables:
            if is_postgres():
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS project_memberships (
                        id              SERIAL PRIMARY KEY,
                        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
                        role            TEXT NOT NULL DEFAULT 'READER',
                        created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(user_id, production_id)
                    )
                """)

                conn.execute("""
                    CREATE TABLE IF NOT EXISTS refresh_tokens (
                        id          SERIAL PRIMARY KEY,
                        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        token       TEXT NOT NULL UNIQUE,
                        expires_at  TEXT NOT NULL,
                        created_at  TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                """)
            else:
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

        # --- RBAC V2: Create user_permissions table ---
        if "user_permissions" not in tables:
            if is_postgres():
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS user_permissions (
                        id              SERIAL PRIMARY KEY,
                        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
                        module          TEXT NOT NULL,
                        access          TEXT NOT NULL DEFAULT 'none',
                        can_export      INTEGER DEFAULT 0,
                        can_import      INTEGER DEFAULT 0,
                        money_read      INTEGER DEFAULT 0,
                        money_write     INTEGER DEFAULT 0,
                        UNIQUE(user_id, production_id, module)
                    )
                """)
            else:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS user_permissions (
                        id              INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
                        module          TEXT NOT NULL,
                        access          TEXT NOT NULL DEFAULT 'none',
                        can_export      INTEGER DEFAULT 0,
                        can_import      INTEGER DEFAULT 0,
                        money_read      INTEGER DEFAULT 0,
                        money_write     INTEGER DEFAULT 0,
                        UNIQUE(user_id, production_id, module)
                    )
                """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_user_permissions_user_prod
                ON user_permissions(user_id, production_id)
            """)
            print("Auth migration: created user_permissions table (RBAC V2)")

        # --- RBAC V2: Create user_global_permissions table ---
        if "user_global_permissions" not in tables:
            if is_postgres():
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS user_global_permissions (
                        id              SERIAL PRIMARY KEY,
                        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
                        can_lock_unlock INTEGER DEFAULT 0,
                        can_view_history INTEGER DEFAULT 0,
                        UNIQUE(user_id, production_id)
                    )
                """)
            else:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS user_global_permissions (
                        id              INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
                        can_lock_unlock INTEGER DEFAULT 0,
                        can_view_history INTEGER DEFAULT 0,
                        UNIQUE(user_id, production_id)
                    )
                """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_user_global_perms_user_prod
                ON user_global_permissions(user_id, production_id)
            """)
            print("Auth migration: created user_global_permissions table (RBAC V2)")

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
        if is_postgres():
            cur = conn.execute(
                """INSERT INTO users (name, nickname, email, password_hash, is_admin, created_at)
                   VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
                (nickname, nickname, f"{nickname.lower()}@shootlogix.local", password_hash, 1 if is_admin else 0)
            )
        else:
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
    """Delete a user and all their memberships and permissions."""
    with get_auth_db() as conn:
        conn.execute("DELETE FROM user_permissions WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM user_global_permissions WHERE user_id = ?", (user_id,))
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
        if is_postgres():
            conn.execute(
                "DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP"
            )
        else:
            conn.execute(
                "DELETE FROM refresh_tokens WHERE expires_at < datetime('now')"
            )


# --- RBAC V2: Permission helpers ---

# All 11 modules governed by the permission system
ALL_MODULES = [
    "pdt", "locations", "boats", "picture-boats", "security-boats",
    "transport", "fuel", "labour", "guards", "fnb", "budget",
]

# Default permission sets for V1 role migration
_ROLE_DEFAULTS = {
    "UNIT": {
        "modules": {m: {"access": "write", "can_export": 1, "can_import": 1,
                        "money_read": 1, "money_write": 0} for m in ALL_MODULES},
        "global": {"can_lock_unlock": 0, "can_view_history": 1},
    },
    "TRANSPO": {
        "modules": {m: {"access": "write", "can_export": 1, "can_import": 0,
                        "money_read": 1, "money_write": 0}
                    for m in ["boats", "picture-boats", "security-boats", "transport", "fuel"]},
        "global": {"can_lock_unlock": 0, "can_view_history": 0},
    },
    "READER": {
        "modules": {m: {"access": "read", "can_export": 1, "can_import": 0,
                        "money_read": 1, "money_write": 0} for m in ALL_MODULES},
        "global": {"can_lock_unlock": 0, "can_view_history": 0},
    },
}
# UNIT: fuel gets money_write
_ROLE_DEFAULTS["UNIT"]["modules"]["fuel"]["money_write"] = 1
# TRANSPO: modules not listed default to 'none'
for _m in ALL_MODULES:
    if _m not in _ROLE_DEFAULTS["TRANSPO"]["modules"]:
        _ROLE_DEFAULTS["TRANSPO"]["modules"][_m] = {
            "access": "none", "can_export": 0, "can_import": 0,
            "money_read": 0, "money_write": 0,
        }


def get_user_permissions(user_id, production_id):
    """Load all module permissions for a user on a production.
    Returns dict: {module: {access, can_export, can_import, money_read, money_write}}
    """
    with get_auth_db() as conn:
        rows = conn.execute("""
            SELECT module, access, can_export, can_import, money_read, money_write
            FROM user_permissions
            WHERE user_id = ? AND production_id = ?
        """, (user_id, production_id)).fetchall()
        return {r["module"]: {
            "access": r["access"],
            "can_export": bool(r["can_export"]),
            "can_import": bool(r["can_import"]),
            "money_read": bool(r["money_read"]),
            "money_write": bool(r["money_write"]),
        } for r in rows}


def get_user_global_permissions(user_id, production_id):
    """Load global permissions for a user on a production.
    Returns dict: {can_lock_unlock, can_view_history}
    """
    with get_auth_db() as conn:
        row = conn.execute("""
            SELECT can_lock_unlock, can_view_history
            FROM user_global_permissions
            WHERE user_id = ? AND production_id = ?
        """, (user_id, production_id)).fetchone()
        if row:
            return {
                "can_lock_unlock": bool(row["can_lock_unlock"]),
                "can_view_history": bool(row["can_view_history"]),
            }
        return {"can_lock_unlock": False, "can_view_history": False}


def set_user_permissions(user_id, production_id, modules_dict, global_perms=None):
    """Set all permissions for a user on a production (full replace).
    modules_dict: {module: {access, can_export, can_import, money_read, money_write}}
    global_perms: {can_lock_unlock, can_view_history} or None
    """
    with get_auth_db() as conn:
        # Clear existing module permissions
        conn.execute(
            "DELETE FROM user_permissions WHERE user_id = ? AND production_id = ?",
            (user_id, production_id)
        )
        # Insert new module permissions
        for module, perms in modules_dict.items():
            if module not in ALL_MODULES:
                continue
            conn.execute(
                """INSERT INTO user_permissions
                   (user_id, production_id, module, access, can_export, can_import, money_read, money_write)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (user_id, production_id, module,
                 perms.get("access", "none"),
                 1 if perms.get("can_export") else 0,
                 1 if perms.get("can_import") else 0,
                 1 if perms.get("money_read") else 0,
                 1 if perms.get("money_write") else 0)
            )

        # Global permissions
        if global_perms is not None:
            conn.execute(
                "DELETE FROM user_global_permissions WHERE user_id = ? AND production_id = ?",
                (user_id, production_id)
            )
            conn.execute(
                """INSERT INTO user_global_permissions
                   (user_id, production_id, can_lock_unlock, can_view_history)
                   VALUES (?, ?, ?, ?)""",
                (user_id, production_id,
                 1 if global_perms.get("can_lock_unlock") else 0,
                 1 if global_perms.get("can_view_history") else 0)
            )


def migrate_v1_role_to_v2(user_id, production_id, role):
    """Auto-migrate a V1 role to V2 granular permissions.
    Called when a user has a membership but no user_permissions rows yet.
    """
    if role == "ADMIN":
        return  # ADMIN uses is_admin flag, no per-module permissions needed

    defaults = _ROLE_DEFAULTS.get(role, _ROLE_DEFAULTS["READER"])
    set_user_permissions(
        user_id, production_id,
        defaults["modules"],
        defaults["global"],
    )


def ensure_user_permissions(user_id, production_id, role):
    """Ensure V2 permissions exist for a user. If not, auto-migrate from V1 role.
    Returns the full permissions dict.
    """
    perms = get_user_permissions(user_id, production_id)
    if not perms:
        migrate_v1_role_to_v2(user_id, production_id, role)
        perms = get_user_permissions(user_id, production_id)
    return perms


def delete_user_permissions(user_id, production_id=None):
    """Delete permissions for a user (all productions or specific one)."""
    with get_auth_db() as conn:
        if production_id is not None:
            conn.execute(
                "DELETE FROM user_permissions WHERE user_id = ? AND production_id = ?",
                (user_id, production_id)
            )
            conn.execute(
                "DELETE FROM user_global_permissions WHERE user_id = ? AND production_id = ?",
                (user_id, production_id)
            )
        else:
            conn.execute("DELETE FROM user_permissions WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM user_global_permissions WHERE user_id = ?", (user_id,))
