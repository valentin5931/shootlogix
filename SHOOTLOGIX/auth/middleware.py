"""
auth/middleware.py — Authentication middleware for Flask routes.

Provides the @require_auth decorator that validates JWT tokens
on every API request. The decorator extracts the token from the
Authorization header (Bearer scheme) and attaches user info to
Flask's g object.

Usage:
    @app.route("/api/something")
    @require_auth
    def my_route():
        user_id = g.user_id
        ...
"""
from functools import wraps
from flask import request, jsonify, g

from auth.tokens import decode_access_token


def require_auth(f):
    """
    Decorator: require a valid JWT access token.
    Sets g.user_id, g.nickname, g.is_admin on success.
    Returns 401 on missing/invalid/expired token.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")

        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authentication required", "code": "NO_TOKEN"}), 401

        token = auth_header[7:]  # Strip "Bearer "
        payload = decode_access_token(token)

        if payload is None:
            return jsonify({"error": "Invalid or expired token", "code": "INVALID_TOKEN"}), 401

        # Attach user info to Flask request context
        g.user_id = payload.get("user_id", int(payload["sub"]))
        g.nickname = payload["nickname"]
        g.is_admin = payload.get("is_admin", False)

        return f(*args, **kwargs)

    return decorated
