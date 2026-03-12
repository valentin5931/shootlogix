"""Picture Boats module tests."""


def test_list_picture_boats(client, auth_headers, prod_id):
    """GET picture boats returns a list."""
    resp = client.get(f"/api/productions/{prod_id}/picture-boats", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_picture_boat_assignments(client, auth_headers, prod_id):
    """GET picture boat assignments returns a list."""
    resp = client.get(f"/api/productions/{prod_id}/picture-boat-assignments", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)
