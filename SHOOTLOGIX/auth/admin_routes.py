"""
auth/admin_routes.py — Admin panel API endpoints.

All endpoints require ADMIN role. Protected by the global before_request
RBAC check plus an additional decorator for safety.

Endpoints:
  GET  /api/admin/users              — List all users
  POST /api/admin/users              — Create a new user
  PUT  /api/admin/users/<id>/password — Change user password
  DELETE /api/admin/users/<id>        — Delete a user

  GET  /api/admin/projects           — List all projects
  POST /api/admin/projects           — Create a new project
  PUT  /api/admin/projects/<id>      — Rename/archive a project

  GET  /api/admin/projects/<id>/members       — List project members
  POST /api/admin/projects/<id>/members       — Invite user to project
  PUT  /api/admin/projects/<id>/members/<uid> — Change user role
  DELETE /api/admin/projects/<id>/members/<uid> — Remove user from project
"""
import bcrypt
from functools import wraps
from flask import Blueprint, request, jsonify, g

from auth.models import (
    get_all_users,
    get_user_by_nickname,
    get_user_by_id,
    create_user,
    update_user_password,
    delete_user,
    get_project_members,
    get_membership,
    create_membership,
    update_membership_role,
    delete_membership,
    get_auth_db,
    VALID_ROLES,
)

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def require_admin(f):
    """Decorator: require ADMIN role."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not getattr(g, "is_admin", False):
            return jsonify({"error": "Admin access required", "code": "FORBIDDEN"}), 403
        return f(*args, **kwargs)
    return decorated


# ─── Users ───────────────────────────────────────────────────────────────────

@admin_bp.route("/users", methods=["GET"])
@require_admin
def list_users():
    """List all users with their memberships."""
    users = get_all_users()
    # Attach memberships to each user
    for u in users:
        with get_auth_db() as conn:
            rows = conn.execute("""
                SELECT pm.production_id, p.name as production_name, pm.role
                FROM project_memberships pm
                JOIN productions p ON p.id = pm.production_id
                WHERE pm.user_id = ?
                ORDER BY p.name
            """, (u["id"],)).fetchall()
            u["memberships"] = [dict(r) for r in rows]
    return jsonify(users)


@admin_bp.route("/users", methods=["POST"])
@require_admin
def create_user_endpoint():
    """Create a new user. Body: { nickname, password }"""
    data = request.json or {}
    nickname = (data.get("nickname") or "").strip()
    password = data.get("password") or ""

    if not nickname:
        return jsonify({"error": "Nickname is required"}), 400
    if len(nickname) < 2:
        return jsonify({"error": "Nickname must be at least 2 characters"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    # Check for duplicate
    existing = get_user_by_nickname(nickname)
    if existing:
        return jsonify({"error": f"User '{nickname}' already exists"}), 409

    pw_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")
    is_admin = bool(data.get("is_admin", False))
    user_id = create_user(nickname, pw_hash, is_admin=is_admin)

    return jsonify({"id": user_id, "nickname": nickname, "is_admin": is_admin}), 201


@admin_bp.route("/users/<int:user_id>/password", methods=["PUT"])
@require_admin
def change_password(user_id):
    """Change a user's password. Body: { password }"""
    user = get_user_by_id(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.json or {}
    password = data.get("password") or ""
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    pw_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")
    update_user_password(user_id, pw_hash)

    return jsonify({"message": f"Password updated for {user['nickname']}"})


@admin_bp.route("/users/<int:user_id>", methods=["DELETE"])
@require_admin
def delete_user_endpoint(user_id):
    """Delete a user. Cannot delete yourself."""
    if user_id == g.user_id:
        return jsonify({"error": "You cannot delete your own account"}), 400

    user = get_user_by_id(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    delete_user(user_id)
    return jsonify({"message": f"User '{user['nickname']}' deleted"})


# ─── Projects ───────────────────────────────────────────────────────────────

@admin_bp.route("/projects", methods=["GET"])
@require_admin
def list_projects():
    """List all projects with member count."""
    with get_auth_db() as conn:
        rows = conn.execute("""
            SELECT p.*, COUNT(pm.user_id) as member_count
            FROM productions p
            LEFT JOIN project_memberships pm ON pm.production_id = p.id
            GROUP BY p.id
            ORDER BY p.name
        """).fetchall()
        projects = [dict(r) for r in rows]
    return jsonify(projects)


@admin_bp.route("/projects", methods=["POST"])
@require_admin
def create_project():
    """Create a new project. Body: { name, start_date?, end_date?, site? }"""
    data = request.json or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Project name is required"}), 400

    with get_auth_db() as conn:
        # Check duplicate
        existing = conn.execute("SELECT id FROM productions WHERE name = ?", (name,)).fetchone()
        if existing:
            return jsonify({"error": f"Project '{name}' already exists"}), 409

        cur = conn.execute(
            """INSERT INTO productions (name, start_date, end_date, site, status)
               VALUES (?, ?, ?, ?, 'active')""",
            (name, data.get("start_date"), data.get("end_date"), data.get("site"))
        )
        project_id = cur.lastrowid

        # Auto-add the creating admin to the project
        conn.execute(
            "INSERT INTO project_memberships (user_id, production_id, role) VALUES (?, ?, 'ADMIN')",
            (g.user_id, project_id)
        )

    # Seed departments for the new project
    from database import seed_departments
    seed_departments(project_id)

    return jsonify({"id": project_id, "name": name}), 201


@admin_bp.route("/projects/<int:project_id>", methods=["PUT"])
@require_admin
def update_project(project_id):
    """Update a project. Body: { name?, status? ('active'|'archived') }"""
    data = request.json or {}
    with get_auth_db() as conn:
        project = conn.execute("SELECT * FROM productions WHERE id = ?", (project_id,)).fetchone()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        updates = []
        params = []
        if "name" in data and data["name"]:
            updates.append("name = ?")
            params.append(data["name"].strip())
        if "status" in data:
            if data["status"] not in ("active", "archived", "draft", "closed"):
                return jsonify({"error": "Invalid status"}), 400
            updates.append("status = ?")
            params.append(data["status"])
        if "start_date" in data:
            updates.append("start_date = ?")
            params.append(data["start_date"])
        if "end_date" in data:
            updates.append("end_date = ?")
            params.append(data["end_date"])
        if "site" in data:
            updates.append("site = ?")
            params.append(data["site"])

        if updates:
            params.append(project_id)
            conn.execute(f"UPDATE productions SET {', '.join(updates)} WHERE id = ?", params)

        row = conn.execute("SELECT * FROM productions WHERE id = ?", (project_id,)).fetchone()
        return jsonify(dict(row))


# ─── Project Members ────────────────────────────────────────────────────────

@admin_bp.route("/projects/<int:project_id>/members", methods=["GET"])
@require_admin
def list_members(project_id):
    """List all members of a project."""
    return jsonify(get_project_members(project_id))


@admin_bp.route("/projects/<int:project_id>/members", methods=["POST"])
@require_admin
def invite_member(project_id):
    """Invite a user to a project. Body: { nickname, role }"""
    data = request.json or {}
    nickname = (data.get("nickname") or "").strip()
    role = (data.get("role") or "READER").upper()

    if not nickname:
        return jsonify({"error": "Nickname is required"}), 400
    if role not in VALID_ROLES:
        return jsonify({"error": f"Invalid role. Must be one of: {', '.join(VALID_ROLES)}"}), 400

    user = get_user_by_nickname(nickname)
    if not user:
        return jsonify({"error": f"User '{nickname}' not found"}), 404

    # Check if already a member
    existing = get_membership(user["id"], project_id)
    if existing:
        return jsonify({"error": f"User '{nickname}' is already a member of this project"}), 409

    create_membership(user["id"], project_id, role)
    return jsonify({
        "message": f"'{nickname}' invited to project as {role}",
        "user_id": user["id"],
        "role": role,
    }), 201


@admin_bp.route("/projects/<int:project_id>/members/<int:user_id>", methods=["PUT"])
@require_admin
def change_member_role(project_id, user_id):
    """Change a user's role on a project. Body: { role }"""
    data = request.json or {}
    role = (data.get("role") or "").upper()

    if role not in VALID_ROLES:
        return jsonify({"error": f"Invalid role. Must be one of: {', '.join(VALID_ROLES)}"}), 400

    membership = get_membership(user_id, project_id)
    if not membership:
        return jsonify({"error": "User is not a member of this project"}), 404

    update_membership_role(user_id, project_id, role)
    return jsonify({"message": "Role updated", "role": role})


@admin_bp.route("/projects/<int:project_id>/members/<int:user_id>", methods=["DELETE"])
@require_admin
def remove_member(project_id, user_id):
    """Remove a user from a project."""
    if user_id == g.user_id:
        return jsonify({"error": "You cannot remove yourself from a project"}), 400

    membership = get_membership(user_id, project_id)
    if not membership:
        return jsonify({"error": "User is not a member of this project"}), 404

    delete_membership(user_id, project_id)
    return jsonify({"message": "User removed from project"})
