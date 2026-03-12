"""Transport module tests."""


def test_list_vehicles(client, auth_headers, prod_id):
    """GET vehicles returns a list."""
    resp = client.get(f"/api/productions/{prod_id}/transport-vehicles", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_create_vehicle(client, auth_headers, prod_id):
    """Create a transport vehicle."""
    resp = client.post(f"/api/productions/{prod_id}/transport-vehicles", json={
        "name": "Test Pickup",
        "vehicle_type": "pickup",
    }, headers=auth_headers)
    assert resp.status_code == 201
    v = resp.get_json()
    assert v["name"] == "Test Pickup"

    client.delete(f"/api/transport-vehicles/{v['id']}", headers=auth_headers)


def test_transport_assignments(client, auth_headers, prod_id):
    """List transport assignments."""
    resp = client.get(f"/api/productions/{prod_id}/transport-assignments", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)
