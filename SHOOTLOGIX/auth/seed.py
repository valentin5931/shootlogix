"""
auth/seed.py — Seed default users and project memberships.
Called on every startup; idempotent (only creates if not exists).

Pre-configured accounts (passwords are bcrypt-hashed, never stored in plain text):
  ADMIN     / @dm1NKL     -> ADMIN role on KLAS7
  UNIT      / UN1Tkl@     -> UNIT role on KLAS7
  TRANSPORT / Tr@nsp0kl   -> TRANSPO role on KLAS7
  READER    / Re@derKL1   -> READER role on KLAS7
"""
import bcrypt

from auth.models import (
    get_auth_db,
    get_user_by_nickname,
    create_user,
    create_membership,
    get_membership,
)

# Seed accounts: (nickname, plain_password, is_admin, role_on_klas7)
SEED_ACCOUNTS = [
    ("ADMIN",     "@dm1NKL",    True,  "ADMIN"),
    ("UNIT",      "UN1Tkl@",    False, "UNIT"),
    ("TRANSPORT", "Tr@nsp0kl",  False, "TRANSPO"),
    ("READER",    "Re@derKL1",  False, "READER"),
]


def _hash_password(plain: str) -> str:
    """Hash a password using bcrypt with 12 rounds."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def _get_klas7_production_id():
    """Find the KLAS7 production. Returns its id or None."""
    with get_auth_db() as conn:
        row = conn.execute(
            "SELECT id FROM productions WHERE name = 'KLAS7' LIMIT 1"
        ).fetchone()
        return row["id"] if row else None


def seed_auth_data():
    """
    Create the 4 pre-configured user accounts and assign them to the KLAS7 project.
    Idempotent: skips users/memberships that already exist.
    """
    klas7_id = _get_klas7_production_id()
    if klas7_id is None:
        print("Auth seed: KLAS7 production not found — skipping user seeding")
        return

    created_users = 0
    created_memberships = 0

    for nickname, password, is_admin, role in SEED_ACCOUNTS:
        # Create user if not exists
        user = get_user_by_nickname(nickname)
        if user is None:
            pw_hash = _hash_password(password)
            user_id = create_user(nickname, pw_hash, is_admin=is_admin)
            created_users += 1
            print(f"Auth seed: created user '{nickname}' (id={user_id})")
        else:
            user_id = user["id"]

        # Create membership if not exists
        membership = get_membership(user_id, klas7_id)
        if membership is None:
            create_membership(user_id, klas7_id, role)
            created_memberships += 1
            print(f"Auth seed: assigned '{nickname}' to KLAS7 as {role}")

    if created_users == 0 and created_memberships == 0:
        print("Auth seed: all accounts already exist")
    else:
        print(f"Auth seed: created {created_users} user(s), {created_memberships} membership(s)")
