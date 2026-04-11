"""Tests for the multi-resource Gantt timeline endpoint."""


def test_timeline_returns_200(client, auth_headers, prod_id):
    """Timeline aggregation endpoint returns a well-formed payload."""
    resp = client.get(f"/api/productions/{prod_id}/timeline", headers=auth_headers)
    assert resp.status_code == 200, resp.get_json()
    data = resp.get_json()
    assert set(data.keys()) >= {"start_date", "end_date", "shooting_days", "resources", "functions"}
    assert isinstance(data["resources"], list)
    assert isinstance(data["shooting_days"], list)
    assert isinstance(data["functions"], list)


def test_timeline_resource_shapes(client, auth_headers, prod_id):
    """Every resource has id/name/type/group/assignments."""
    resp = client.get(f"/api/productions/{prod_id}/timeline", headers=auth_headers)
    assert resp.status_code == 200
    for r in resp.get_json()["resources"]:
        assert "id" in r and "name" in r
        assert r.get("type") in {"boat", "picture_boat", "security_boat", "vehicle", "labour", "guard", "location"}
        assert "group" in r
        assert isinstance(r.get("assignments", []), list)


def test_timeline_location_phases(client, auth_headers, prod_id):
    """Location resources aggregate P/F/W phases from location_schedules.status."""
    resp = client.get(f"/api/productions/{prod_id}/timeline", headers=auth_headers)
    assert resp.status_code == 200
    locations = [r for r in resp.get_json()["resources"] if r.get("type") == "location"]
    # We don't require any location to have assignments, but if they do, each one
    # must have a non-empty `phases` string composed of P/F/W tokens.
    for loc in locations:
        for a in loc.get("assignments", []):
            assert a.get("start_date") == a.get("end_date")
            phases = a.get("phases", "")
            assert phases, f"empty phases for location assignment: {a}"
            for token in phases.split("/"):
                assert token in {"P", "F", "W"}, f"unexpected phase token: {token}"
