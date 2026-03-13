"""
auth/admin_routes.py — Admin panel API endpoints.

All endpoints require ADMIN role. Protected by the global before_request
RBAC check plus an additional decorator for safety.

Endpoints:
  GET  /api/admin/users              — List all users
  POST /api/admin/users              — Create a new user
  PUT  /api/admin/users/<id>/password — Change user password
  DELETE /api/admin/users/<id>        — Delete a user
  POST /api/admin/revoke-tokens/<id> — Revoke all refresh tokens (P2.10)

  GET  /api/admin/projects           — List all projects
  POST /api/admin/projects           — Create a new project
  PUT  /api/admin/projects/<id>      — Rename/archive a project

  GET  /api/admin/projects/<id>/members       — List project members
  POST /api/admin/projects/<id>/members       — Invite user to project
  PUT  /api/admin/projects/<id>/members/<uid> — Change user role
  DELETE /api/admin/projects/<id>/members/<uid> — Remove user from project
"""
import csv
import io
import bcrypt
from functools import wraps
from flask import Blueprint, request, jsonify, g, Response

from auth.models import (
    get_all_users,
    get_user_by_nickname,
    get_user_by_id,
    create_user,
    update_user_password,
    delete_user,
    delete_user_refresh_tokens,
    get_project_members,
    get_membership,
    create_membership,
    update_membership_role,
    delete_membership,
    get_auth_db,
    VALID_ROLES,
    ALL_MODULES,
    get_user_permissions,
    get_user_global_permissions,
    set_user_permissions,
    ensure_user_permissions,
    # P6.15: Entity-level permissions
    VALID_ENTITY_TYPES,
    get_user_entity_permissions,
    add_user_entity_permission,
    delete_user_entity_permission,
)
from database import (
    get_production_templates,
    get_production_template,
    save_production_as_template,
    create_production_from_template,
    delete_production_template,
    seed_departments,
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


# P2.10: Revoke all refresh tokens for a user (force logout)
@admin_bp.route("/revoke-tokens/<int:user_id>", methods=["POST"])
@require_admin
def revoke_user_tokens(user_id):
    """Revoke all refresh tokens for a user, forcing re-authentication."""
    user = get_user_by_id(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    delete_user_refresh_tokens(user_id)
    return jsonify({
        "message": f"All tokens revoked for '{user['nickname']}'. User will be logged out on next API call.",
    })


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


# ─── Permissions (RBAC V2) ─────────────────────────────────────────────────

@admin_bp.route("/projects/<int:project_id>/members/<int:user_id>/permissions", methods=["GET"])
@require_admin
def get_member_permissions(project_id, user_id):
    """Get granular permissions for a user on a project.
    Auto-migrates from V1 role if no V2 permissions exist yet."""
    membership = get_membership(user_id, project_id)
    if not membership:
        return jsonify({"error": "User is not a member of this project"}), 404

    user = get_user_by_id(user_id)
    if user and user.get("is_admin"):
        return jsonify({
            "is_admin": True,
            "message": "Admin users have full access — no configurable permissions",
            "modules": {},
            "global": {"can_lock_unlock": True, "can_view_history": True},
        })

    modules = ensure_user_permissions(user_id, project_id, membership["role"])
    global_perms = get_user_global_permissions(user_id, project_id)

    return jsonify({
        "is_admin": False,
        "modules": modules,
        "global": global_perms,
        "all_modules": ALL_MODULES,
    })


@admin_bp.route("/projects/<int:project_id>/members/<int:user_id>/permissions", methods=["PUT"])
@require_admin
def update_member_permissions(project_id, user_id):
    """Set granular permissions for a user on a project.
    Body: { modules: {module: {access, can_export, ...}}, global: {can_lock_unlock, ...} }
    """
    membership = get_membership(user_id, project_id)
    if not membership:
        return jsonify({"error": "User is not a member of this project"}), 404

    user = get_user_by_id(user_id)
    if user and user.get("is_admin"):
        return jsonify({"error": "Cannot set permissions for admin users"}), 400

    data = request.json or {}
    modules_dict = data.get("modules", {})
    global_perms = data.get("global")

    # Validate
    for module, perms in modules_dict.items():
        if module not in ALL_MODULES:
            return jsonify({"error": f"Unknown module: {module}"}), 400
        if perms.get("access") not in ("none", "read", "write"):
            return jsonify({"error": f"Invalid access level for {module}"}), 400
        # money_write requires money_read
        if perms.get("money_write") and not perms.get("money_read"):
            return jsonify({"error": f"money_write requires money_read for {module}"}), 400
        # can_import requires write access
        if perms.get("can_import") and perms.get("access") != "write":
            return jsonify({"error": f"can_import requires write access for {module}"}), 400

    # Ensure all 11 modules are present (fill missing with 'none')
    for m in ALL_MODULES:
        if m not in modules_dict:
            modules_dict[m] = {
                "access": "none", "can_export": False, "can_import": False,
                "money_read": False, "money_write": False,
            }

    set_user_permissions(user_id, project_id, modules_dict, global_perms)

    return jsonify({
        "message": "Permissions updated",
        "modules": get_user_permissions(user_id, project_id),
        "global": get_user_global_permissions(user_id, project_id),
    })


# ─── Production Templates (AXE 10.1) ─────────────────────────────────────────

@admin_bp.route("/templates", methods=["GET"])
@require_admin
def list_templates():
    """List all production templates."""
    return jsonify(get_production_templates())


@admin_bp.route("/templates", methods=["POST"])
@require_admin
def save_template():
    """Save a production as template. Body: { production_id, name, description? }"""
    data = request.json or {}
    prod_id = data.get("production_id")
    name = (data.get("name") or "").strip()
    if not prod_id or not name:
        return jsonify({"error": "production_id and name required"}), 400

    tpl_id = save_production_as_template(
        prod_id, name, data.get("description"),
        creator_id=g.user_id, creator_nickname=getattr(g, "nickname", None)
    )
    return jsonify(get_production_template(tpl_id)), 201


@admin_bp.route("/templates/<int:template_id>", methods=["GET"])
@require_admin
def get_template(template_id):
    """Get a single template."""
    tpl = get_production_template(template_id)
    if not tpl:
        return jsonify({"error": "Template not found"}), 404
    return jsonify(tpl)


@admin_bp.route("/templates/<int:template_id>", methods=["DELETE"])
@require_admin
def remove_template(template_id):
    """Delete a template."""
    tpl = get_production_template(template_id)
    if not tpl:
        return jsonify({"error": "Template not found"}), 404
    delete_production_template(template_id)
    return jsonify({"message": f"Template '{tpl['name']}' deleted"})


@admin_bp.route("/projects/from-template", methods=["POST"])
@require_admin
def create_project_from_template():
    """Create a project from a template. Body: { template_id, name }"""
    data = request.json or {}
    template_id = data.get("template_id")
    name = (data.get("name") or "").strip()
    if not template_id or not name:
        return jsonify({"error": "template_id and name required"}), 400

    # Check duplicate project name
    with get_auth_db() as conn:
        existing = conn.execute("SELECT id FROM productions WHERE name = ?", (name,)).fetchone()
        if existing:
            return jsonify({"error": f"Project '{name}' already exists"}), 409

    prod_id = create_production_from_template(
        template_id, name,
        creator_id=g.user_id, creator_nickname=getattr(g, "nickname", None)
    )
    if not prod_id:
        return jsonify({"error": "Template not found"}), 404

    # Auto-add creating admin to the project
    with get_auth_db() as conn:
        conn.execute(
            "INSERT INTO project_memberships (user_id, production_id, role) VALUES (?, ?, 'ADMIN')",
            (g.user_id, prod_id)
        )

    return jsonify({"id": prod_id, "name": name, "from_template": True}), 201


# ─── Entity Permissions (P6.15) ───────────────────────────────────────────────

@admin_bp.route("/users/<int:user_id>/entity-permissions", methods=["GET"])
@require_admin
def list_entity_permissions(user_id):
    """List all entity-level permissions for a user.
    Optional query param: entity_type to filter."""
    user = get_user_by_id(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    entity_type = request.args.get("entity_type")
    perms = get_user_entity_permissions(user_id, entity_type)
    return jsonify({"permissions": perms, "valid_entity_types": VALID_ENTITY_TYPES})


@admin_bp.route("/users/<int:user_id>/entity-permissions", methods=["POST"])
@require_admin
def add_entity_permission(user_id):
    """Add an entity-level permission.
    Body: { entity_type, entity_id, permission ('read'|'write'|'admin') }"""
    user = get_user_by_id(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.get("is_admin"):
        return jsonify({"error": "Cannot set entity permissions for admin users"}), 400

    data = request.json or {}
    entity_type = (data.get("entity_type") or "").strip()
    entity_id = data.get("entity_id")
    permission = (data.get("permission") or "read").strip()

    if not entity_type or entity_id is None:
        return jsonify({"error": "entity_type and entity_id are required"}), 400
    if entity_type not in VALID_ENTITY_TYPES:
        return jsonify({"error": f"Invalid entity_type. Must be one of: {', '.join(VALID_ENTITY_TYPES)}"}), 400
    if permission not in ("read", "write", "admin"):
        return jsonify({"error": "permission must be 'read', 'write', or 'admin'"}), 400

    try:
        entity_id = int(entity_id)
    except (ValueError, TypeError):
        return jsonify({"error": "entity_id must be an integer"}), 400

    perm_id = add_user_entity_permission(user_id, entity_type, entity_id, permission)
    return jsonify({"id": perm_id, "message": "Entity permission added"}), 201


@admin_bp.route("/users/<int:user_id>/entity-permissions/<int:perm_id>", methods=["DELETE"])
@require_admin
def remove_entity_permission(user_id, perm_id):
    """Remove an entity-level permission."""
    user = get_user_by_id(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    delete_user_entity_permission(perm_id)
    return jsonify({"message": "Entity permission removed"})


# ─── Access Logs (P6.14) ─────────────────────────────────────────────────────

@admin_bp.route("/access-logs", methods=["GET"])
@require_admin
def list_access_logs():
    """List access logs with optional filters: user_id, date, endpoint, limit, offset."""
    from db_compat import get_db
    user_id = request.args.get("user_id", type=int)
    date = request.args.get("date")
    endpoint = request.args.get("endpoint")
    limit = request.args.get("limit", 100, type=int)
    offset = request.args.get("offset", 0, type=int)
    limit = min(limit, 1000)

    sql = """SELECT al.id, al.user_id, u.nickname, al.endpoint, al.method,
                    al.status_code, al.ip_address, al.user_agent, al.timestamp
             FROM access_logs al
             LEFT JOIN auth_users u ON u.id = al.user_id
             WHERE 1=1"""
    params = []
    if user_id:
        sql += " AND al.user_id = ?"
        params.append(user_id)
    if date:
        sql += " AND DATE(al.timestamp) = ?"
        params.append(date)
    if endpoint:
        sql += " AND al.endpoint LIKE ?"
        params.append(f"%{endpoint}%")
    sql += " ORDER BY al.timestamp DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()
        total = conn.execute(
            "SELECT COUNT(*) as c FROM access_logs" +
            (" WHERE user_id = ?" if user_id else "") +
            (" AND DATE(timestamp) = ?" if date and user_id else (" WHERE DATE(timestamp) = ?" if date else "")),
            ([p for p in [user_id, date] if p])
        ).fetchone()["c"]
    return jsonify({"logs": [dict(r) for r in rows], "total": total})


@admin_bp.route("/access-logs/export-csv", methods=["GET"])
@require_admin
def export_access_logs_csv():
    """Export access logs as CSV for external audit."""
    from db_compat import get_db
    user_id = request.args.get("user_id", type=int)
    date = request.args.get("date")

    sql = """SELECT al.id, al.user_id, u.nickname, al.endpoint, al.method,
                    al.status_code, al.ip_address, al.user_agent, al.timestamp
             FROM access_logs al
             LEFT JOIN auth_users u ON u.id = al.user_id
             WHERE 1=1"""
    params = []
    if user_id:
        sql += " AND al.user_id = ?"
        params.append(user_id)
    if date:
        sql += " AND DATE(al.timestamp) = ?"
        params.append(date)
    sql += " ORDER BY al.timestamp DESC"

    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "User ID", "Nickname", "Endpoint", "Method", "Status", "IP", "User Agent", "Timestamp"])
    for r in rows:
        writer.writerow([r["id"], r["user_id"], r["nickname"], r["endpoint"], r["method"],
                         r["status_code"], r["ip_address"], r["user_agent"], r["timestamp"]])

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=access_logs.csv"}
    )
