"""Locations module tests."""


def test_list_location_sites(client, auth_headers, prod_id):
    """GET location sites returns a list."""
    resp = client.get(f"/api/productions/{prod_id}/locations", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_list_location_schedules(client, auth_headers, prod_id):
    """GET location schedules returns a list."""
    resp = client.get(f"/api/productions/{prod_id}/location-schedules", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)
