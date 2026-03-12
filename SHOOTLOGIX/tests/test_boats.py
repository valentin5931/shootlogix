"""Boats module tests."""


def test_list_boats(client, auth_headers, prod_id):
    """GET boats returns a list."""
    resp = client.get(f"/api/productions/{prod_id}/boats", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_create_boat(client, auth_headers, prod_id):
    """Create a boat and verify it appears in the list."""
    resp = client.post(f"/api/productions/{prod_id}/boats", json={
        "name": "Test Panga",
        "boat_type": "panga",
        "capacity": 8,
    }, headers=auth_headers)
    assert resp.status_code == 201
    boat = resp.get_json()
    assert boat["name"] == "Test Panga"
    boat_id = boat["id"]

    # Verify in list
    resp = client.get(f"/api/productions/{prod_id}/boats", headers=auth_headers)
    names = [b["name"] for b in resp.get_json()]
    assert "Test Panga" in names

    # Cleanup
    client.delete(f"/api/boats/{boat_id}", headers=auth_headers)


def test_update_boat(client, auth_headers, prod_id):
    """Update a boat's properties."""
    resp = client.post(f"/api/productions/{prod_id}/boats", json={
        "name": "Update Test Boat",
    }, headers=auth_headers)
    boat_id = resp.get_json()["id"]

    resp = client.put(f"/api/boats/{boat_id}", json={
        "name": "Updated Boat Name",
        "capacity": 12,
    }, headers=auth_headers)
    assert resp.status_code == 200

    client.delete(f"/api/boats/{boat_id}", headers=auth_headers)


def test_delete_boat(client, auth_headers, prod_id):
    """Delete a boat."""
    resp = client.post(f"/api/productions/{prod_id}/boats", json={
        "name": "Delete Me Boat",
    }, headers=auth_headers)
    boat_id = resp.get_json()["id"]

    resp = client.delete(f"/api/boats/{boat_id}", headers=auth_headers)
    assert resp.status_code == 200


def test_boat_functions(client, auth_headers, prod_id):
    """List boat functions."""
    resp = client.get(f"/api/productions/{prod_id}/boat-functions", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_boat_assignments(client, auth_headers, prod_id):
    """List boat assignments."""
    resp = client.get(f"/api/productions/{prod_id}/assignments", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)
