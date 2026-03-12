"""Budget module tests — including aggregation consistency check."""


def test_budget_returns_data(client, auth_headers, prod_id):
    """GET budget returns expected structure."""
    resp = client.get(f"/api/productions/{prod_id}/budget", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, dict)
    assert "rows" in data
    assert "grand_total_estimate" in data


def test_budget_grand_total_equals_sum_of_rows(client, auth_headers, prod_id):
    """Budget grand_total_estimate must equal sum of all row amount_estimate."""
    resp = client.get(f"/api/productions/{prod_id}/budget", headers=auth_headers)
    data = resp.get_json()

    row_sum = sum(r.get("amount_estimate", 0) or 0 for r in data["rows"])
    grand_total = data["grand_total_estimate"]

    assert abs(row_sum - grand_total) < 0.01, (
        f"Budget aggregation mismatch: sum of rows={row_sum}, grand_total={grand_total}"
    )


def test_budget_departments_present(client, auth_headers, prod_id):
    """Budget should reference known departments."""
    resp = client.get(f"/api/productions/{prod_id}/budget", headers=auth_headers)
    data = resp.get_json()

    known_depts = {"BOATS", "PICTURE BOATS", "SECURITY BOATS", "TRANSPORT", "LABOUR", "FUEL", "FNB", "LOCATIONS", "GUARDS"}
    row_depts = {r["department"] for r in data["rows"]}
    # All row departments should be known
    for dept in row_depts:
        assert dept in known_depts, f"Unknown department in budget: {dept}"


def test_budget_daily(client, auth_headers, prod_id):
    """GET daily budget returns expected structure."""
    resp = client.get(f"/api/productions/{prod_id}/budget/daily", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, (list, dict))


def test_budget_snapshots_list(client, auth_headers, prod_id):
    """GET budget snapshots returns a list."""
    resp = client.get(f"/api/productions/{prod_id}/budget/snapshots", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), list)
