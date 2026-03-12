"""Guards module tests."""


def test_list_guard_posts(client, auth_headers, prod_id):
    """GET guard posts returns a list."""
    resp = client.get(f"/api/productions/{prod_id}/guard-posts", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_list_guard_schedules(client, auth_headers, prod_id):
    """GET guard location schedules returns a list."""
    resp = client.get(f"/api/productions/{prod_id}/guard-schedules", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)
