"""
conftest.py — Shared test fixtures for ShootLogix.

Creates a fresh in-memory SQLite database for each test session,
bootstraps the schema, seeds auth data, and provides a Flask test
client with a valid admin JWT.
"""
import os
import sys
import tempfile

import pytest

# Force SQLite for tests (no PostgreSQL)
os.environ.pop("DATABASE_URL", None)

# Use a temporary file for the test database (some operations need file-based SQLite)
_test_db_fd, _test_db_path = tempfile.mkstemp(suffix=".db")
os.environ["DATABASE_PATH"] = _test_db_path

# Ensure the project root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture(scope="session")
def app():
    """Create and configure the Flask app for testing."""
    from database import init_db
    init_db()

    from auth.models import migrate_auth_tables
    migrate_auth_tables()

    from data_loader import bootstrap
    bootstrap()

    from auth.seed import seed_auth_data
    seed_auth_data()

    from app import app as flask_app
    flask_app.config["TESTING"] = True
    yield flask_app

    # Cleanup temp DB
    try:
        os.close(_test_db_fd)
    except OSError:
        pass
    try:
        os.unlink(_test_db_path)
    except OSError:
        pass


@pytest.fixture(scope="session")
def client(app):
    """Flask test client."""
    return app.test_client()


@pytest.fixture(scope="session")
def admin_token(client):
    """Authenticate as ADMIN and return a valid JWT access token."""
    resp = client.post("/api/auth/login", json={
        "nickname": "ADMIN",
        "password": "@dm1NKL",
    })
    assert resp.status_code == 200, f"Login failed: {resp.get_json()}"
    data = resp.get_json()
    return data["access_token"]


@pytest.fixture(scope="session")
def auth_headers(admin_token):
    """Authorization headers with admin JWT."""
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def prod_id(client, auth_headers):
    """Get or create a test production and return its ID."""
    resp = client.get("/api/productions", headers=auth_headers)
    prods = resp.get_json()
    if prods:
        return prods[0]["id"]
    # Create one
    resp = client.post("/api/productions", json={"name": "TEST_PROD"}, headers=auth_headers)
    assert resp.status_code == 201
    return resp.get_json()["id"]
