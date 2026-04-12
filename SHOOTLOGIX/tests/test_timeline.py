"""
Tests for the /api/productions/<prod_id>/timeline endpoint.
"""


def test_timeline_returns_200(client, auth_headers, prod_id):
    """Timeline endpoint should return 200 with valid structure."""
    resp = client.get(f"/api/productions/{prod_id}/timeline", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert "shooting_days" in data
    assert "resources" in data
    assert "functions" in data
    assert isinstance(data["resources"], list)


def test_timeline_resource_types(client, auth_headers, prod_id):
    """Timeline resources should have valid type and group fields."""
    resp = client.get(f"/api/productions/{prod_id}/timeline", headers=auth_headers)
    data = resp.get_json()
    valid_types = {"boat", "picture_boat", "security_boat", "vehicle", "labour", "guard", "location"}
    for r in data["resources"]:
        assert "id" in r
        assert "name" in r
        assert "type" in r
        assert r["type"] in valid_types, f"Unexpected type: {r['type']}"
        assert "group" in r
        assert "subgroup" in r
        assert "assignments" in r
        assert isinstance(r["assignments"], list)
