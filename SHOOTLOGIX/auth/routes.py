"""
auth/routes.py — Authentication endpoints.

Endpoints:
  POST /api/auth/login    — Authenticate with nickname + password, returns tokens
  POST /api/auth/refresh  — Exchange a refresh token for a new access token
  POST /api/auth/logout   — Revoke refresh token
  GET  /api/auth/me       — Get current user info (requires auth)

Rate limiting:
  Login is limited to 5 attempts per minute per IP to prevent brute force.
  Implemented with a simple in-memory store (sufficient for single-instance deployment).
"""
import time
import bcrypt
from flask import Blueprint, request, jsonify, g
from collections import defaultdict

from auth.models import (
    get_user_by_nickname,
    get_user_by_id,
    store_refresh_token,
    get_refresh_token,
    delete_refresh_token,
    delete_user_refresh_tokens,
    get_user_memberships,
    get_auth_db,
)
from auth.tokens import (
    create_access_token,
    create_refresh_token,
    get_refresh_token_expiry,
)
from auth.middleware import require_auth

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

# --- Simple in-memory rate limiter ---
# {ip: [(timestamp, ...), ...]}
_login_attempts = defaultdict(list)
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX = 5  # max attempts per window


def _is_rate_limited(ip):
    """Check if an IP has exceeded the login rate limit."""
    now = time.time()
    # Clean old entries
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < RATE_LIMIT_WINDOW]
    return len(_login_attempts[ip]) >= RATE_LIMIT_MAX


def _record_attempt(ip):
    """Record a login attempt for rate limiting."""
    _login_attempts[ip].append(time.time())


# --- Endpoints ---

@auth_bp.route("/login", methods=["POST"])
def login():
    """
    Authenticate with nickname + password.
    Returns access_token and refresh_token on success.
    """
    ip = request.remote_addr or "unknown"

    if _is_rate_limited(ip):
        return jsonify({
            "error": "Too many login attempts. Please try again later.",
            "code": "RATE_LIMITED",
        }), 429

    data = request.json or {}
    nickname = (data.get("nickname") or "").strip()
    password = data.get("password") or ""

    if not nickname or not password:
        _record_attempt(ip)
        return jsonify({"error": "Nickname and password are required", "code": "MISSING_FIELDS"}), 400

    user = get_user_by_nickname(nickname)
    if user is None:
        _record_attempt(ip)
        return jsonify({"error": "Invalid credentials", "code": "INVALID_CREDENTIALS"}), 401

    # Verify password with bcrypt
    pw_hash = user.get("password_hash") or ""
    if not pw_hash or not bcrypt.checkpw(password.encode("utf-8"), pw_hash.encode("utf-8")):
        _record_attempt(ip)
        return jsonify({"error": "Invalid credentials", "code": "INVALID_CREDENTIALS"}), 401

    # Generate tokens
    access_token = create_access_token(user["id"], user["nickname"], user.get("is_admin", False))
    refresh_token = create_refresh_token(user["id"])
    expires_at = get_refresh_token_expiry()

    # Store refresh token in DB
    store_refresh_token(user["id"], refresh_token, expires_at)

    return jsonify({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": {
            "id": user["id"],
            "nickname": user["nickname"],
            "is_admin": bool(user.get("is_admin")),
        },
    })


@auth_bp.route("/refresh", methods=["POST"])
def refresh():
    """Exchange a valid refresh token for a new access token."""
    data = request.json or {}
    token = data.get("refresh_token") or ""

    if not token:
        return jsonify({"error": "Refresh token required", "code": "MISSING_TOKEN"}), 400

    stored = get_refresh_token(token)
    if stored is None:
        return jsonify({"error": "Invalid refresh token", "code": "INVALID_TOKEN"}), 401

    # Check expiry
    from datetime import datetime, timezone
    try:
        expires = datetime.strptime(stored["expires_at"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            delete_refresh_token(token)
            return jsonify({"error": "Refresh token expired", "code": "TOKEN_EXPIRED"}), 401
    except Exception:
        delete_refresh_token(token)
        return jsonify({"error": "Invalid refresh token", "code": "INVALID_TOKEN"}), 401

    # Get user
    user = get_user_by_id(stored["user_id"])
    if user is None:
        delete_refresh_token(token)
        return jsonify({"error": "User not found", "code": "USER_NOT_FOUND"}), 401

    # Issue new access token (refresh token stays the same)
    access_token = create_access_token(user["id"], user["nickname"], user.get("is_admin", False))

    return jsonify({
        "access_token": access_token,
        "user": {
            "id": user["id"],
            "nickname": user["nickname"],
            "is_admin": bool(user.get("is_admin")),
        },
    })


@auth_bp.route("/logout", methods=["POST"])
def logout():
    """Revoke the refresh token (logout)."""
    data = request.json or {}
    token = data.get("refresh_token")

    if token:
        delete_refresh_token(token)

    return jsonify({"message": "Logged out"})


@auth_bp.route("/me", methods=["GET"])
@require_auth
def me():
    """Return current user info and their project memberships.
    ADMIN users see all projects (with role='ADMIN' for each)."""
    user = get_user_by_id(g.user_id)
    if user is None:
        return jsonify({"error": "User not found"}), 404

    if user.get("is_admin"):
        # ADMIN sees all projects
        with get_auth_db() as conn:
            rows = conn.execute("""
                SELECT p.id as production_id, p.name as production_name,
                       p.status as production_status,
                       COALESCE(pm.role, 'ADMIN') as role
                FROM productions p
                LEFT JOIN project_memberships pm
                    ON pm.production_id = p.id AND pm.user_id = ?
                ORDER BY p.name
            """, (user["id"],)).fetchall()
            memberships = [dict(r) for r in rows]
    else:
        memberships = get_user_memberships(g.user_id)

    return jsonify({
        "id": user["id"],
        "nickname": user["nickname"],
        "is_admin": bool(user.get("is_admin")),
        "memberships": memberships,
    })
