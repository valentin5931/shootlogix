"""
auth/tokens.py — JWT token creation and validation.

Access tokens: short-lived (30 minutes), used for API authentication.
Refresh tokens: longer-lived (30 days), used to get new access tokens.

Security decisions:
- Access tokens are stateless JWTs verified by signature only.
- Refresh tokens are stored in the database and can be revoked.
- All tokens use HS256 algorithm with a server-side secret.
- The secret is loaded from the JWT_SECRET environment variable,
  falling back to a generated random secret (dev only).
"""
import os
import secrets
import jwt
from datetime import datetime, timedelta, timezone

# Load secret from environment; generate random one if not set (dev mode).
# In production, JWT_SECRET MUST be set in the environment.
JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRY = timedelta(minutes=30)
REFRESH_TOKEN_EXPIRY = timedelta(days=30)

if not os.environ.get("JWT_SECRET"):
    print("WARNING: JWT_SECRET not set — using random secret (tokens will not survive restarts)")


def create_access_token(user_id, nickname, is_admin=False):
    """Create a short-lived access token containing user identity."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),   # PyJWT >= 2.8 requires sub to be a string
        "user_id": user_id,    # Keep integer user_id as a separate claim
        "nickname": nickname,
        "is_admin": is_admin,
        "iat": now,
        "exp": now + ACCESS_TOKEN_EXPIRY,
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id):
    """Create a long-lived refresh token (opaque string stored in DB)."""
    return secrets.token_urlsafe(64)


def decode_access_token(token):
    """
    Decode and validate an access token.
    Returns the payload dict on success, or None on failure.
    The 'sub' field is converted back to int for convenience.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        # Normalize: ensure sub is available as int via user_id
        if "user_id" not in payload:
            payload["user_id"] = int(payload["sub"])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_refresh_token_expiry():
    """Return the expiry datetime for a new refresh token as ISO string."""
    return (datetime.now(timezone.utc) + REFRESH_TOKEN_EXPIRY).strftime("%Y-%m-%d %H:%M:%S")
