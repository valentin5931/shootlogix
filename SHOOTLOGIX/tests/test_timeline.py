"""Timeline (Gantt) endpoint tests.

Regression guard for the SQL column bugs fixed on 2026-04-16:
  - locations had no `site` column (correct column is `location_type`)
  - location_schedules has no `prep`/`filming`/`wrap` columns (correct column is `status`)
  - guard_camp_assignments links via `helper_id`, not `worker_id`

These bugs caused GET /api/productions/<id>/timeline to return 500.
"""


def test_timeline_returns_200(client, auth_headers, prod_id):
    """Timeline endpoint returns 200 with the expected top-level keys."""
    resp = client.get(f"/api/productions/{prod_id}/timeline", headers=auth_headers)
    assert resp.status_code == 200, resp.get_data(as_text=True)
    data = resp.get_json()
    assert set(["start_date", "end_date", "shooting_days", "resources", "functions"]).issubset(data)
    assert isinstance(data["resources"], list)
    assert isinstance(data["shooting_days"], list)


def test_timeline_location_resources_have_valid_subgroup(client, auth_headers, prod_id):
    """Location resources use `location_type` as subgroup (not the old broken `site`)."""
    resp = client.get(f"/api/productions/{prod_id}/timeline", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    location_resources = [r for r in data["resources"] if r.get("type") == "location"]
    # Each location resource must expose a non-empty subgroup string
    for r in location_resources:
        assert isinstance(r.get("subgroup"), str) and r["subgroup"], r
