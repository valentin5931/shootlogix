"""Security Boats module tests."""


def test_list_security_boats(client, auth_headers, prod_id):
    """GET security boats returns a list."""
    resp = client.get(f"/api/productions/{prod_id}/security-boats", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_security_boat_assignments(client, auth_headers, prod_id):
    """GET security boat assignments returns a list."""
    resp = client.get(f"/api/productions/{prod_id}/security-boat-assignments", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)
