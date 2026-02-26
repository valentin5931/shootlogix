"""
auth/rbac.py — Role-Based Access Control for ShootLogix.

Maps API routes to required permissions based on the role matrix:
  ADMIN:   full access to everything
  UNIT:    full access all tabs, cannot modify prices (except fuel), cannot manage users/projects
  TRANSPO: access limited to BOATS, PICTURE BOATS, SECURITY BOATS, TRANSPORT, FUEL
           same edit rights as UNIT on those tabs
  READER:  read-only access to all tabs, can export

Tab-to-route mapping:
  PDT       -> /shooting-days, /events, /parse-pdt, /upload-pdt
  LOCATIONS -> /locations, /location-schedules, /location-sites, /sync-pdt-locations
  BOATS     -> /boats, /boat-functions, /assignments (context=boats)
  PICTURE BOATS -> /picture-boats, /picture-boat-assignments
  SECURITY BOATS -> /security-boats, /security-boat-assignments
  TRANSPORT -> /transport-vehicles, /transport-assignments
  FUEL      -> /fuel-entries, /fuel-machinery, /fuel-prices, /fuel-locked-prices
  LABOUR    -> /helpers, /helper-assignments
  GUARDS    -> /guard-schedules, /guard-posts, /guard-camp-workers, /guard-camp-assignments, /guard-location
  FNB       -> /fnb-categories, /fnb-items, /fnb-entries, /fnb-tracking, /fnb-summary, /fnb-budget
  BUDGET    -> /budget, /export/budget-global
"""

# Tabs accessible by each role (ADMIN has access to everything so not listed)
ROLE_TABS = {
    "UNIT":    {"pdt", "locations", "boats", "picture-boats", "security-boats",
                "transport", "fuel", "labour", "guards", "fnb", "budget"},
    "TRANSPO": {"boats", "picture-boats", "security-boats", "transport", "fuel"},
    "READER":  {"pdt", "locations", "boats", "picture-boats", "security-boats",
                "transport", "fuel", "labour", "guards", "fnb", "budget"},
}

# Route path fragments mapped to tabs
# Order matters: more specific patterns first
ROUTE_TAB_MAP = [
    # PDT
    ("/shooting-days", "pdt"),
    ("/events", "pdt"),
    ("/parse-pdt", "pdt"),
    ("/upload-pdt", "pdt"),
    # LOCATIONS
    ("/location-schedules", "locations"),
    ("/location-sites", "locations"),
    ("/sync-pdt-locations", "locations"),
    ("/locations", "locations"),
    # PICTURE BOATS (must be before boats)
    ("/picture-boat-assignments", "picture-boats"),
    ("/picture-boats", "picture-boats"),
    # SECURITY BOATS (must be before boats)
    ("/security-boat-assignments", "security-boats"),
    ("/security-boats", "security-boats"),
    ("/security-auto-fill", "security-boats"),
    # BOATS
    ("/boat-functions", "boats"),
    ("/assignments", "boats"),
    ("/boats", "boats"),
    ("/auto-match-photos", "boats"),
    ("/migrate-boat-photos", "boats"),
    # TRANSPORT
    ("/transport-vehicles", "transport"),
    ("/transport-assignments", "transport"),
    # FUEL
    ("/fuel-entries", "fuel"),
    ("/fuel-machinery", "fuel"),
    ("/fuel-prices", "fuel"),
    ("/fuel-locked-prices", "fuel"),
    # LABOUR
    ("/helper-assignments", "labour"),
    ("/helpers", "labour"),
    # GUARDS
    ("/guard-schedules", "guards"),
    ("/guard-posts", "guards"),
    ("/guard-camp-assignments", "guards"),
    ("/guard-camp-workers", "guards"),
    ("/guard-location", "guards"),
    # FNB
    ("/fnb-categories", "fnb"),
    ("/fnb-items", "fnb"),
    ("/fnb-entries", "fnb"),
    ("/fnb-tracking", "fnb"),
    ("/fnb-summary", "fnb"),
    ("/fnb-budget", "fnb"),
    # BUDGET
    ("/budget", "budget"),
]

# Export routes mapped to tabs
EXPORT_TAB_MAP = [
    ("/export/labour", "labour"),
    ("/export/helpers", "labour"),
    ("/export/security-boats", "security-boats"),
    ("/export/picture-boats", "picture-boats"),
    ("/export/transport", "transport"),
    ("/export/fuel", "fuel"),
    ("/export/fuel-budget", "fuel"),
    ("/export/fnb-budget", "fnb"),
    ("/export/guard-camp", "guards"),
    ("/export/budget-global", "budget"),
    ("/export/csv", "boats"),
    ("/export/json", "boats"),
]

# Read-only methods
READ_METHODS = {"GET", "HEAD", "OPTIONS"}


def get_tab_for_route(path):
    """Determine which tab a route belongs to. Returns tab name or None."""
    # Check export routes first (more specific)
    for fragment, tab in EXPORT_TAB_MAP:
        if fragment in path:
            return tab

    for fragment, tab in ROUTE_TAB_MAP:
        if fragment in path:
            return tab

    return None


def check_role_access(role, path, method):
    """
    Check if a role has access to a given route.

    Returns:
        (allowed, reason) tuple.
        allowed: True if access is permitted.
        reason: String explaining denial if not allowed.
    """
    # ADMIN has full access
    if role == "ADMIN":
        return True, None

    # First determine the tab — if it belongs to a specific tab, use tab-based checks
    tab = get_tab_for_route(path)

    # Productions CRUD (only the direct /api/productions endpoint, not sub-routes)
    # Sub-routes like /api/productions/1/boats are handled by tab-based checks
    import re
    if re.match(r'^/api/productions/?$', path) or re.match(r'^/api/productions/\d+/?$', path):
        if method in READ_METHODS:
            return True, None
        else:
            return False, "Only ADMIN can create or modify productions"

    # Departments: all roles can read
    if "/departments" in path and tab is None:
        return True, None

    # Working days: read-only utility, all roles can access
    if "/working-days" in path:
        return True, None

    # Health check: everyone
    if "/health" in path:
        return True, None

    # Reload: only ADMIN
    if "/reload" in path:
        return False, "Only ADMIN can reload data"

    if tab is None:
        # Unknown route — deny for safety (ADMIN already returned above)
        return False, "Access denied"

    # Check if role has access to this tab
    allowed_tabs = ROLE_TABS.get(role, set())
    if tab not in allowed_tabs:
        return False, f"Your role ({role}) does not have access to {tab.upper()}"

    # READER: read-only access to all their tabs
    if role == "READER":
        if method not in READ_METHODS:
            return False, "Read-only access: you cannot modify data"
        return True, None

    # UNIT and TRANSPO: can read and write on their tabs
    # Price restrictions are handled at a more granular level (Step 6/UI)
    # Here we allow the write if they have tab access
    return True, None


def get_user_allowed_tabs(role):
    """Return the set of tab names accessible to a role."""
    if role == "ADMIN":
        return {"pdt", "locations", "boats", "picture-boats", "security-boats",
                "transport", "fuel", "labour", "guards", "fnb", "budget", "admin"}
    return ROLE_TABS.get(role, set())
