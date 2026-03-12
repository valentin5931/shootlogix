"""History / activity module tests."""


def test_list_history(client, auth_headers, prod_id):
    """GET history returns a list."""
    resp = client.get(f"/api/productions/{prod_id}/history", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)


def test_history_filters(client, auth_headers, prod_id):
    """History endpoint accepts filter params."""
    resp = client.get(
        f"/api/productions/{prod_id}/history?limit=10&action_type=CREATE",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, list)
    assert len(data) <= 10
