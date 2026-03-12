"""Health check and basic API tests."""


def test_health(client):
    """Health endpoint returns OK with table info."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "ok"
    assert data["table_count"] > 0
    assert "backend" in data


def test_unauthenticated_api_rejected(client):
    """API routes without token return 401."""
    resp = client.get("/api/productions")
    assert resp.status_code == 401
    data = resp.get_json()
    assert data["code"] == "NO_TOKEN"


def test_invalid_token_rejected(client):
    """API routes with bad token return 401."""
    resp = client.get("/api/productions", headers={"Authorization": "Bearer invalid.token.here"})
    assert resp.status_code == 401
