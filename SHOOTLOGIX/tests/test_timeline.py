"""Timeline (Gantt) endpoint tests."""


def test_timeline_returns_200(client, auth_headers, prod_id):
    """GET /api/productions/<id>/timeline returns 200 with a well-formed payload.

    Regression test for a 500 crash caused by the endpoint querying
    non-existent columns on the `locations` and `location_schedules` tables.
    """
    resp = client.get(f"/api/productions/{prod_id}/timeline", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, dict)
    # Required top-level keys the UI depends on
    for key in ("start_date", "end_date", "shooting_days", "resources", "functions"):
        assert key in data, f"missing key {key!r} in timeline payload"
    assert isinstance(data["resources"], list)
    assert isinstance(data["shooting_days"], list)


def test_timeline_location_resources_have_phase_strings(client, auth_headers, prod_id):
    """Location resources expose phases as P/F/W strings (not individual columns)."""
    resp = client.get(f"/api/productions/{prod_id}/timeline", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    loc_resources = [r for r in data["resources"] if r.get("type") == "location"]
    # The seeded KLAS7 production has 21 locations
    assert len(loc_resources) > 0
    for lr in loc_resources:
        assert "name" in lr
        assert "subgroup" in lr  # derived from location_type
        assert isinstance(lr["assignments"], list)
        for a in lr["assignments"]:
            assert a["phases"]  # non-empty P/F/W string
            # Every character in `phases` should be one of P, F, W
            for ch in a["phases"].replace("/", ""):
                assert ch in "PFW"
