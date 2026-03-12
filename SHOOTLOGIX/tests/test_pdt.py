"""PDT (shooting days) module tests."""


def test_list_shooting_days(client, auth_headers, prod_id):
    """GET shooting days returns a list."""
    resp = client.get(f"/api/productions/{prod_id}/shooting-days", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_create_and_get_shooting_day(client, auth_headers, prod_id):
    """Create a shooting day and retrieve it."""
    resp = client.post(f"/api/productions/{prod_id}/shooting-days", json={
        "date": "2026-04-01",
        "day_number": 99,
        "location": "Test Island",
    }, headers=auth_headers)
    assert resp.status_code == 201
    day = resp.get_json()
    day_id = day["id"]

    # Retrieve it
    resp = client.get(f"/api/productions/{prod_id}/shooting-days/{day_id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["date"] == "2026-04-01"
    assert data["location"] == "Test Island"


def test_update_shooting_day(client, auth_headers, prod_id):
    """Update a shooting day."""
    # Create
    resp = client.post(f"/api/productions/{prod_id}/shooting-days", json={
        "date": "2026-04-02",
        "day_number": 100,
    }, headers=auth_headers)
    day_id = resp.get_json()["id"]

    # Update
    resp = client.put(f"/api/productions/{prod_id}/shooting-days/{day_id}", json={
        "location": "Updated Island",
        "notes": "Test note",
    }, headers=auth_headers)
    assert resp.status_code == 200


def test_delete_shooting_day(client, auth_headers, prod_id):
    """Delete a shooting day."""
    resp = client.post(f"/api/productions/{prod_id}/shooting-days", json={
        "date": "2026-04-03",
    }, headers=auth_headers)
    day_id = resp.get_json()["id"]

    resp = client.delete(f"/api/productions/{prod_id}/shooting-days/{day_id}", headers=auth_headers)
    assert resp.status_code == 200
