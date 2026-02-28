"""
data_loader.py — ShootLogix Phase 1
Bootstrap + migration from BATEAUX fleet.db.
"""
import os
import sys
import sqlite3
import json
import math
import shutil
import glob as glob_mod
from datetime import datetime


def _log(msg):
    """Print with immediate flush so Railway logs capture output."""
    print(msg, flush=True)

from database import (
    get_db, get_setting, set_setting,
    create_production, seed_departments,
    create_boat, create_boat_function, create_boat_assignment,
    create_helper, create_helper_assignment,
    create_security_boat, create_security_boat_assignment,
    create_transport_vehicle, create_transport_assignment,
    create_location_site, create_guard_post,
    create_fnb_category, get_fnb_categories,
    create_shooting_day, create_event, get_shooting_days,
    working_days,
    sync_pdt_day_to_locations,
)

BATEAUX_DB = os.path.join(os.path.dirname(__file__), "..", "BATEAUX", "fleet.db")

# ─── Group color map (matches BATEAUX) ────────────────────────────────────────

GROUP_COLORS = {
    "Games":        "#3B82F6",
    "Reality":      "#8B5CF6",
    "Construction": "#F97316",
    "Crew":         "#22C55E",
    "Contestants":  "#06B6D4",
    "Special":      "#EF4444",
}

# ─── category heuristic ───────────────────────────────────────────────────────

def boat_category(wave_rating, group_name, notes):
    wr = (wave_rating or "").lower()
    n  = (notes or "").lower()
    g  = (group_name or "").lower()
    if "dr boat" in wr:
        return "safety"
    if "eq" in n or "cargo" in n or "landing" in n:
        return "cargo"
    return "picture"


# ─── Migration from BATEAUX fleet.db ─────────────────────────────────────────

def migrate_from_bateaux(prod_id, force=False):
    """
    Read BATEAUX fleet.db and populate the ShootLogix schema.
    - boats      → boats (production_id = prod_id)
    - roles      → boat_functions
    - assignments → boat_assignments
    Returns a verification dict comparing budget totals.
    """
    if not os.path.exists(BATEAUX_DB):
        return {"error": f"BATEAUX DB not found at {BATEAUX_DB}"}

    src = sqlite3.connect(BATEAUX_DB)
    src.row_factory = sqlite3.Row

    # ── Clear existing data for this production if force ──────────────────────
    if force:
        with get_db() as conn:
            conn.execute("DELETE FROM boat_assignments WHERE boat_function_id IN "
                         "(SELECT id FROM boat_functions WHERE production_id=?)", (prod_id,))
            conn.execute("DELETE FROM boat_functions WHERE production_id=?", (prod_id,))
            conn.execute("DELETE FROM boats WHERE production_id=?", (prod_id,))

    # ── 1. Migrate boats ──────────────────────────────────────────────────────
    src_boats = src.execute("SELECT * FROM boats ORDER BY boat_nr, id").fetchall()
    old_to_new_boat = {}  # old_id → new_id

    for b in src_boats:
        b = dict(b)
        # Map pax → capacity (old column name was "pax")
        capacity = b.get("pax") or b.get("capacity")
        new_id = create_boat({
            "production_id":       prod_id,
            "boat_nr":             b.get("boat_nr"),
            "name":                b["name"],
            "category":            boat_category(b.get("wave_rating"), b.get("group_name"), b.get("notes")),
            "capacity":            str(capacity) if capacity else None,
            "night_ok":            b.get("night_ok", 0),
            "wave_rating":         b.get("wave_rating", "Waves"),
            "captain":             b.get("captain"),
            "group_name":          b.get("group_name", "Shared"),
            "notes":               b.get("notes"),
            "daily_rate_estimate": b.get("daily_price", 0) or 0,
            "daily_rate_actual":   None,
            "image_path":          b.get("image_path"),
        })
        old_to_new_boat[b["id"]] = new_id

    # ── 2. Migrate roles → boat_functions ────────────────────────────────────
    src_roles = src.execute("SELECT * FROM roles ORDER BY sort_order, id").fetchall()
    old_to_new_func = {}  # old_role_id → new_func_id

    for r in src_roles:
        r = dict(r)
        group = r.get("role_group") or "Special"
        color = GROUP_COLORS.get(group, "#EF4444")
        new_id = create_boat_function({
            "production_id": prod_id,
            "name":          r["name"],
            "function_group": group,
            "color":         color,
            "sort_order":    r.get("sort_order", 0),
            "default_start": r.get("default_start"),
            "default_end":   r.get("default_end"),
            "specs":         r.get("specs"),
        })
        old_to_new_func[r["id"]] = new_id

    # ── 3. Migrate assignments ────────────────────────────────────────────────
    src_assignments = src.execute("SELECT * FROM assignments ORDER BY id").fetchall()
    migrated = 0

    for a in src_assignments:
        a = dict(a)
        new_func_id = old_to_new_func.get(a["role_id"])
        if not new_func_id:
            continue

        new_boat_id = old_to_new_boat.get(a.get("boat_id"))

        # BATEAUX budget always used boat.daily_price, ignoring assignment.daily_price.
        # In ShootLogix the equivalent is boat.daily_rate_estimate (already migrated).
        # price_override stays None so the boat's rate is used automatically.
        price_override = None

        create_boat_assignment({
            "boat_function_id":   new_func_id,
            "boat_id":            new_boat_id,
            "boat_name_override": a.get("boat_name_override"),
            "start_date":         a.get("start_date"),
            "end_date":           a.get("end_date"),
            "price_override":     price_override,
            "notes":              a.get("notes"),
        })
        migrated += 1

    src.close()

    # ── 4. Verify budget ──────────────────────────────────────────────────────
    bateaux_total = _compute_bateaux_reference_total()
    shootlogix_total = _compute_shootlogix_total(prod_id)
    match = abs(bateaux_total - shootlogix_total) < 0.01

    return {
        "boats_migrated":        len(old_to_new_boat),
        "functions_migrated":    len(old_to_new_func),
        "assignments_migrated":  migrated,
        "budget_verification": {
            "bateaux_reference":   round(bateaux_total, 2),
            "shootlogix_result":   round(shootlogix_total, 2),
            "match":               match,
            "delta":               round(abs(bateaux_total - shootlogix_total), 2),
        },
    }


def _compute_bateaux_reference_total():
    """Compute grand total from the original BATEAUX fleet.db."""
    if not os.path.exists(BATEAUX_DB):
        return 0.0
    src = sqlite3.connect(BATEAUX_DB)
    src.row_factory = sqlite3.Row
    rows = src.execute("""
        SELECT a.start_date, a.end_date, b.daily_price
        FROM assignments a
        LEFT JOIN boats b ON a.boat_id = b.id
    """).fetchall()
    src.close()
    total = 0.0
    for r in rows:
        s, e, p = r["start_date"], r["end_date"], r["daily_price"] or 0
        total += working_days(s, e) * p
    return total


def _compute_shootlogix_total(prod_id):
    """Compute grand total from ShootLogix boat_assignments for this production."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT ba.start_date, ba.end_date, ba.price_override,
                   b.daily_rate_estimate
            FROM boat_assignments ba
            LEFT JOIN boats b ON ba.boat_id = b.id
            JOIN boat_functions bf ON ba.boat_function_id = bf.id
            WHERE bf.production_id = ?
        """, (prod_id,)).fetchall()
    total = 0.0
    for r in rows:
        r = dict(r)
        rate = r.get("price_override") or r.get("daily_rate_estimate") or 0
        total += working_days(r["start_date"], r["end_date"]) * rate
    return total


# ─── Bootstrap ────────────────────────────────────────────────────────────────

def _seed_picture_boats(prod_id):
    """Ensure the 4 Picture Boats function groups exist. Safe to call multiple times."""
    with get_db() as conn:
        existing_pb = conn.execute(
            "SELECT id FROM boat_functions WHERE production_id=? AND context='picture'",
            (prod_id,)
        ).fetchall()
    if not existing_pb:
        pb_funcs = [
            {'name': 'YELLOW', 'function_group': 'YELLOW', 'color': '#EAB308', 'sort_order': 1},
            {'name': 'RED',    'function_group': 'RED',    'color': '#EF4444', 'sort_order': 2},
            {'name': 'NEUTRAL','function_group': 'NEUTRAL','color': '#94A3B8', 'sort_order': 3},
            {'name': 'EXILE',  'function_group': 'EXILE',  'color': '#8B5CF6', 'sort_order': 4},
        ]
        for f in pb_funcs:
            create_boat_function({**f, 'production_id': prod_id, 'context': 'picture'})
        print(f"  Seeded 4 Picture Boats functions (YELLOW/RED/NEUTRAL/EXILE)")


def _backup_db():
    """Create a timestamped backup of the database before destructive migrations.
    Keeps the 5 most recent backups."""
    from database import DB_PATH
    if not os.path.exists(DB_PATH):
        return
    backup_dir = os.path.join(os.path.dirname(DB_PATH), "backups")
    os.makedirs(backup_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = os.path.join(backup_dir, f"shootlogix_backup_{ts}.db")
    shutil.copy2(DB_PATH, dest)
    print(f"  DB backup saved: {dest}")
    # Keep only 5 most recent backups
    backups = sorted(glob_mod.glob(os.path.join(backup_dir, "shootlogix_backup_*.db")))
    for old in backups[:-5]:
        os.remove(old)


def _needs_destructive_migration():
    """Check if any destructive migration is pending (flag not yet set)."""
    flags = ["pdt_full_seed_v1", "boat_meeting_feb25_v1", "boat_update_feb27_v1", "boat_update_mar_v1"]
    pending = [f for f in flags if not get_setting(f)]
    if pending:
        print(f"  WARNING: Destructive migrations pending (flags not set): {pending}")
    return len(pending) > 0


def bootstrap():
    """
    Called on first launch.
    Creates the KLAS7 production and migrates data from BATEAUX if not already done.
    Always ensures picture boats functions are seeded.

    MIGRATION SAFETY RULES:
    1. Every destructive migration MUST use a setting flag (get_setting/set_setting)
    2. _backup_db() is called automatically before any pending destructive migration
    3. NEVER delete user-created data — only ADD or UPDATE with merge logic
    4. Preserve day_overrides when updating assignments
    """
    from database import DB_PATH as _dbp
    _log(f"ShootLogix: DB_PATH={_dbp} exists={os.path.exists(_dbp)} size={os.path.getsize(_dbp) if os.path.exists(_dbp) else 0}")
    # Check /data directory
    if os.path.exists('/data'):
        _log(f"ShootLogix: /data contents={os.listdir('/data')}")
    else:
        _log("ShootLogix: /data directory does NOT exist!")

    existing_prod_id = get_setting("klas7_production_id")
    if existing_prod_id:
        prod_id = int(existing_prod_id)
        # Diagnostic: log migration flag status on every startup
        flags = {
            "pdt_full_seed_v1": get_setting("pdt_full_seed_v1"),
            "pdt_location_sync_v1": get_setting("pdt_location_sync_v1"),
            "boat_meeting_feb25_v1": get_setting("boat_meeting_feb25_v1"),
            "boat_update_feb27_v1": get_setting("boat_update_feb27_v1"),
            "boat_update_mar_v1": get_setting("boat_update_mar_v1"),
        }
        _log(f"ShootLogix: KLAS7 prod={prod_id} | flags={flags}")
        # Backup DB before any destructive migration
        if _needs_destructive_migration():
            _backup_db()
        _seed_picture_boats(prod_id)
        _seed_location_sites(prod_id)
        _seed_guard_posts(prod_id)
        _seed_fnb_categories(prod_id)
        _seed_pdt_days(prod_id)
        _sync_pdt_locations(prod_id)
        _migrate_boat_meeting_feb25(prod_id)
        _migrate_boat_update_feb27(prod_id)
        _migrate_boat_update_mar(prod_id)
        return prod_id

    # First-time setup — backup before destructive migrations
    if _needs_destructive_migration():
        _backup_db()

    print("ShootLogix: bootstrapping KLAS7 production…")
    prod_id = create_production({
        "name":       "KLAS7",
        "start_date": "2026-02-20",
        "end_date":   "2026-05-04",
        "site":       "Panama",
        "status":     "active",
    })
    seed_departments(prod_id)
    set_setting("klas7_production_id", str(prod_id))

    result = migrate_from_bateaux(prod_id)
    print(f"  Migrated: {result.get('boats_migrated')} boats, "
          f"{result.get('functions_migrated')} functions, "
          f"{result.get('assignments_migrated')} assignments")

    bv = result.get("budget_verification", {})
    if bv.get("match"):
        print(f"  Budget OK: {bv['shootlogix_result']} (matches BATEAUX reference)")
    else:
        print(f"  Budget MISMATCH — BATEAUX={bv.get('bateaux_reference')} "
              f"ShootLogix={bv.get('shootlogix_result')} "
              f"delta={bv.get('delta')}")

    _seed_picture_boats(prod_id)
    _seed_helpers(prod_id)
    _seed_security_boats(prod_id)
    _seed_transport(prod_id)
    _seed_location_sites(prod_id)
    _seed_guard_posts(prod_id)
    _seed_fnb_categories(prod_id)
    _seed_pdt_days(prod_id)
    _sync_pdt_locations(prod_id)
    _migrate_boat_meeting_feb25(prod_id)
    _migrate_boat_update_feb27(prod_id)
    _migrate_boat_update_mar(prod_id)

    # Verify settings were persisted
    verify = get_setting("klas7_production_id")
    _log(f"ShootLogix: bootstrap complete. prod_id_setting={verify}, DB_PATH={_dbp}, size={os.path.getsize(_dbp) if os.path.exists(_dbp) else 'N/A'}")
    return prod_id


# ─── Seed Helpers ────────────────────────────────────────────────────────────

HELPER_GROUPS = {
    'ART':         {'color': '#F97316', 'sort': 1},
    'BASECAMP':    {'color': '#22C55E', 'sort': 2},
    'GAMES':       {'color': '#3B82F6', 'sort': 3},
    'REALITY':     {'color': '#8B5CF6', 'sort': 4},
    'SAFETY':      {'color': '#EF4444', 'sort': 5},
    'TECH':        {'color': '#06B6D4', 'sort': 6},
    'BODY DOUBLE': {'color': '#EC4899', 'sort': 7},
}

HELPER_DATA = [
    # ART helpers (15)
    *[{'name': f'HELPER - ART {i:02d}', 'group': 'ART', 'rate': 45, 'start': '2026-02-25', 'end': '2026-04-25'} for i in range(1, 16)],
    # BASECAMP helpers (6)
    {'name': 'HELPER - BASECAMP 01', 'group': 'BASECAMP', 'rate': 45, 'start': '2026-02-21', 'end': '2026-04-30'},
    {'name': 'HELPER - BASECAMP 02', 'group': 'BASECAMP', 'rate': 45, 'start': '2026-02-21', 'end': '2026-04-30'},
    {'name': 'HELPER - BASECAMP 03', 'group': 'BASECAMP', 'rate': 45, 'start': '2026-02-21', 'end': '2026-04-30'},
    {'name': 'HELPER - BASECAMP 04', 'group': 'BASECAMP', 'rate': 45, 'start': '2026-02-21', 'end': '2026-04-30'},
    {'name': 'HELPER - BASECAMP 05', 'group': 'BASECAMP', 'rate': 45, 'start': '2026-02-21', 'end': '2026-03-31'},
    {'name': 'HELPER - BASECAMP 06', 'group': 'BASECAMP', 'rate': 45, 'start': '2026-02-21', 'end': '2026-03-31'},
    # GAMES SETUP/WRAP helpers (16)
    *[{'name': f'HELPER - GAMES {i:02d}', 'group': 'GAMES', 'rate': 45,
       'start': '2026-02-25' if i <= 10 else '2026-03-20',
       'end': '2026-04-30'} for i in range(1, 17)],
    # REALITY helpers (8)
    *[{'name': f'HELPER - REALITY {i:02d}', 'group': 'REALITY', 'rate': 45, 'start': '2026-02-25', 'end': '2026-04-30'} for i in range(1, 9)],
    # SAFETY helpers (4, 2 are coconut)
    {'name': 'HELPER - SAFETY 01', 'group': 'SAFETY', 'rate': 45, 'start': '2026-02-25', 'end': '2026-04-30'},
    {'name': 'HELPER - SAFETY 02', 'group': 'SAFETY', 'rate': 45, 'start': '2026-02-25', 'end': '2026-04-30'},
    {'name': 'HELPER - SAFETY 03 (coconut)', 'group': 'SAFETY', 'rate': 45, 'start': '2026-02-25', 'end': '2026-04-30'},
    {'name': 'HELPER - SAFETY 04 (coconut)', 'group': 'SAFETY', 'rate': 45, 'start': '2026-02-25', 'end': '2026-04-30'},
    # TECH helpers (6)
    *[{'name': f'TECH HELPER {i:02d}', 'group': 'TECH', 'rate': 45, 'start': '2026-02-25', 'end': '2026-05-01'} for i in range(1, 7)],
    # BODY DOUBLES (18)
    {'name': 'BODY DOUBLE 01 - HEAD', 'group': 'BODY DOUBLE', 'rate': 125, 'start': '2026-03-14', 'end': '2026-04-26', 'vendor': 'SASKIA EISELE'},
    *[{'name': f'BODY DOUBLE {i:02d}', 'group': 'BODY DOUBLE',
       'rate': 75,
       'start': '2026-03-14' if i <= 11 else '2026-03-19',
       'end': '2026-04-26' if i <= 13 else '2026-04-14'} for i in range(2, 19)],
]


def _seed_helpers(prod_id):
    """Seed helpers + functions + assignments from budget data."""
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM boat_functions WHERE production_id=? AND context='helpers'",
            (prod_id,)
        ).fetchall()
    if existing:
        return  # already seeded

    print(f"  Seeding {len(HELPER_DATA)} helper functions...")
    for h in HELPER_DATA:
        group = h['group']
        gi = HELPER_GROUPS.get(group, {'color': '#6B7280', 'sort': 99})
        func_id = create_boat_function({
            'production_id': prod_id,
            'name': h['name'],
            'function_group': group,
            'color': gi['color'],
            'sort_order': gi['sort'],
            'default_start': h['start'],
            'default_end': h['end'],
            'context': 'helpers',
        })
        # Create the assignment with dates and rate
        create_helper_assignment({
            'boat_function_id': func_id,
            'start_date': h['start'],
            'end_date': h['end'],
            'price_override': h['rate'],
            'helper_name_override': h.get('vendor', ''),
        })


# ─── Seed Security Boats ────────────────────────────────────────────────────

SECURITY_BOAT_FUNCS = [
    {'name': 'SAFETY GAMES',   'group': 'SAFETY', 'color': '#EF4444', 'sort': 1, 'start': '2026-03-20', 'end': '2026-04-25'},
    {'name': 'SAFETY COUNCIL', 'group': 'SAFETY', 'color': '#F97316', 'sort': 2, 'start': '2026-03-25', 'end': '2026-04-25'},
    {'name': 'SAFETY ARENA',   'group': 'SAFETY', 'color': '#EAB308', 'sort': 3, 'start': '2026-03-20', 'end': '2026-04-25'},
    {'name': 'SAFETY EVAC',    'group': 'EVAC',   'color': '#DC2626', 'sort': 4, 'start': '2026-02-23', 'end': '2026-04-30'},
    {'name': 'SAFETY MEDICAL', 'group': 'MEDICAL','color': '#22C55E', 'sort': 5, 'start': '2026-02-23', 'end': '2026-05-04'},
    {'name': 'SAFETY STANDBY', 'group': 'STANDBY','color': '#3B82F6', 'sort': 6, 'start': '2026-03-20', 'end': '2026-04-25'},
]


def _seed_security_boats(prod_id):
    """Seed security boat functions."""
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM boat_functions WHERE production_id=? AND context='security'",
            (prod_id,)
        ).fetchall()
    if existing:
        return

    print(f"  Seeding {len(SECURITY_BOAT_FUNCS)} security boat functions...")
    for f in SECURITY_BOAT_FUNCS:
        create_boat_function({
            'production_id': prod_id,
            'name': f['name'],
            'function_group': f['group'],
            'color': f['color'],
            'sort_order': f['sort'],
            'default_start': f['start'],
            'default_end': f['end'],
            'context': 'security',
        })


# ─── Seed Transport ─────────────────────────────────────────────────────────

TRANSPORT_DATA = [
    # Pickup trucks
    {'name': 'PICKUP 1 - UNIT KAHINA',   'type': 'PICK UP', 'vendor': 'AUTOMARKET', 'rate': 54, 'group': 'UNIT'},
    {'name': 'PICKUP 2 - SAFETY EVE',    'type': 'PICK UP', 'vendor': 'AUTOMARKET', 'rate': 54, 'group': 'UNIT'},
    {'name': 'PICKUP 3 - ART VINCENT',   'type': 'PICK UP', 'vendor': 'AUTOMARKET', 'rate': 54, 'group': 'CONSTRUCTION'},
    {'name': 'PICKUP 4 - ART WORKSHOP',  'type': 'PICK UP', 'vendor': 'AUTOMARKET', 'rate': 54, 'group': 'CONSTRUCTION'},
    {'name': 'PICKUP 5 - ART WORKSHOP',  'type': 'PICK UP', 'vendor': 'AUTOMARKET', 'rate': 54, 'group': 'CONSTRUCTION'},
    {'name': 'PICKUP 6 - UNIT DOCK/FUEL','type': 'PICK UP', 'vendor': 'AUTOMARKET', 'rate': 54, 'group': 'UNIT'},
    {'name': 'PICKUP 7 - UNIT BASECAMP', 'type': 'PICK UP', 'vendor': 'AUTOMARKET', 'rate': 54, 'group': 'UNIT'},
    {'name': 'PICKUP 8 - MEDICAL',       'type': 'PICK UP', 'vendor': 'AUTOMARKET', 'rate': 54, 'group': 'UNIT'},
    {'name': 'PICKUP 9 - CATERING 1',    'type': 'PICK UP', 'vendor': 'AUTOMARKET', 'rate': 54, 'group': 'UNIT'},
    {'name': 'PICKUP 10 - CATERING 2',   'type': 'PICK UP', 'vendor': 'AUTOMARKET', 'rate': 54, 'group': 'UNIT'},
    # Vans
    {'name': 'VAN 1 - SHUTTLE',  'type': 'VAN', 'vendor': 'AUTOMARKET', 'rate': 55, 'group': 'UNIT'},
    {'name': 'VAN 2 - SHUTTLE',  'type': 'VAN', 'vendor': 'AUTOMARKET', 'rate': 55, 'group': 'UNIT'},
    {'name': 'VAN 3 - SHUTTLE',  'type': 'VAN', 'vendor': 'AUTOMARKET', 'rate': 55, 'group': 'UNIT'},
    # Mules/Carts
    {'name': 'MULES/CARTS',      'type': 'MULE', 'vendor': 'VARIOUS', 'rate': 0, 'group': 'INDIVIDUALS'},
]

TRANSPORT_FUNCS = [
    {'name': 'UNIT KAHINA',       'group': 'UNIT',        'color': '#3B82F6', 'sort': 1, 'start': '2026-03-02', 'end': '2026-04-26'},
    {'name': 'SAFETY EVE',        'group': 'UNIT',        'color': '#3B82F6', 'sort': 2, 'start': '2026-03-02', 'end': '2026-04-26'},
    {'name': 'ART VINCENT',       'group': 'CONSTRUCTION','color': '#F97316', 'sort': 3, 'start': '2026-02-25', 'end': '2026-04-26'},
    {'name': 'ART WORKSHOP 1',    'group': 'CONSTRUCTION','color': '#F97316', 'sort': 4, 'start': '2026-02-25', 'end': '2026-04-26'},
    {'name': 'ART WORKSHOP 2',    'group': 'CONSTRUCTION','color': '#F97316', 'sort': 5, 'start': '2026-02-25', 'end': '2026-04-26'},
    {'name': 'UNIT DOCK/FUEL',    'group': 'UNIT',        'color': '#3B82F6', 'sort': 6, 'start': '2026-03-02', 'end': '2026-04-26'},
    {'name': 'UNIT BASECAMP',     'group': 'UNIT',        'color': '#3B82F6', 'sort': 7, 'start': '2026-03-02', 'end': '2026-04-26'},
    {'name': 'MEDICAL',           'group': 'UNIT',        'color': '#22C55E', 'sort': 8, 'start': '2026-02-23', 'end': '2026-04-26'},
    {'name': 'CATERING 1',        'group': 'UNIT',        'color': '#3B82F6', 'sort': 9, 'start': '2026-03-15', 'end': '2026-04-26'},
    {'name': 'CATERING 2',        'group': 'UNIT',        'color': '#3B82F6', 'sort': 10,'start': '2026-03-15', 'end': '2026-04-26'},
    {'name': 'SHUTTLE 1',         'group': 'UNIT',        'color': '#3B82F6', 'sort': 11,'start': '2026-03-15', 'end': '2026-04-26'},
    {'name': 'SHUTTLE 2',         'group': 'UNIT',        'color': '#3B82F6', 'sort': 12,'start': '2026-03-15', 'end': '2026-04-26'},
    {'name': 'SHUTTLE 3',         'group': 'UNIT',        'color': '#3B82F6', 'sort': 13,'start': '2026-03-15', 'end': '2026-04-26'},
]


def _seed_transport(prod_id):
    """Seed transport vehicles and functions from budget data."""
    with get_db() as conn:
        existing_v = conn.execute(
            "SELECT id FROM transport_vehicles WHERE production_id=?", (prod_id,)
        ).fetchall()
        existing_f = conn.execute(
            "SELECT id FROM boat_functions WHERE production_id=? AND context='transport'",
            (prod_id,)
        ).fetchall()
    if existing_v and existing_f:
        return  # already seeded

    if not existing_v:
        print(f"  Seeding {len(TRANSPORT_DATA)} transport vehicles...")
        for i, v in enumerate(TRANSPORT_DATA, 1):
            create_transport_vehicle({
                'production_id': prod_id,
                'vehicle_nr': i,
                'name': v['name'],
                'type': v['type'],
                'vendor': v['vendor'],
                'group_name': v['group'],
                'daily_rate_estimate': v['rate'],
            })

    if not existing_f:
        print(f"  Seeding {len(TRANSPORT_FUNCS)} transport functions...")
        for f in TRANSPORT_FUNCS:
            create_boat_function({
                'production_id': prod_id,
                'name': f['name'],
                'function_group': f['group'],
                'color': f['color'],
                'sort_order': f['sort'],
                'default_start': f['start'],
                'default_end': f['end'],
                'context': 'transport',
            })


# ─── Seed Location Sites ─────────────────────────────────────────────────────

LOCATION_SITES_SEED = [
    {'name': 'CAMP YELLOW',      'location_type': 'tribal_camp'},
    {'name': 'CAMP RED',         'location_type': 'tribal_camp'},
    {'name': 'ARENA (SABOGA)',   'location_type': 'game'},
    {'name': 'MOGO MOGO 1',     'location_type': 'game'},
    {'name': 'MOGO MOGO 2',     'location_type': 'game'},
    {'name': 'CHAPERA',          'location_type': 'game'},
    {'name': 'FLORAL',           'location_type': 'game'},
    {'name': 'GAMBOA',           'location_type': 'game'},
    {'name': 'CONTADORA',        'location_type': 'reward'},
    {'name': 'VIVEROS',          'location_type': 'reward'},
    {'name': 'SAN AUGUSTIN',     'location_type': 'reward'},
    {'name': 'LAS PERLAS',       'location_type': 'reward'},
]


def _seed_location_sites(prod_id):
    """Seed default location sites if none exist."""
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM locations WHERE production_id=?", (prod_id,)
        ).fetchall()
    if existing:
        return
    print(f"  Seeding {len(LOCATION_SITES_SEED)} location sites...")
    for loc in LOCATION_SITES_SEED:
        create_location_site({
            'production_id': prod_id,
            'name': loc['name'],
            'location_type': loc['location_type'],
        })


# ─── Seed Guard Posts ────────────────────────────────────────────────────────

GUARD_POSTS_SEED = [
    {'name': 'CAMP YELLOW',          'daily_rate': 45},
    {'name': 'CAMP RED',             'daily_rate': 45},
    {'name': 'ARENA (SABOGA)',       'daily_rate': 45},
    {'name': 'COUNCIL (CONTADORA)',  'daily_rate': 45},
    {'name': 'GAME SITE',            'daily_rate': 45},
    {'name': 'BASECAMP',             'daily_rate': 45},
    {'name': 'DOCK CONTADORA',       'daily_rate': 45},
    {'name': 'HOTEL',                'daily_rate': 45},
]


def _seed_guard_posts(prod_id):
    """Seed default guard posts if none exist."""
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM guard_posts WHERE production_id=?", (prod_id,)
        ).fetchall()
    if existing:
        return
    print(f"  Seeding {len(GUARD_POSTS_SEED)} guard posts...")
    for gp in GUARD_POSTS_SEED:
        create_guard_post({
            'production_id': prod_id,
            'name': gp['name'],
            'daily_rate': gp['daily_rate'],
        })


# ─── Seed FNB Categories ──────────────────────────────────────────────────────

DEFAULT_FNB_CATEGORIES = [
    {'name': 'CRAFT',           'color': '#F97316'},
    {'name': 'WATER',           'color': '#3B82F6'},
    {'name': 'SOFT DRINKS',     'color': '#22C55E'},
    {'name': 'JUICES',          'color': '#EAB308'},
    {'name': 'COFFEE & TEA',    'color': '#8B5CF6'},
    {'name': 'SNACKS',          'color': '#EC4899'},
    {'name': 'FRUITS',          'color': '#10B981'},
    {'name': 'REWARDS',         'color': '#EF4444'},
    {'name': 'OTHER',           'color': '#6B7280'},
]


def _seed_fnb_categories(prod_id):
    """Seed default FNB categories if none exist."""
    existing = get_fnb_categories(prod_id)
    if existing:
        return
    print(f"  Seeding {len(DEFAULT_FNB_CATEGORIES)} FNB categories...")
    for i, cat in enumerate(DEFAULT_FNB_CATEGORIES):
        create_fnb_category({
            'production_id': prod_id,
            'name': cat['name'],
            'color': cat['color'],
            'sort_order': i,
        })


# ─── Feature #23: Boat Meeting Feb 25 data update ────────────────────────────

# Canonical boat name mapping: new_name -> list of possible DB matches (case-insensitive)
_BOAT_NAME_ALIASES = {
    'SENORA ESMELDA':   ['boacas 4', 'bocas 4'],       # was assigned as BOACAS 4
    'DONA LUCILA':      ['nina nabelis'],                # was assigned as Nina Nabelis
    'SENOR ESMELDA':    ['pcc4'],                        # was assigned as PCC4
    'CAMILA SUSANA':    ['no to metas'],                 # was assigned as No to metas
    'FIND BOAT: VIP':   ['tengo lo mio'],                # was assigned as Tengo Lo Mio
    'PERICO 1':         ['perico1', 'perico 1', 'ruge leon'],  # Construction 1 was Ruge Leon
    'PCC 2':            ['pcc2', 'perico1'],             # Construction 3 was PERICO1
    'PERICO 2':         ['perico 2', 'construction 2'],  # was assigned as CONSTRUCTION 2
    'BONGO 2':          ['bongo 2', 'bocas 5'],          # Body Double was BOCAS 5
    'QUETZAL':          ['vip'],                          # was assigned as VIP
    'YORIANIS':         ['yoriamis'],                     # was Yoriamis
    'BUENA MAR':        ['bueno mar', 'buena mar'],
    'BOCAS 3':          ['bocas 3'],
    'PERICO 3 (BORUCA)':['boruca', 'perico 3'],
    'BONGO 1':          ['bongo 1', 'bongo'],            # Crew Games 1 was Bongo
    'PCC 3':            ['pcc3'],
    'MISHKA':           ['mishka', 'pcc3'],              # Crew Games 3 was PCC3 but now MISHKA
    'PCC 1':            ['pcc1', 'esmelda'],             # Reality Crew 1 was Esmelda
    'GOD IS LOVE':      ['god is love'],
    'RELAX TIME':       ['rd', 'relax time', 'rd (tbd nathan)'],
    'SAN MIGUEL':       ['san miguel'],
    'DIOS ES PERFECTO': ['dios perfecto', 'dios es perfecto'],
    'BAILA MONO':       ['baila mono'],
    'LEO NENA':         ['leo nena', 'leo neña'],
    'MAS BONGOS':       ['mas bongos'],
}

# The complete assignment data from the Boat Meeting Feb 25
BOAT_MEETING_FEB25_DATA = [
    {'function': 'UNIT GAMES 2',     'boat': 'SENORA ESMELDA',     'price': 481.50, 'start': '2026-03-02', 'end': '2026-04-28', 'pricing': 'standard',  'group': 'Games'},
    {'function': 'UNIT REALITY',     'boat': 'DONA LUCILA',        'price': 300.00, 'start': '2026-02-24', 'end': '2026-04-30', 'pricing': 'standard',  'group': 'Reality'},
    {'function': 'TAXI',             'boat': 'SENOR ESMELDA',      'price': 337.05, 'start': '2026-03-01', 'end': '2026-05-04', 'pricing': 'standard',  'group': 'Special'},
    {'function': 'SAFETY',           'boat': 'CAMILA SUSANA',      'price': 337.05, 'start': '2026-02-24', 'end': '2026-04-26', 'pricing': 'standard',  'group': 'Special'},
    {'function': 'CONSTRUCTIONS 4',  'boat': 'FIND BOAT: VIP',     'price': 300.00, 'start': '2026-03-12', 'end': '2026-04-27', 'pricing': 'standard',  'group': 'Construction'},
    {'function': 'CONSTRUCTION 1',   'boat': 'PERICO 1',           'price': 300.00, 'start': '2026-03-09', 'end': '2026-04-27', 'pricing': 'standard',  'group': 'Construction'},
    {'function': 'CONSTRUCTION 3',   'boat': 'PCC 2',              'price': 674.10, 'start': '2026-03-16', 'end': '2026-04-27', 'pricing': 'standard',  'group': 'Construction'},
    {'function': 'CONSTRUCTION 2',   'boat': 'PERICO 2',           'price': 350.00, 'start': '2026-03-12', 'end': '2026-04-27', 'pricing': 'standard',  'group': 'Construction'},
    {'function': 'BODY DOUBLE',      'boat': 'BONGO 2',            'price': 481.50, 'start': '2026-03-14', 'end': '2026-04-30', 'pricing': 'standard',  'group': 'Special'},
    {'function': 'VIP',              'boat': 'QUETZAL',            'price': 500.00, 'start': '2026-03-18', 'end': '2026-04-25', 'pricing': 'standard',  'group': 'Special'},
    {'function': 'CONTESTANTS 1',    'boat': 'YORIANIS',           'price': 481.50, 'start': '2026-03-19', 'end': '2026-04-26', 'pricing': 'standard',  'group': 'Contestants'},
    {'function': 'CONTESTANTS 2',    'boat': 'BUENA MAR',          'price': 481.50, 'start': '2026-03-19', 'end': '2026-04-26', 'pricing': 'standard',  'group': 'Contestants'},
    {'function': 'CONTESTANTS 3',    'boat': 'BOCAS 3',            'price': 481.50, 'start': '2026-03-19', 'end': '2026-04-15', 'pricing': 'standard',  'group': 'Contestants'},
    {'function': 'UNIT GAMES 1',     'boat': 'PERICO 3 (BORUCA)',  'price': 834.00, 'start': '2026-03-09', 'end': '2026-04-26', 'pricing': 'monthly',   'group': 'Games'},
    {'function': 'CREW GAMES 1',     'boat': 'BONGO 1',            'price': 481.50, 'start': '2026-03-20', 'end': '2026-04-25', 'pricing': 'standard',  'group': 'Crew'},
    {'function': 'CREW GAMES 2',     'boat': 'PCC 3',              'price': 481.50, 'start': '2026-03-20', 'end': '2026-04-25', 'pricing': 'standard',  'group': 'Crew'},
    {'function': 'CREW GAMES 3',     'boat': 'MISHKA',             'price': 434.00, 'start': '2026-03-20', 'end': '2026-04-25', 'pricing': 'standard',  'group': 'Crew'},
    {'function': 'REALITY CREW 1',   'boat': 'PCC 1',              'price': 321.00, 'start': '2026-03-20', 'end': '2026-04-24', 'pricing': 'standard',  'group': 'Crew'},
    {'function': 'REALITY CREW 2',   'boat': 'GOD IS LOVE',        'price': 300.00, 'start': '2026-03-20', 'end': '2026-04-24', 'pricing': 'standard',  'group': 'Crew'},
    {'function': 'REALITY CREW 3 tbc','boat': 'RELAX TIME',        'price': 375.00, 'start': '2026-03-20', 'end': '2026-04-15', 'pricing': 'standard',  'group': 'Crew'},
    {'function': 'EVAC',             'boat': 'RELAX TIME',         'price': 880.00, 'start': '2026-03-22', 'end': '2026-04-26', 'pricing': '24_7',      'group': 'Special'},
    {'function': 'MEDICAL PREP',     'boat': 'RELAX TIME',         'price': 321.00, 'start': '2026-03-05', 'end': '2026-03-24', 'pricing': 'standard',  'group': 'Special'},
    {'function': 'MEDICAL SHOOT',    'boat': 'MISHKA',             'price': 642.00, 'start': '2026-03-20', 'end': '2026-04-25', 'pricing': '24_7',      'group': 'Special'},
    {'function': 'MEDICAL WRAP',     'boat': 'MISHKA',             'price': 321.00, 'start': '2026-04-26', 'end': '2026-05-03', 'pricing': 'standard',  'group': 'Special'},
]

# Boats that should exist in the system (unassigned)
UNASSIGNED_BOATS_FEB25 = [
    'San Miguel', 'Dios Es Perfecto', 'Relax Time', 'Baila Mono', 'Leo Nena', 'Mas Bongos',
]

# ─── Feb 27 Update: Complete boat schedule replacement ───────────────────────
BOAT_UPDATE_FEB27_DATA = [
    {'function': 'UNIT REALITY',      'boat': 'NINA NABELIS',          'price': 300.00, 'start': '2026-02-24', 'end': '2026-04-30', 'pricing': 'standard',  'group': 'Reality'},
    {'function': 'TAXI',              'boat': 'PCC4',                  'price': 337.05, 'start': '2026-03-01', 'end': '2026-05-04', 'pricing': 'standard',  'group': 'Special'},
    {'function': 'SAFETY',            'boat': 'GOD IS LOVE',           'price': 337.05, 'start': '2026-02-24', 'end': '2026-04-26', 'pricing': 'standard',  'group': 'Special'},
    {'function': 'CONSTRUCTIONS 4',   'boat': 'BONGO 3',              'price': 481.50, 'start': '2026-03-16', 'end': '2026-04-27', 'pricing': 'standard',  'group': 'Construction'},
    {'function': 'CONSTRUCTION 1',    'boat': 'RUGE LEON',            'price': 300.00, 'start': '2026-03-09', 'end': '2026-04-27', 'pricing': 'standard',  'group': 'Construction'},
    {'function': 'CONSTRUCTION 3',    'boat': 'PERICO 1',             'price': 674.10, 'start': '2026-03-16', 'end': '2026-04-27', 'pricing': 'standard',  'group': 'Construction'},
    {'function': 'CONSTRUCTION 2',    'boat': 'TBD',                  'price': 350.00, 'start': '2026-03-12', 'end': '2026-04-27', 'pricing': 'standard',  'group': 'Construction'},
    {'function': 'BODY DOUBLE',       'boat': 'BONGO 1',              'price': 481.50, 'start': '2026-03-14', 'end': '2026-04-30', 'pricing': 'standard',  'group': 'Special'},
    {'function': 'VIP',               'boat': 'TBD (Nathan?)',        'price': 500.00, 'start': '2026-03-18', 'end': '2026-04-25', 'pricing': 'standard',  'group': 'Special'},
    {'function': 'CONTESTANTS 1',     'boat': 'YORIANIS',             'price': 481.50, 'start': '2026-03-19', 'end': '2026-04-26', 'pricing': 'standard',  'group': 'Contestants'},
    {'function': 'CONTESTANTS 2',     'boat': 'BUENA MAR',            'price': 481.50, 'start': '2026-03-19', 'end': '2026-04-26', 'pricing': 'standard',  'group': 'Contestants'},
    {'function': 'CONTESTANTS 3',     'boat': 'BOCAS 3',              'price': 481.50, 'start': '2026-03-19', 'end': '2026-04-15', 'pricing': 'standard',  'group': 'Contestants'},
    {'function': 'UNIT GAMES 1',      'boat': 'BORUCA LANDING CRAFT', 'price': 834.00, 'start': '2026-03-09', 'end': '2026-04-26', 'pricing': 'monthly',   'group': 'Games'},
    {'function': 'CREW GAMES 1',      'boat': 'BOCAS 4',              'price': 481.50, 'start': '2026-03-20', 'end': '2026-04-25', 'pricing': 'standard',  'group': 'Crew'},
    {'function': 'CREW GAMES 2',      'boat': 'BOCAS 5',              'price': 481.50, 'start': '2026-03-20', 'end': '2026-04-25', 'pricing': 'standard',  'group': 'Crew'},
    {'function': 'CREW GAMES 3',      'boat': 'PCC3',                 'price': 434.00, 'start': '2026-03-20', 'end': '2026-04-25', 'pricing': 'standard',  'group': 'Crew'},
    {'function': 'REALITY CREW 1',    'boat': 'ESMELDA',              'price': 321.00, 'start': '2026-03-20', 'end': '2026-04-24', 'pricing': 'standard',  'group': 'Crew'},
    {'function': 'REALITY CREW 2',    'boat': 'DIOS PERFECTO',        'price': 300.00, 'start': '2026-03-20', 'end': '2026-04-24', 'pricing': 'standard',  'group': 'Crew'},
    {'function': 'REALITY CREW 3 tbc','boat': 'RD',                   'price': 375.00, 'start': '2026-03-20', 'end': '2026-04-15', 'pricing': 'standard',  'group': 'Crew'},
    {'function': 'EVAC',              'boat': 'EVAC',                 'price': 880.00, 'start': '2026-03-22', 'end': '2026-04-26', 'pricing': '24_7',      'group': 'Special'},
    {'function': 'MEDICAL PREP',      'boat': 'MISHKA',               'price': 321.00, 'start': '2026-03-05', 'end': '2026-03-24', 'pricing': 'standard',  'group': 'Special'},
    {'function': 'MEDICAL SHOOT',     'boat': 'MISHKA 24/7',          'price': 642.00, 'start': '2026-03-20', 'end': '2026-04-25', 'pricing': '24_7',      'group': 'Special'},
    {'function': 'MEDICAL WRAP',      'boat': 'MISHKA',               'price': 321.00, 'start': '2026-04-26', 'end': '2026-05-03', 'pricing': 'standard',  'group': 'Special'},
    {'function': 'EVAC 2',            'boat': 'EVAC BOAT',            'price': 800.00, 'start': '2026-03-20', 'end': '2026-04-25', 'pricing': '24_7',      'group': 'Special'},
]

# ─── Mar Update: Updated boat schedule with vendor + Sunday info ──────────────
BOAT_UPDATE_MAR_DATA = [
    {'function': 'UNIT GAMES 2',      'boat': 'BONGO 2',              'vendor': 'BONGO YACHT CLUB',  'price': 481.50, 'start': '2026-03-02', 'end': '2026-04-28', 'sunday': False,  'group': 'Games'},
    {'function': 'UNIT REALITY',      'boat': 'SEÑORA YOLITZA',       'vendor': 'JOSEPH MENDIETA',   'price': 300.00, 'start': '2026-03-05', 'end': '2026-04-30', 'sunday': True,   'group': 'Reality'},
    {'function': 'TAXI',              'boat': 'PCC4',                 'vendor': 'BONGO YACHT CLUB',  'price': 337.05, 'start': '2026-02-20', 'end': '2026-05-04', 'sunday': True,   'group': 'Special'},
    {'function': 'PREP UNIT (TEMP)',  'boat': 'ULTIMA GAVIOTA',       'vendor': '',                  'price': 300.00, 'start': '2026-02-24', 'end': '2026-02-28', 'sunday': True,   'group': 'Special'},
    {'function': 'PREP UNIT (TEMP)',  'boat': 'DOÑA CRISTO',          'vendor': 'JOSEPH MENDIETA',   'price': 200.00, 'start': '2026-02-25', 'end': '2026-03-05', 'sunday': True,   'group': 'Special'},
    {'function': 'SAFETY',            'boat': 'ESMELDA',              'vendor': 'JUAN AROSEMENA',    'price': 321.00, 'start': '2026-03-05', 'end': '2026-04-26', 'sunday': False,  'group': 'Special'},
    {'function': 'CONSTRUCTIONS 4',   'boat': 'PERICO 1',             'vendor': 'BONGO YACHT CLUB',  'price': 674.10, 'start': '2026-03-12', 'end': '2026-04-27', 'sunday': False,  'group': 'Construction'},
    {'function': 'CONSTRUCTION 1',    'boat': 'RUGE LEON',            'vendor': 'MIRTA DE URRUTIA',  'price': 300.00, 'start': '2026-03-09', 'end': '2026-04-27', 'sunday': False,  'group': 'Construction'},
    {'function': 'CONSTRUCTION 3',    'boat': 'BONGO 3',              'vendor': '',                  'price': 481.50, 'start': '2026-03-16', 'end': '2026-04-27', 'sunday': False,  'group': 'Construction'},
    {'function': 'CONSTRUCTION 2',    'boat': 'NO TE METAS',          'vendor': '',                  'price': 350.00, 'start': '2026-03-12', 'end': '2026-04-27', 'sunday': True,   'group': 'Construction'},
    {'function': 'BODY DOUBLE',       'boat': 'BONGO 1',              'vendor': '',                  'price': 481.50, 'start': '2026-03-14', 'end': '2026-04-30', 'sunday': True,   'group': 'Special'},
    {'function': 'VIP',               'boat': 'TBD (Nathan?)',        'vendor': '',                  'price': 700.00, 'start': '2026-03-18', 'end': '2026-04-25', 'sunday': True,   'group': 'Special'},
    {'function': 'CONTESTANTS 1',     'boat': 'YORIANIS',             'vendor': '',                  'price': 450.00, 'start': '2026-03-19', 'end': '2026-04-26', 'sunday': False,  'group': 'Contestants'},
    {'function': 'CONTESTANTS 2',     'boat': 'BUENA MAR',            'vendor': '',                  'price': 450.00, 'start': '2026-03-19', 'end': '2026-04-26', 'sunday': False,  'group': 'Contestants'},
    {'function': 'CONTESTANTS 3',     'boat': 'BOCAS 3',              'vendor': '',                  'price': 450.00, 'start': '2026-03-19', 'end': '2026-04-15', 'sunday': False,  'group': 'Contestants'},
    {'function': 'UNIT GAMES 1',      'boat': 'BORUCA LANDING CRAFT', 'vendor': '',                  'price': 834.00, 'start': '2026-03-09', 'end': '2026-04-26', 'sunday': True,   'group': 'Games'},
    {'function': 'CREW GAMES 1',      'boat': 'BOCAS 4',              'vendor': '',                  'price': 450.00, 'start': '2026-03-20', 'end': '2026-04-25', 'sunday': False,  'group': 'Crew'},
    {'function': 'CREW GAMES 2',      'boat': 'BOCAS 5',              'vendor': '',                  'price': 450.00, 'start': '2026-03-20', 'end': '2026-04-25', 'sunday': False,  'group': 'Crew'},
    {'function': 'CREW GAMES 3',      'boat': 'PCC3',                 'vendor': '',                  'price': 434.00, 'start': '2026-03-20', 'end': '2026-04-25', 'sunday': False,  'group': 'Crew'},
    {'function': 'REALITY CREW 1',    'boat': 'GOD IS LOVE',          'vendor': '',                  'price': 337.05, 'start': '2026-03-20', 'end': '2026-04-24', 'sunday': True,   'group': 'Crew'},
    {'function': 'REALITY CREW 2',    'boat': 'DIOS PERFECTO',        'vendor': '',                  'price': 300.00, 'start': '2026-03-20', 'end': '2026-04-24', 'sunday': True,   'group': 'Crew'},
    {'function': 'REALITY CREW 3 tbc','boat': 'NIÑA NABELIS',         'vendor': '',                  'price': 300.00, 'start': '2026-03-20', 'end': '2026-04-15', 'sunday': True,   'group': 'Crew'},
    {'function': 'EVAC',              'boat': 'EVAC',                 'vendor': '',                  'price': 880.00, 'start': '2026-03-22', 'end': '2026-04-26', 'sunday': True,   'group': 'Special'},
    {'function': 'MEDICAL PREP',      'boat': 'MISHKA',               'vendor': '',                  'price': 321.00, 'start': '2026-03-05', 'end': '2026-03-19', 'sunday': True,   'group': 'Special'},
    {'function': 'MEDICAL SHOOT',     'boat': 'MISHKA 24/7',          'vendor': '',                  'price': 642.00, 'start': '2026-03-20', 'end': '2026-04-25', 'sunday': True,   'group': 'Special'},
    {'function': 'MEDICAL WRAP',      'boat': 'MISHKA',               'vendor': '',                  'price': 321.00, 'start': '2026-04-26', 'end': '2026-05-03', 'sunday': True,   'group': 'Special'},
]


def _find_boat_by_name(conn, prod_id, canonical_name):
    """Find a boat by canonical name, trying aliases. Returns boat row or None."""
    # Try exact match first (case-insensitive)
    row = conn.execute(
        "SELECT * FROM boats WHERE production_id=? AND LOWER(name)=LOWER(?)",
        (prod_id, canonical_name)
    ).fetchone()
    if row:
        return dict(row)

    # Try aliases
    aliases = _BOAT_NAME_ALIASES.get(canonical_name.upper(), [])
    for alias in aliases:
        row = conn.execute(
            "SELECT * FROM boats WHERE production_id=? AND LOWER(name)=LOWER(?)",
            (prod_id, alias)
        ).fetchone()
        if row:
            return dict(row)
    return None


def _find_or_create_boat(conn, prod_id, canonical_name, daily_rate):
    """Find boat by name/alias or create it. Update daily_rate_estimate. Returns boat_id."""
    boat = _find_boat_by_name(conn, prod_id, canonical_name)
    if boat:
        # Update name to canonical and rate
        conn.execute(
            "UPDATE boats SET name=?, daily_rate_estimate=? WHERE id=?",
            (canonical_name, daily_rate, boat['id'])
        )
        return boat['id']
    else:
        # Create new boat
        cur = conn.execute(
            """INSERT INTO boats (production_id, name, category, daily_rate_estimate, group_name)
               VALUES (?, ?, 'picture', ?, 'Shared')""",
            (prod_id, canonical_name, daily_rate)
        )
        return cur.lastrowid


PDT_SEED_DATA = [
    # D1 — 2026-03-25 Wed
    {'day_number': 1, 'date': '2026-03-25', 'location': 'BOYA ARENA', 'game_name': 'OPENING SEQ',
     'heure_animateur': '11H30', 'heure_game': '12H30',
     'maree_hauteur': '1.3', 'maree_statut': 'D', 'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'location': 'BOYA ARENA', 'name': 'OPENING SEQ',
          'heure_host': '11H30', 'heure_event': '12H30',
          'maree_hauteur': '1.3', 'maree_statut': 'D', 'sort_order': 0},
     ]},
    # D2 — 2026-03-26 Thu
    {'day_number': 2, 'date': '2026-03-26', 'location': 'test2', 'game_name': 'POIDS PARTAGES',
     'heure_rehearsal': '9H15', 'heure_animateur': '11H00', 'heure_game': '12H00',
     'heure_depart_candidats': '10H00',
     'maree_hauteur': '2.45', 'maree_statut': 'D', 'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'location': 'test2', 'name': 'POIDS PARTAGES',
          'heure_rehearsal': '9H15', 'heure_host': '11H00', 'heure_event': '12H00',
          'heure_depart': '10H00',
          'maree_hauteur': '2.45', 'maree_statut': 'D', 'sort_order': 0},
     ]},
    # D3 — 2026-03-27 Fri
    {'day_number': 3, 'date': '2026-03-27', 'location': 'TESTING', 'game_name': 'SOUS PRESSION',
     'conseil_soir': 1, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'location': 'TESTING', 'name': 'SOUS PRESSION', 'sort_order': 0},
         {'event_type': 'council', 'heure_event': '20H50', 'heure_depart': '18H15', 'sort_order': 1},
     ]},
    # D4 — 2026-03-28 Sat
    {'day_number': 4, 'date': '2026-03-28', 'game_name': 'FLORAL',
     'heure_rehearsal': '19H15', 'heure_animateur': '11H30', 'heure_game': '12H00',
     'heure_depart_candidats': '10H45',
     'maree_hauteur': '3.2', 'maree_statut': 'E', 'conseil_soir': 1, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'name': 'FLORAL',
          'heure_rehearsal': '19H15', 'heure_host': '11H30', 'heure_event': '12H00',
          'heure_depart': '10H45',
          'maree_hauteur': '3.2', 'maree_statut': 'E', 'sort_order': 0},
         {'event_type': 'council', 'location': 'CONTADORA',
          'heure_rehearsal': '19H00', 'heure_depart': '18H00', 'sort_order': 1},
     ]},
    # D5 — 2026-03-29 Sun
    {'day_number': 5, 'date': '2026-03-29', 'game_name': 'OFF GAME',
     'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'off', 'name': 'OFF GAME', 'sort_order': 0},
     ]},
    # D6 — 2026-03-30 Mon
    {'day_number': 6, 'date': '2026-03-30', 'location': 'CHAPERA (Tbc)', 'game_name': 'DOS A DOS',
     'heure_rehearsal': '9H15', 'heure_animateur': '10H45', 'heure_game': '11H30',
     'maree_hauteur': '2.4', 'maree_statut': 'M', 'conseil_soir': 1, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'location': 'CHAPERA (Tbc)', 'name': 'DOS A DOS',
          'heure_rehearsal': '9H15', 'heure_host': '10H45', 'heure_event': '11H30',
          'maree_hauteur': '2.4', 'maree_statut': 'M', 'sort_order': 0},
         {'event_type': 'council', 'location': 'CONTADORA',
          'heure_rehearsal': '19H00', 'heure_depart': '18H00', 'sort_order': 1},
     ]},
    # D7 — 2026-03-31 Tue
    {'day_number': 7, 'date': '2026-03-31', 'location': 'MOGO MOGO 1', 'game_name': 'JONCTION - GECKOS',
     'heure_rehearsal': '9H30', 'heure_animateur': '11H15', 'heure_game': '11H45',
     'heure_depart_candidats': '13H00',
     'maree_hauteur': '2', 'maree_statut': 'M', 'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'location': 'MOGO MOGO 1', 'name': 'JONCTION - GECKOS',
          'heure_rehearsal': '9H30', 'heure_host': '11H15', 'heure_event': '11H45',
          'heure_depart': '13H00',
          'maree_hauteur': '2', 'maree_statut': 'M', 'sort_order': 0},
     ]},
    # D8 — 2026-04-01 Wed
    {'day_number': 8, 'date': '2026-04-01', 'location': 'MOGO 2 A', 'game_name': 'AVEUGLES',
     'heure_rehearsal': '9H30', 'heure_animateur': '11H15', 'heure_game': '12H00',
     'maree_hauteur': '1.6', 'maree_statut': 'M', 'conseil_soir': 1, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'location': 'MOGO 2 A', 'name': 'AVEUGLES',
          'heure_rehearsal': '9H30', 'heure_host': '11H15', 'heure_event': '12H00',
          'maree_hauteur': '1.6', 'maree_statut': 'M', 'sort_order': 0},
         {'event_type': 'council', 'location': 'CONTADORA',
          'heure_rehearsal': '19H00', 'heure_depart': '18H00', 'sort_order': 1},
     ]},
    # D9 — 2026-04-02 Thu
    {'day_number': 9, 'date': '2026-04-02', 'location': 'MOGO 2 F', 'game_name': 'ARENA',
     'heure_animateur': '12H30', 'heure_game': '8H45',
     'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'location': 'MOGO 2 F', 'name': 'ARENA',
          'heure_host': '12H30', 'heure_event': '8H45', 'sort_order': 0},
         {'event_type': 'arena', 'location': 'SABOGA',
          'heure_event': '13H30', 'sort_order': 1},
     ]},
    # D10 — 2026-04-03 Fri
    {'day_number': 10, 'date': '2026-04-03', 'location': 'SAN AUGUSTIN', 'game_name': 'RESERVES',
     'heure_rehearsal': '10H00', 'heure_animateur': '12H00', 'heure_game': '12H45',
     'heure_depart_candidats': '14H00',
     'maree_hauteur': '1.16', 'maree_statut': 'M', 'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'location': 'SAN AUGUSTIN', 'name': 'RESERVES',
          'heure_rehearsal': '10H00', 'heure_host': '12H00', 'heure_event': '12H45',
          'heure_depart': '14H00',
          'maree_hauteur': '1.16', 'maree_statut': 'M', 'sort_order': 0},
     ]},
    # D11 — 2026-04-04 Sat
    {'day_number': 11, 'date': '2026-04-04', 'location': 'CONTADORA', 'game_name': 'COUNCIL N°4',
     'heure_rehearsal': '19H15', 'heure_game': '20H00',
     'heure_depart_candidats': '18H00',
     'conseil_soir': 1, 'status': 'brouillon',
     'events': [
         {'event_type': 'council', 'location': 'CONTADORA', 'name': 'COUNCIL N°4',
          'heure_rehearsal': '19H15', 'heure_event': '20H00',
          'heure_depart': '18H00', 'sort_order': 0},
     ]},
    # D12 — 2026-04-05 Sun
    {'day_number': 12, 'date': '2026-04-05', 'game_name': 'OFF GAME',
     'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'off', 'name': 'OFF GAME', 'sort_order': 0},
     ]},
    # D13 — 2026-04-06 Mon
    {'day_number': 13, 'date': '2026-04-06', 'game_name': 'RADEAUX',
     'heure_rehearsal': '10H', 'heure_animateur': '11H30', 'heure_game': '12H',
     'heure_depart_candidats': '13H30',
     'maree_hauteur': '0.44', 'maree_statut': 'E', 'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'name': 'RADEAUX',
          'heure_rehearsal': '10H', 'heure_host': '11H30', 'heure_event': '12H',
          'heure_depart': '13H30',
          'maree_hauteur': '0.44', 'maree_statut': 'E', 'sort_order': 0},
     ]},
    # D14 — 2026-04-07 Tue
    {'day_number': 14, 'date': '2026-04-07', 'location': 'MARTIN PEREZ', 'game_name': 'BELIERS',
     'heure_rehearsal': '10H00', 'heure_animateur': '11H30', 'heure_game': '12H00',
     'maree_hauteur': '0.9', 'maree_statut': 'D', 'conseil_soir': 1, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'location': 'MARTIN PEREZ', 'name': 'BELIERS',
          'heure_rehearsal': '10H00', 'heure_host': '11H30', 'heure_event': '12H00',
          'maree_hauteur': '0.9', 'maree_statut': 'D', 'sort_order': 0},
         {'event_type': 'council', 'location': 'CONTADORA',
          'heure_rehearsal': '19H00', 'heure_depart': '18H00', 'sort_order': 1},
     ]},
    # D15 — 2026-04-08 Wed
    {'day_number': 15, 'date': '2026-04-08', 'location': 'MOGO 2H', 'game_name': 'COURSE PUZZLE',
     'heure_rehearsal': '9H30', 'heure_animateur': '11H00', 'heure_game': '11H30',
     'heure_depart_candidats': '10H15',
     'maree_hauteur': '1.65', 'maree_statut': 'D', 'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'location': 'MOGO 2H', 'name': 'COURSE PUZZLE',
          'heure_rehearsal': '9H30', 'heure_host': '11H00', 'heure_event': '11H30',
          'heure_depart': '10H15',
          'maree_hauteur': '1.65', 'maree_statut': 'D', 'sort_order': 0},
     ]},
    # D16 — 2026-04-09 Thu
    {'day_number': 16, 'date': '2026-04-09', 'game_name': 'REPARTITION',
     'heure_rehearsal': '10H00', 'heure_animateur': '11H30', 'heure_game': '12H00',
     'heure_depart_candidats': '14H00',
     'maree_hauteur': '1.9', 'maree_statut': 'D', 'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'name': 'REPARTITION',
          'heure_rehearsal': '10H00', 'heure_host': '11H30', 'heure_event': '12H00',
          'heure_depart': '14H00',
          'maree_hauteur': '1.9', 'maree_statut': 'D', 'sort_order': 0},
     ]},
    # D17 — 2026-04-10 Fri
    {'day_number': 17, 'date': '2026-04-10', 'location': 'CONTADORA', 'game_name': 'COUNCIL N°6',
     'heure_rehearsal': '19H15', 'heure_game': '20H00',
     'heure_depart_candidats': '18H00',
     'conseil_soir': 1, 'status': 'brouillon',
     'events': [
         {'event_type': 'council', 'location': 'CONTADORA', 'name': 'COUNCIL N°6',
          'heure_rehearsal': '19H15', 'heure_event': '20H00',
          'heure_depart': '18H00', 'sort_order': 0},
     ]},
    # D18 — 2026-04-11 Sat
    {'day_number': 18, 'date': '2026-04-11', 'location': 'MOGO 1 C E', 'game_name': 'CAGE EVASION',
     'conseil_soir': 1, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'location': 'MOGO 1 C E', 'name': 'CAGE EVASION',
          'heure_event': '11H30', 'sort_order': 0},
         {'event_type': 'council', 'name': 'CONSEIL SUR X2: 12H30', 'sort_order': 1},
         {'event_type': 'arena', 'location': 'SABOGA',
          'heure_event': '15H30', 'sort_order': 2},
     ]},
    # D19 — 2026-04-12 Sun
    {'day_number': 19, 'date': '2026-04-12', 'game_name': 'OFF GAME',
     'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'off', 'name': 'OFF GAME', 'sort_order': 0},
     ]},
    # D20 — 2026-04-13 Mon
    {'day_number': 20, 'date': '2026-04-13', 'game_name': 'COMBATTANTS',
     'heure_rehearsal': '10H15', 'heure_animateur': '12H00', 'heure_game': '12H30',
     'heure_depart_candidats': '13H30',
     'maree_hauteur': '3.13', 'maree_statut': 'E', 'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'name': 'COMBATTANTS',
          'heure_rehearsal': '10H15', 'heure_host': '12H00', 'heure_event': '12H30',
          'heure_depart': '13H30',
          'maree_hauteur': '3.13', 'maree_statut': 'E', 'sort_order': 0},
     ]},
    # D21 — 2026-04-14 Tue
    {'day_number': 21, 'date': '2026-04-14', 'location': 'CONTADORA', 'game_name': 'COUNCIL N°7',
     'heure_rehearsal': '19H15', 'heure_game': '20H00',
     'heure_depart_candidats': '18H00',
     'conseil_soir': 1, 'status': 'brouillon',
     'events': [
         {'event_type': 'council', 'location': 'CONTADORA', 'name': 'COUNCIL N°7',
          'heure_rehearsal': '19H15', 'heure_event': '20H00',
          'heure_depart': '18H00', 'sort_order': 0},
     ]},
    # D22 — 2026-04-15 Wed
    {'day_number': 22, 'date': '2026-04-15', 'location': 'MOGO 2 F',
     'heure_rehearsal': '9H15', 'heure_animateur': '10H45', 'heure_game': '11H15',
     'heure_depart_candidats': '10H00',
     'maree_hauteur': '2.25', 'maree_statut': 'M', 'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'location': 'MOGO 2 F',
          'heure_rehearsal': '9H15', 'heure_host': '10H45', 'heure_event': '11H15',
          'heure_depart': '10H00',
          'maree_hauteur': '2.25', 'maree_statut': 'M', 'sort_order': 0},
     ]},
    # D23 — 2026-04-16 Thu
    {'day_number': 23, 'date': '2026-04-16', 'location': 'MOGO 1 I', 'game_name': 'EQUILIBRE S/EAU',
     'heure_rehearsal': '12H15', 'heure_animateur': '14H00', 'heure_game': '14H30',
     'heure_depart_candidats': '13H30',
     'maree_hauteur': '4.13', 'maree_statut': 'E', 'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'location': 'MOGO 1 I', 'name': 'EQUILIBRE S/EAU',
          'heure_rehearsal': '12H15', 'heure_host': '14H00', 'heure_event': '14H30',
          'heure_depart': '13H30',
          'maree_hauteur': '4.13', 'maree_statut': 'E', 'sort_order': 0},
     ]},
    # D24 — 2026-04-17 Fri
    {'day_number': 24, 'date': '2026-04-17', 'location': 'CONTADORA', 'game_name': 'COUNCIL N°8',
     'heure_game': '19H45',
     'heure_depart_candidats': '18H00',
     'conseil_soir': 1, 'status': 'brouillon',
     'events': [
         {'event_type': 'council', 'location': 'CONTADORA', 'name': 'COUNCIL N°8',
          'heure_event': '19H45',
          'heure_depart': '18H00', 'sort_order': 0},
     ]},
    # D25 — 2026-04-18 Sat
    {'day_number': 25, 'date': '2026-04-18', 'game_name': 'COURSE MÉMOIRE',
     'heure_game': '11H30',
     'maree_hauteur': '0.2', 'maree_statut': 'M', 'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'name': 'COURSE MÉMOIRE',
          'heure_event': '11H30',
          'maree_hauteur': '0.2', 'maree_statut': 'M', 'sort_order': 0},
         {'event_type': 'arena', 'location': 'SABOGA',
          'heure_event': '15H30', 'sort_order': 1},
     ]},
    # D26 — 2026-04-19 Sun
    {'day_number': 26, 'date': '2026-04-19', 'game_name': 'OFF GAME',
     'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'off', 'name': 'OFF GAME', 'sort_order': 0},
     ]},
    # D27 — 2026-04-20 Mon
    {'day_number': 27, 'date': '2026-04-20', 'location': 'CHAPERA (Tbc)', 'game_name': 'ESPALIERS',
     'heure_rehearsal': '9H30', 'heure_game': '11H30',
     'conseil_soir': 1, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'location': 'CHAPERA (Tbc)', 'name': 'ESPALIERS',
          'heure_rehearsal': '9H30', 'heure_event': '11H30', 'sort_order': 0},
         {'event_type': 'council', 'location': 'CONTADORA',
          'heure_rehearsal': '19H00', 'heure_depart': '18H00', 'sort_order': 1},
     ]},
    # D28 — 2026-04-21 Tue
    {'day_number': 28, 'date': '2026-04-21', 'location': 'CHAPERA (Tbc)', 'game_name': 'DISQUES',
     'heure_game': '11H30',
     'maree_hauteur': '0.32', 'maree_statut': 'D', 'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'location': 'CHAPERA (Tbc)', 'name': 'DISQUES',
          'heure_event': '11H30',
          'maree_hauteur': '0.32', 'maree_statut': 'D', 'sort_order': 0},
         {'event_type': 'arena', 'location': 'SABOGA',
          'heure_event': '15H30', 'sort_order': 1},
     ]},
    # D29 — 2026-04-22 Wed
    {'day_number': 29, 'date': '2026-04-22', 'game_name': 'COUNCIL N°10',
     'heure_animateur': '10H30', 'heure_game': '11H00',
     'maree_hauteur': '1.65', 'maree_statut': 'D', 'conseil_soir': 1, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'name': 'COUNCIL N°10',
          'heure_host': '10H30', 'heure_event': '11H00',
          'maree_hauteur': '1.65', 'maree_statut': 'D', 'sort_order': 0},
         {'event_type': 'council', 'location': 'CONTADORA',
          'heure_rehearsal': '19H00', 'heure_depart': '18H00', 'sort_order': 1},
     ]},
    # D30 — 2026-04-23 Thu
    {'day_number': 30, 'date': '2026-04-23', 'location': 'MOGO 2 F', 'game_name': 'ARENA',
     'heure_game': '10H00',
     'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'location': 'MOGO 2 F', 'name': 'ARENA',
          'heure_event': '10H00', 'sort_order': 0},
     ]},
    # D31 — 2026-04-24 Fri
    {'day_number': 31, 'date': '2026-04-24',
     'heure_rehearsal': '9H50', 'heure_animateur': '10H30', 'heure_game': '9H15',
     'conseil_soir': 0, 'status': 'brouillon',
     'events': [
         {'event_type': 'game',
          'heure_rehearsal': '9H50', 'heure_host': '10H30', 'heure_event': '9H15',
          'sort_order': 0},
     ]},
    # D32 — 2026-04-25 Sat
    {'day_number': 32, 'date': '2026-04-25', 'game_name': 'COUNCIL N°11',
     'heure_rehearsal': '9H30', 'heure_animateur': '10H00', 'heure_game': '9H00',
     'maree_hauteur': '3.35', 'maree_statut': 'M', 'conseil_soir': 1, 'status': 'brouillon',
     'events': [
         {'event_type': 'game', 'name': 'COUNCIL N°11',
          'heure_rehearsal': '9H30', 'heure_host': '10H00', 'heure_event': '9H00',
          'maree_hauteur': '3.35', 'maree_statut': 'M', 'sort_order': 0},
         {'event_type': 'council', 'location': 'CONTADORA',
          'heure_rehearsal': '19H00', 'heure_depart': '18H00', 'sort_order': 1},
     ]},
]


def _seed_pdt_days(prod_id):
    """Seed the 32 shooting days with full schedule data.
    If blank days already exist (from previous seed), replaces them with complete data.
    Uses migration flag pdt_full_seed_v1 to avoid re-running."""

    # If already migrated to full data, skip
    if get_setting("pdt_full_seed_v1"):
        return

    existing = get_shooting_days(prod_id)
    if existing:
        # Delete existing blank days to replace with full data
        print("  Replacing blank PDT days with full schedule data...")
        with get_db() as conn:
            day_ids = [d['id'] for d in existing]
            for did in day_ids:
                conn.execute("DELETE FROM shooting_day_events WHERE shooting_day_id=?", (did,))
                conn.execute("DELETE FROM shooting_days WHERE id=?", (did,))

    print("  Seeding 32 PDT shooting days with full schedule data...")
    for d in PDT_SEED_DATA:
        events = d.get('events', [])
        day_data = {k: v for k, v in d.items() if k != 'events'}
        day_data['production_id'] = prod_id
        day_id = create_shooting_day(day_data)
        for ev in events:
            ev_copy = dict(ev)
            ev_copy['shooting_day_id'] = day_id
            create_event(ev_copy)

        # Sync locations to location_schedules (creates "F" entries)
        locs = set()
        if day_data.get('location'):
            locs.add(day_data['location'])
        for ev in events:
            if ev.get('location'):
                locs.add(ev['location'])
        if locs and day_data.get('date'):
            sync_pdt_day_to_locations(prod_id, day_data['date'], list(locs))

    set_setting("pdt_full_seed_v1", "1")
    print(f"  Seeded {len(PDT_SEED_DATA)} PDT shooting days with full data")


def _sync_pdt_locations(prod_id):
    """One-time migration: sync all existing PDT shooting days to location_schedules.
    Creates 'F' entries for every location found in PDT events."""
    if get_setting("pdt_location_sync_v1"):
        return

    days = get_shooting_days(prod_id)
    if not days:
        return

    print("  Syncing PDT locations to location_schedules...")
    count = 0
    for d in days:
        locs = set()
        if d.get('location'):
            locs.add(d['location'])
        for ev in d.get('events', []):
            if ev.get('location'):
                locs.add(ev['location'])
        if locs and d.get('date'):
            sync_pdt_day_to_locations(prod_id, d['date'], list(locs))
            count += 1

    set_setting("pdt_location_sync_v1", "1")
    print(f"  Synced locations for {count} PDT days")


def _migrate_boat_meeting_feb25(prod_id):
    """
    Feature #23: Update all boat data based on Boat Meeting Feb 25.
    - Updates boat names, prices, assignments, pricing_types
    - Preserves existing day_overrides
    - Idempotent: uses a setting flag to avoid re-running
    """
    if get_setting("boat_meeting_feb25_v1"):
        return

    print("  [Feature #23] Applying Boat Meeting Feb 25 data update...")

    with get_db() as conn:
        # --- Step 1: Process each assignment row ---
        for row in BOAT_MEETING_FEB25_DATA:
            func_name = row['function']
            boat_name = row['boat']
            price = row['price']
            start = row['start']
            end = row['end']
            pricing = row['pricing']
            group = row['group']

            # Find the function (try exact match, then with name variants)
            func = conn.execute(
                "SELECT * FROM boat_functions WHERE production_id=? AND context='boats' AND name=?",
                (prod_id, func_name)
            ).fetchone()

            # Handle known renames
            if not func and func_name == 'CONSTRUCTIONS 4':
                func = conn.execute(
                    "SELECT * FROM boat_functions WHERE production_id=? AND context='boats' AND name='CONSTRUCTION 4'",
                    (prod_id,)
                ).fetchone()
                if func:
                    conn.execute("UPDATE boat_functions SET name=? WHERE id=?",
                                 ('CONSTRUCTIONS 4', func['id']))

            if not func and func_name == 'MEDICAL SHOOT':
                func = conn.execute(
                    "SELECT * FROM boat_functions WHERE production_id=? AND context='boats' AND name='MEDICAL IN SHOOT'",
                    (prod_id,)
                ).fetchone()
                if func:
                    conn.execute("UPDATE boat_functions SET name=? WHERE id=?",
                                 ('MEDICAL SHOOT', func['id']))

            if not func:
                # Create the function
                cur = conn.execute(
                    """INSERT INTO boat_functions (production_id, name, function_group, color, sort_order, context)
                       VALUES (?, ?, ?, ?, ?, 'boats')""",
                    (prod_id, func_name, group,
                     GROUP_COLORS.get(group, '#EF4444'),
                     99)
                )
                func_id = cur.lastrowid
                print(f"    Created new function: {func_name}")
            else:
                func_id = func['id']
                # Update function group if changed
                if func['function_group'] != group:
                    conn.execute("UPDATE boat_functions SET function_group=? WHERE id=?",
                                 (group, func_id))

            # Find or create the boat entity
            boat_id = _find_or_create_boat(conn, prod_id, boat_name, price)

            # Find existing assignment for this function
            asgn = conn.execute(
                "SELECT * FROM boat_assignments WHERE boat_function_id=?",
                (func_id,)
            ).fetchone()

            if asgn:
                # Update existing assignment, preserving day_overrides
                asgn = dict(asgn)
                existing_overrides = asgn.get('day_overrides', '{}')

                conn.execute(
                    """UPDATE boat_assignments
                       SET boat_id=?, boat_name_override=NULL,
                           start_date=?, end_date=?,
                           price_override=?, pricing_type=?,
                           updated_at=datetime('now')
                       WHERE id=?""",
                    (boat_id, start, end, price, pricing, asgn['id'])
                )
                print(f"    Updated: {func_name} -> {boat_name} (${price}/day, {pricing})")
            else:
                # Create new assignment
                conn.execute(
                    """INSERT INTO boat_assignments
                       (boat_function_id, boat_id, start_date, end_date,
                        price_override, pricing_type, assignment_status, day_overrides)
                       VALUES (?, ?, ?, ?, ?, ?, 'confirmed', '{}')""",
                    (func_id, boat_id, start, end, price, pricing)
                )
                print(f"    Created assignment: {func_name} -> {boat_name} (${price}/day, {pricing})")

        # --- Step 2: Ensure unassigned boats exist ---
        for uboat in UNASSIGNED_BOATS_FEB25:
            existing = _find_boat_by_name(conn, prod_id, uboat)
            if not existing:
                conn.execute(
                    """INSERT INTO boats (production_id, name, category, daily_rate_estimate, group_name)
                       VALUES (?, ?, 'picture', 0, 'Shared')""",
                    (prod_id, uboat)
                )
                print(f"    Added unassigned boat: {uboat}")
            else:
                # Ensure canonical name
                if existing['name'] != uboat:
                    conn.execute("UPDATE boats SET name=? WHERE id=?",
                                 (uboat, existing['id']))

    set_setting("boat_meeting_feb25_v1", "1")
    print("  [Feature #23] Boat Meeting Feb 25 data update complete.")


def _migrate_boat_update_feb27(prod_id):
    """
    Feb 27 update: Replace ALL boat assignments with updated schedule.
    Removes old functions/assignments that are no longer in the list,
    updates existing ones, creates new ones.
    """
    if get_setting("boat_update_feb27_v1"):
        return

    print("  [Update Feb 27] Applying new boat schedule...")

    with get_db() as conn:
        # Step 1: Delete ALL existing boat assignments for this production
        func_ids = [r[0] for r in conn.execute(
            "SELECT id FROM boat_functions WHERE production_id=? AND context='boats'",
            (prod_id,)
        ).fetchall()]
        if func_ids:
            placeholders = ','.join('?' * len(func_ids))
            conn.execute(
                f"DELETE FROM boat_assignments WHERE boat_function_id IN ({placeholders})",
                func_ids
            )
            print(f"    Cleared {len(func_ids)} old function assignments")

        # Step 2: Remove functions no longer in the new list
        new_func_names = {r['function'] for r in BOAT_UPDATE_FEB27_DATA}
        for fid in func_ids:
            func = conn.execute("SELECT name FROM boat_functions WHERE id=?", (fid,)).fetchone()
            if func and func[0] not in new_func_names:
                conn.execute("DELETE FROM boat_functions WHERE id=?", (fid,))
                print(f"    Removed old function: {func[0]}")

        # Step 3: Process each new assignment row
        for row in BOAT_UPDATE_FEB27_DATA:
            func_name = row['function']
            boat_name = row['boat']
            price = row['price']
            start = row['start']
            end = row['end']
            pricing = row['pricing']
            group = row['group']

            # Find or create function
            func = conn.execute(
                "SELECT * FROM boat_functions WHERE production_id=? AND context='boats' AND name=?",
                (prod_id, func_name)
            ).fetchone()

            if not func:
                cur = conn.execute(
                    """INSERT INTO boat_functions (production_id, name, function_group, color, sort_order, context)
                       VALUES (?, ?, ?, ?, ?, 'boats')""",
                    (prod_id, func_name, group,
                     GROUP_COLORS.get(group, '#EF4444'), 99)
                )
                func_id = cur.lastrowid
                print(f"    Created function: {func_name}")
            else:
                func_id = func['id']
                conn.execute(
                    "UPDATE boat_functions SET function_group=?, color=? WHERE id=?",
                    (group, GROUP_COLORS.get(group, '#EF4444'), func_id)
                )

            # Find or create boat
            boat_id = _find_or_create_boat(conn, prod_id, boat_name, price)

            # Create assignment
            conn.execute(
                """INSERT INTO boat_assignments
                   (boat_function_id, boat_id, start_date, end_date,
                    price_override, pricing_type, assignment_status, day_overrides)
                   VALUES (?, ?, ?, ?, ?, ?, 'confirmed', '{}')""",
                (func_id, boat_id, start, end, price, pricing)
            )
            print(f"    {func_name} -> {boat_name} (${price}/day, {start} to {end})")

    set_setting("boat_update_feb27_v1", "1")
    print("  [Update Feb 27] Boat schedule update complete.")


def _migrate_boat_update_mar(prod_id):
    """
    March update: Replace ALL boat assignments with updated schedule.
    Includes vendor info and include_sunday based on SUNDAY? column.
    Removes EVAC 2, adds UNIT GAMES 2 and PREP UNIT (TEMP).
    """
    if get_setting("boat_update_mar_v1"):
        return

    print("  [Update Mar] Applying new boat schedule...")

    with get_db() as conn:
        # Step 1: Delete ALL existing boat assignments for this production
        func_ids = [r[0] for r in conn.execute(
            "SELECT id FROM boat_functions WHERE production_id=? AND context='boats'",
            (prod_id,)
        ).fetchall()]
        if func_ids:
            placeholders = ','.join('?' * len(func_ids))
            conn.execute(
                f"DELETE FROM boat_assignments WHERE boat_function_id IN ({placeholders})",
                func_ids
            )
            print(f"    Cleared {len(func_ids)} old function assignments")

        # Step 2: Remove functions no longer in the new list
        new_func_names = {r['function'] for r in BOAT_UPDATE_MAR_DATA}
        for fid in func_ids:
            func = conn.execute("SELECT name FROM boat_functions WHERE id=?", (fid,)).fetchone()
            if func and func[0] not in new_func_names:
                conn.execute("DELETE FROM boat_functions WHERE id=?", (fid,))
                print(f"    Removed old function: {func[0]}")

        # Step 3: Process each new assignment row
        for row in BOAT_UPDATE_MAR_DATA:
            func_name = row['function']
            boat_name = row['boat']
            price = row['price']
            start = row['start']
            end = row['end']
            include_sunday = 1 if row['sunday'] else 0
            group = row['group']
            vendor = row.get('vendor', '')

            # Find or create function
            func = conn.execute(
                "SELECT * FROM boat_functions WHERE production_id=? AND context='boats' AND name=?",
                (prod_id, func_name)
            ).fetchone()

            if not func:
                cur = conn.execute(
                    """INSERT INTO boat_functions (production_id, name, function_group, color, sort_order, context)
                       VALUES (?, ?, ?, ?, ?, 'boats')""",
                    (prod_id, func_name, group,
                     GROUP_COLORS.get(group, '#EF4444'), 99)
                )
                func_id = cur.lastrowid
                print(f"    Created function: {func_name}")
            else:
                func_id = func['id']
                conn.execute(
                    "UPDATE boat_functions SET function_group=?, color=? WHERE id=?",
                    (group, GROUP_COLORS.get(group, '#EF4444'), func_id)
                )

            # Find or create boat, update vendor
            boat_id = _find_or_create_boat(conn, prod_id, boat_name, price)
            if vendor:
                conn.execute("UPDATE boats SET vendor=? WHERE id=?", (vendor, boat_id))

            # Create assignment
            conn.execute(
                """INSERT INTO boat_assignments
                   (boat_function_id, boat_id, start_date, end_date,
                    price_override, include_sunday, assignment_status, day_overrides)
                   VALUES (?, ?, ?, ?, ?, ?, 'confirmed', '{}')""",
                (func_id, boat_id, start, end, price, include_sunday)
            )
            print(f"    {func_name} -> {boat_name} (${price}/day, sun={'Y' if include_sunday else 'N'}, {start} to {end})")

    set_setting("boat_update_mar_v1", "1")
    print("  [Update Mar] Boat schedule update complete.")


if __name__ == "__main__":
    import os as _os
    _os.chdir(_os.path.dirname(_os.path.abspath(__file__)))
    from database import init_db
    init_db()
    bootstrap()
