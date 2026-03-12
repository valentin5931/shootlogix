"""FNB module tests."""


def test_list_fnb_categories(client, auth_headers, prod_id):
    """GET FNB categories returns a list."""
    resp = client.get(f"/api/productions/{prod_id}/fnb-categories", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_create_fnb_category(client, auth_headers, prod_id):
    """Create an FNB category."""
    resp = client.post(f"/api/productions/{prod_id}/fnb-categories", json={
        "name": "Test Category",
    }, headers=auth_headers)
    assert resp.status_code == 201
    cat = resp.get_json()
    assert cat["name"] == "Test Category"

    client.delete(f"/api/fnb-categories/{cat['id']}", headers=auth_headers)


def test_fnb_budget(client, auth_headers, prod_id):
    """GET FNB budget data returns expected structure."""
    resp = client.get(f"/api/productions/{prod_id}/fnb-budget", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert "categories" in data
