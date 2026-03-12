"""
Smoke test E2E: login → create entities → assign → verify budget.

This test walks through the core workflow:
1. Login as admin
2. Create a boat
3. Create a boat function
4. Create an assignment (boat → function)
5. Verify the assignment appears in the budget
"""


def test_e2e_login_create_assign_budget(client):
    """Full E2E smoke test: login → create → assign → check budget."""

    # 1. Login
    resp = client.post("/api/auth/login", json={
        "nickname": "ADMIN",
        "password": "@dm1NKL",
    })
    assert resp.status_code == 200
    token = resp.get_json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get production
    resp = client.get("/api/productions", headers=headers)
    assert resp.status_code == 200
    prods = resp.get_json()
    assert len(prods) > 0
    prod_id = prods[0]["id"]

    # 3. Create a boat
    resp = client.post(f"/api/productions/{prod_id}/boats", json={
        "name": "E2E Test Boat",
        "boat_type": "panga",
        "capacity": 6,
        "daily_rate_estimate": 150,
    }, headers=headers)
    assert resp.status_code == 201
    boat = resp.get_json()
    boat_id = boat["id"]

    # 4. Create a boat function
    resp = client.post(f"/api/productions/{prod_id}/boat-functions", json={
        "name": "E2E Test Function",
        "context": "boats",
    }, headers=headers)
    assert resp.status_code == 201
    func = resp.get_json()
    func_id = func["id"]

    # 5. Create an assignment
    resp = client.post(f"/api/productions/{prod_id}/assignments", json={
        "boat_id": boat_id,
        "boat_function_id": func_id,
        "start_date": "2026-04-01",
        "end_date": "2026-04-05",
    }, headers=headers)
    assert resp.status_code == 201
    assignment = resp.get_json()
    assignment_id = assignment["id"]

    # 6. Verify budget includes the assignment
    resp = client.get(f"/api/productions/{prod_id}/budget", headers=headers)
    assert resp.status_code == 200
    budget = resp.get_json()
    boat_rows = [r for r in budget["rows"] if r["department"] == "BOATS"]
    # The E2E boat assignment should generate at least one budget row
    e2e_rows = [r for r in boat_rows if "E2E Test" in (r.get("name") or r.get("boat") or "")]
    assert len(e2e_rows) >= 1, "E2E assignment not found in budget"

    # 7. Cleanup
    client.delete(f"/api/assignments/{assignment_id}", headers=headers)
    client.delete(f"/api/boat-functions/{func_id}", headers=headers)
    client.delete(f"/api/boats/{boat_id}", headers=headers)
