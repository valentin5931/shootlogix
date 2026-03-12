"""Fuel module tests."""


def test_list_fuel_entries(client, auth_headers, prod_id):
    """GET fuel entries returns a list."""
    resp = client.get(f"/api/productions/{prod_id}/fuel", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_fuel_machinery(client, auth_headers, prod_id):
    """List fuel machinery."""
    resp = client.get(f"/api/productions/{prod_id}/fuel-machinery", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)
