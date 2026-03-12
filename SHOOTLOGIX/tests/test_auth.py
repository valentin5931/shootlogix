"""Authentication endpoint tests."""


def test_login_success(client):
    """Valid credentials return tokens."""
    resp = client.post("/api/auth/login", json={
        "nickname": "ADMIN",
        "password": "@dm1NKL",
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["nickname"] == "ADMIN"
    assert data["user"]["is_admin"] is True


def test_login_wrong_password(client):
    """Wrong password returns 401."""
    resp = client.post("/api/auth/login", json={
        "nickname": "ADMIN",
        "password": "wrong_password",
    })
    assert resp.status_code == 401
    assert resp.get_json()["code"] == "INVALID_CREDENTIALS"


def test_login_missing_fields(client):
    """Missing fields return 400."""
    resp = client.post("/api/auth/login", json={"nickname": "ADMIN"})
    assert resp.status_code == 400


def test_login_nonexistent_user(client):
    """Unknown user returns 401."""
    resp = client.post("/api/auth/login", json={
        "nickname": "NOBODY",
        "password": "whatever",
    })
    assert resp.status_code == 401


def test_me_endpoint(client, auth_headers):
    """GET /api/auth/me returns current user info."""
    resp = client.get("/api/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["nickname"] == "ADMIN"
    assert data["is_admin"] is True
