"""Labour (helpers) module tests."""


def test_list_helpers(client, auth_headers, prod_id):
    """GET helpers returns a list."""
    resp = client.get(f"/api/productions/{prod_id}/helpers", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_create_helper(client, auth_headers, prod_id):
    """Create a helper."""
    resp = client.post(f"/api/productions/{prod_id}/helpers", json={
        "name": "Test Worker",
        "role": "setup",
    }, headers=auth_headers)
    assert resp.status_code == 201
    h = resp.get_json()
    assert h["name"] == "Test Worker"

    client.delete(f"/api/helpers/{h['id']}", headers=auth_headers)


def test_helper_assignments(client, auth_headers, prod_id):
    """List helper assignments."""
    resp = client.get(f"/api/productions/{prod_id}/helper-assignments", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)
