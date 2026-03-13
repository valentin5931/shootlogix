"""
auth/rbac.py — Role-Based Access Control for ShootLogix (V2).

RBAC V2: Two-tier system:
  - ADMIN (is_admin flag): full access to everything
  - USER: configurable per-user, per-module permissions

Permission model per module:
  - access: 'none' | 'read' | 'write'
  - can_export: bool (independent of access level)
  - can_import: bool (requires write access)
  - money_read: bool (see financial columns)
  - money_write: bool (edit prices — requires money_read)

Global permissions:
  - can_lock_unlock: bool (lock/unlock dates)
  - can_view_history: bool (activity feed)

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
    ("/export/logistics", "budget"),
    ("/export/csv", "boats"),
    ("/export/json", "boats"),
]

# Read-only methods
READ_METHODS = {"GET", "HEAD", "OPTIONS"}

# Routes related to imports (CSV upload, etc.)
IMPORT_ROUTES = [
    "/upload-pdt", "/parse-pdt", "/import",
    "/sync-pdt-locations",
]

# Routes related to price/money editing
PRICE_ROUTES = [
    "/fuel-prices", "/fuel-locked-prices",
]


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


def is_export_route(path):
    """Check if a route is an export endpoint."""
    return any(frag in path for frag, _ in EXPORT_TAB_MAP)


def is_import_route(path):
    """Check if a route involves importing data."""
    return any(frag in path for frag in IMPORT_ROUTES)


def is_price_route(path):
    """Check if a route involves price/money editing."""
    return any(frag in path for frag in PRICE_ROUTES)


def check_permission_access(permissions, global_perms, path, method, is_admin=False):
    """
    Check if a user's V2 permissions allow access to a given route.

    Args:
        permissions: dict {module: {access, can_export, can_import, money_read, money_write}}
        global_perms: dict {can_lock_unlock, can_view_history}
        path: request path
        method: HTTP method
        is_admin: True if user has ADMIN flag

    Returns:
        (allowed, reason) tuple.
    """
    # ADMIN has full access
    if is_admin:
        return True, None

    # Productions CRUD (only direct /api/productions endpoint)
    import re
    if re.match(r'^/api/productions/?$', path) or re.match(r'^/api/productions/\d+/?$', path):
        if method in READ_METHODS:
            return True, None
        else:
            return False, "Only ADMIN can create or modify productions"

    # Departments: all users can read
    tab = get_tab_for_route(path)
    if "/departments" in path and tab is None:
        return True, None

    # Working days: utility, all users can access
    if "/working-days" in path:
        return True, None

    # Health check
    if "/health" in path:
        return True, None

    # Reload: ADMIN only
    if "/reload" in path:
        return False, "Only ADMIN can reload data"

    if tab is None:
        return False, "Access denied"

    # Get module permission
    module_perm = permissions.get(tab)
    if not module_perm or module_perm["access"] == "none":
        return False, f"You do not have access to {tab.upper()}"

    # Export check
    if is_export_route(path):
        if not module_perm.get("can_export"):
            return False, f"You do not have export permission for {tab.upper()}"
        return True, None

    # Import check
    if is_import_route(path) and method not in READ_METHODS:
        if not module_perm.get("can_import"):
            return False, f"You do not have import permission for {tab.upper()}"
        # Import also requires write access
        if module_perm["access"] != "write":
            return False, f"Write access required for import on {tab.upper()}"
        return True, None

    # Price route write check
    if is_price_route(path) and method not in READ_METHODS:
        if not module_perm.get("money_write"):
            return False, f"You do not have permission to modify prices on {tab.upper()}"
        return True, None

    # Write check
    if method not in READ_METHODS:
        if module_perm["access"] != "write":
            return False, f"Read-only access: you cannot modify data on {tab.upper()}"
        return True, None

    # Read access
    return True, None


# --- Backward compatibility ---
# Keep old function signature for any code still calling it during transition

# V1 role-to-tab mapping (kept for reference / fallback)
ROLE_TABS = {
    "UNIT":    {"pdt", "locations", "boats", "picture-boats", "security-boats",
                "transport", "fuel", "labour", "guards", "fnb", "budget"},
    "TRANSPO": {"pdt", "locations", "boats", "picture-boats", "security-boats", "transport", "fuel"},
    "READER":  {"pdt", "locations", "boats", "picture-boats", "security-boats",
                "transport", "fuel", "labour", "guards", "fnb", "budget"},
}


def check_role_access(role, path, method):
    """V1 backward compat: check role-based access. Used during migration."""
    if role == "ADMIN":
        return True, None

    tab = get_tab_for_route(path)

    import re
    if re.match(r'^/api/productions/?$', path) or re.match(r'^/api/productions/\d+/?$', path):
        if method in READ_METHODS:
            return True, None
        else:
            return False, "Only ADMIN can create or modify productions"

    if "/departments" in path and tab is None:
        return True, None
    if "/working-days" in path:
        return True, None
    if "/health" in path:
        return True, None
    if "/reload" in path:
        return False, "Only ADMIN can reload data"

    if tab is None:
        return False, "Access denied"

    allowed_tabs = ROLE_TABS.get(role, set())
    if tab not in allowed_tabs:
        return False, f"Your role ({role}) does not have access to {tab.upper()}"

    if role == "READER":
        if method not in READ_METHODS:
            return False, "Read-only access: you cannot modify data"
        return True, None

    # TRANSPO: read-only on pdt and locations
    if role == "TRANSPO" and tab in ("pdt", "locations"):
        if method not in READ_METHODS:
            return False, "Read-only access: you cannot modify data on this module"
        return True, None

    return True, None


def get_user_allowed_tabs(role):
    """Return the set of tab names accessible to a role (V1 compat)."""
    if role == "ADMIN":
        return {"pdt", "locations", "boats", "picture-boats", "security-boats",
                "transport", "fuel", "labour", "guards", "fnb", "budget", "admin"}
    return ROLE_TABS.get(role, set())
