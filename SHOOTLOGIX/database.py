"""
database.py — ShootLogix Phase 1
Full schema + data access layer.
"""
import os
import sqlite3
import json
import math
import unicodedata
from datetime import datetime, timedelta
from contextlib import contextmanager

from db_compat import (
    get_db, get_table_columns, get_table_names, is_postgres,
    DATABASE_PATH as DB_PATH,
)


# ─── Entity labels for human-readable history descriptions ───────────────────
_TABLE_LABELS = {
    "shooting_days": "jour de tournage",
    "boats": "bateau",
    "boat_assignments": "assignment bateau",
    "boat_functions": "fonction",
    "picture_boats": "picture boat",
    "picture_boat_assignments": "assignment picture boat",
    "security_boats": "security boat",
    "security_boat_assignments": "assignment security boat",
    "transport_vehicles": "véhicule",
    "transport_assignments": "assignment transport",
    "helpers": "helper",
    "helper_assignments": "assignment helper",
    "guard_camp_workers": "garde",
    "guard_camp_assignments": "assignment garde",
    "fuel_entries": "entrée carburant",
    "fuel_machinery": "engin carburant",
    "locations": "location",
    "location_schedules": "schedule location",
    "guard_location_schedules": "schedule garde",
    "location_sites": "site",
    "guard_posts": "poste de garde",
    "fnb_categories": "catégorie FNB",
    "fnb_items": "item FNB",
    "fnb_entries": "entrée FNB",
    "fnb_tracking": "suivi FNB",
}

# Fields to use as entity "name" for each table
_NAME_FIELDS = {
    "shooting_days": ["date", "day_number"],
    "boats": ["name"],
    "boat_assignments": ["boat_name_override", "boat_id"],
    "boat_functions": ["name"],
    "picture_boats": ["name"],
    "picture_boat_assignments": ["boat_name_override", "boat_id"],
    "security_boats": ["name"],
    "security_boat_assignments": ["boat_name_override", "boat_id"],
    "transport_vehicles": ["name"],
    "transport_assignments": ["vehicle_name_override", "vehicle_id"],
    "helpers": ["name"],
    "helper_assignments": ["helper_name_override", "helper_id"],
    "guard_camp_workers": ["name"],
    "guard_camp_assignments": ["worker_name_override", "worker_id"],
    "fuel_entries": ["source_type", "date"],
    "fuel_machinery": ["name"],
    "locations": ["name"],
    "location_sites": ["name"],
    "guard_posts": ["name"],
    "fnb_categories": ["name"],
    "fnb_items": ["name"],
}

# Fields to skip in update diffs (noisy/internal)
_SKIP_DIFF_FIELDS = {"id", "created_at", "updated_at", "production_id"}


def _extract_entity_name(table_name, data):
    """Extract a human-readable name from record data."""
    if not data:
        return "?"
    d = dict(data) if not isinstance(data, dict) else data
    for field in _NAME_FIELDS.get(table_name, ["name", "id"]):
        val = d.get(field)
        if val is not None and str(val).strip():
            return str(val).strip()
    return str(d.get("id", "?"))


def _generate_human_description(table_name, action, old_data, new_data, nickname=None):
    """Auto-generate a human-readable description for a history entry."""
    who = nickname or "Système"
    label = _TABLE_LABELS.get(table_name, table_name)

    if action == "create":
        name = _extract_entity_name(table_name, new_data)
        return f"{who} a créé {label} '{name}'"

    elif action == "delete":
        name = _extract_entity_name(table_name, old_data)
        return f"{who} a supprimé {label} '{name}'"

    elif action == "update":
        name = _extract_entity_name(table_name, old_data or new_data)
        # Build diff of changed fields
        if old_data and new_data:
            od = dict(old_data) if not isinstance(old_data, dict) else old_data
            nd = dict(new_data) if not isinstance(new_data, dict) else new_data
            changes = []
            for k in nd:
                if k in _SKIP_DIFF_FIELDS:
                    continue
                old_val = od.get(k)
                new_val = nd.get(k)
                if str(old_val) != str(new_val):
                    changes.append(f"{k}: {old_val} → {new_val}")
            if changes:
                detail = ", ".join(changes[:3])
                if len(changes) > 3:
                    detail += f" (+{len(changes)-3})"
                return f"{who} a modifié {label} '{name}' : {detail}"
        return f"{who} a modifié {label} '{name}'"

    elif action == "lock":
        date_val = (new_data or {}).get("date", "?") if isinstance(new_data, dict) else "?"
        return f"{who} a verrouillé le {date_val}"

    elif action == "unlock":
        date_val = (new_data or {}).get("date", "?") if isinstance(new_data, dict) else "?"
        return f"{who} a déverrouillé le {date_val}"

    elif action == "cascade":
        return f"{who} a cascadé un déplacement de {label}"

    else:
        name = _extract_entity_name(table_name, new_data or old_data)
        return f"{who} : {action} sur {label} '{name}'"


def _log_history(conn, table_name, record_id, action, old_data=None, new_data=None,
                 user_id=None, user_nickname=None, human_description=None, production_id=None):
    """Generic history logger. Call within an existing get_db() context.

    Automatically reads user_id/nickname from Flask g context if not provided.
    Automatically generates human_description if not provided.
    """
    # Auto-read user from Flask request context
    if user_id is None or user_nickname is None:
        try:
            from flask import g as _g, has_request_context
            if has_request_context():
                if user_id is None:
                    user_id = getattr(_g, 'user_id', None)
                if user_nickname is None:
                    user_nickname = getattr(_g, 'nickname', None)
        except ImportError:
            pass

    # Auto-extract production_id from the data if not provided
    if production_id is None:
        for src in (new_data, old_data):
            if src:
                d = dict(src) if not isinstance(src, dict) else src
                if "production_id" in d:
                    production_id = d["production_id"]
                    break

    # Serialize data
    old_json = json.dumps(dict(old_data)) if old_data else None
    new_json = json.dumps(dict(new_data)) if new_data else None

    # Auto-generate human description
    if human_description is None:
        old_d = json.loads(old_json) if old_json else None
        new_d = json.loads(new_json) if new_json else None
        human_description = _generate_human_description(
            table_name, action, old_d, new_d, user_nickname
        )

    conn.execute(
        """INSERT INTO history
           (table_name, record_id, action, old_data, new_data,
            user_id, user_nickname, human_description, production_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (table_name, record_id, action, old_json, new_json,
         user_id, user_nickname, human_description, production_id)
    )


def _run_ddl(conn, sql_script):
    """Execute a DDL script on both SQLite and PostgreSQL."""
    if is_postgres():
        conn.executescript(sql_script)  # PgConnectionWrapper handles conversion
    else:
        conn.executescript(sql_script)


def init_db():
    with get_db() as conn:
        _run_ddl(conn, """
-- ═══════════════════════════════════════════════
-- SOCLE COMMUN
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    role          TEXT DEFAULT 'prod'   -- admin / prod / régie
);

CREATE TABLE IF NOT EXISTS productions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    start_date TEXT,
    end_date   TEXT,
    site       TEXT,
    status     TEXT DEFAULT 'draft'    -- draft / active / closed
);

-- PDT : un enregistrement par jour de tournage
CREATE TABLE IF NOT EXISTS shooting_days (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id           INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    date                    TEXT NOT NULL,          -- ISO 8601
    day_number              INTEGER,                -- J1, J2…
    location                TEXT,                   -- Île/spot principal
    game_name               TEXT,
    heure_rehearsal         TEXT,
    heure_animateur         TEXT,                   -- Arrivée Denis
    heure_game              TEXT,
    heure_depart_candidats  TEXT,
    maree_hauteur           REAL,
    maree_statut            TEXT,                   -- E / D / M
    nb_candidats            INTEGER,
    recompense              TEXT,
    conseil_soir            INTEGER DEFAULT 0,      -- 0/1
    notes                   TEXT,
    status                  TEXT DEFAULT 'brouillon' -- brouillon / validé / modifié
);

-- Evénements d'une journée : game / arena / council / off (un enregistrement par ligne PDT)
CREATE TABLE IF NOT EXISTS shooting_day_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    shooting_day_id INTEGER NOT NULL REFERENCES shooting_days(id) ON DELETE CASCADE,
    sort_order      INTEGER DEFAULT 0,
    event_type      TEXT NOT NULL,  -- game / arena / council / off
    name            TEXT,
    location        TEXT,
    heure_rehearsal TEXT,
    heure_host      TEXT,
    heure_event     TEXT,
    heure_depart    TEXT,
    heure_arrivee   TEXT,
    heure_teaser    TEXT,
    heure_fin       TEXT,
    maree_hauteur   REAL,
    maree_statut    TEXT,
    reward          TEXT,
    notes           TEXT
);

CREATE TABLE IF NOT EXISTS departments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,  -- BOATS / FNB / FUEL / GROUND_TRANSPORT / GUARDS / HELPERS / LOCATIONS / SAFETY_COCO / OUT
    status_global   TEXT DEFAULT 'à_compléter'  -- ok / à_compléter / problème
);

-- ═══════════════════════════════════════════════
-- DÉPARTEMENT : BOATS
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS boats (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id       INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    boat_nr             INTEGER,
    name                TEXT NOT NULL,
    category            TEXT DEFAULT 'picture',  -- picture / security / safety / cargo
    capacity            TEXT,                    -- Pax ("20", "EQ", "?")
    night_ok            INTEGER DEFAULT 0,
    wave_rating         TEXT DEFAULT 'Waves',    -- Waves / Big Waves / High waves / Dr boat
    captain             TEXT,
    vendor              TEXT,
    group_name          TEXT DEFAULT 'Shared',   -- Swedish / Shared / Quebec / External
    notes               TEXT,
    daily_rate_estimate REAL DEFAULT 0,
    daily_rate_actual   REAL,
    image_path          TEXT
);

-- Fonctions permanentes des bateaux (ex-roles dans BATEAUX)
CREATE TABLE IF NOT EXISTS boat_functions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    function_group  TEXT DEFAULT 'Special',  -- Games / Reality / Crew / Contestants / Construction / Special
    color           TEXT DEFAULT '#EF4444',
    sort_order      INTEGER DEFAULT 0,
    default_start   TEXT,
    default_end     TEXT,
    specs           TEXT
);

CREATE TABLE IF NOT EXISTS boat_assignments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    boat_function_id    INTEGER NOT NULL REFERENCES boat_functions(id) ON DELETE CASCADE,
    boat_id             INTEGER REFERENCES boats(id) ON DELETE SET NULL,
    boat_name_override  TEXT,   -- Bateau externe / inconnu
    start_date          TEXT,
    end_date            TEXT,
    price_override      REAL,   -- Écrase daily_rate_estimate si renseigné
    notes               TEXT,
    assignment_status   TEXT DEFAULT 'confirmed',  -- confirmed / estimate / follow_up / off / breakdown
    day_overrides       TEXT DEFAULT '{}',         -- JSON {date: status} pour statut par jour
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════
-- DÉPARTEMENT : PICTURE BOATS (entité séparée)
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS picture_boats (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id       INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    boat_nr             INTEGER,
    name                TEXT NOT NULL,
    capacity            TEXT,
    night_ok            INTEGER DEFAULT 0,
    wave_rating         TEXT DEFAULT 'Waves',
    captain             TEXT,
    vendor              TEXT,
    group_name          TEXT DEFAULT 'Custom',
    notes               TEXT,
    daily_rate_estimate REAL DEFAULT 0,
    daily_rate_actual   REAL,
    image_path          TEXT
);

CREATE TABLE IF NOT EXISTS picture_boat_assignments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    boat_function_id    INTEGER NOT NULL REFERENCES boat_functions(id) ON DELETE CASCADE,
    picture_boat_id     INTEGER REFERENCES picture_boats(id) ON DELETE SET NULL,
    boat_name_override  TEXT,
    start_date          TEXT,
    end_date            TEXT,
    price_override      REAL,
    notes               TEXT,
    assignment_status   TEXT DEFAULT 'confirmed',
    day_overrides       TEXT DEFAULT '{}',
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);

    CREATE TABLE IF NOT EXISTS transport_vehicles (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        production_id       INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
        vehicle_nr          INTEGER,
        name                TEXT NOT NULL,
        type                TEXT DEFAULT 'SUV',
        driver              TEXT,
        vendor              TEXT,
        group_name          TEXT DEFAULT 'UNIT',
        notes               TEXT,
        daily_rate_estimate REAL DEFAULT 0,
        daily_rate_actual   REAL,
        image_path          TEXT
    );

    CREATE TABLE IF NOT EXISTS transport_assignments (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        boat_function_id    INTEGER NOT NULL REFERENCES boat_functions(id) ON DELETE CASCADE,
        vehicle_id          INTEGER REFERENCES transport_vehicles(id) ON DELETE SET NULL,
        vehicle_name_override TEXT,
        start_date          TEXT,
        end_date            TEXT,
        price_override      REAL,
        notes               TEXT,
        assignment_status   TEXT DEFAULT 'confirmed',
        day_overrides       TEXT DEFAULT '{}',
        created_at          TEXT DEFAULT (datetime('now')),
        updated_at          TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fuel_entries (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
        source_type     TEXT NOT NULL,
        assignment_id   INTEGER NOT NULL,
        date            TEXT NOT NULL,
        liters          REAL DEFAULT 0,
        fuel_type       TEXT DEFAULT 'DIESEL',
        UNIQUE(source_type, assignment_id, date)
    );

    CREATE TABLE IF NOT EXISTS fuel_machinery (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
        name            TEXT NOT NULL,
        fuel_type       TEXT DEFAULT 'DIESEL',
        start_date      TEXT,
        end_date        TEXT,
        liters_per_day  REAL DEFAULT 0,
        notes           TEXT,
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now'))
    );

-- ═══════════════════════════════════════════════
-- DÉPARTEMENT : HELPERS
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS helpers (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id       INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    role                TEXT,   -- Captain / Diver / Beach assistant…
    contact             TEXT,
    group_name          TEXT DEFAULT 'GENERAL',
    daily_rate_estimate REAL DEFAULT 0,
    daily_rate_actual   REAL,
    notes               TEXT,
    image_path          TEXT
);

CREATE TABLE IF NOT EXISTS helper_assignments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    boat_function_id    INTEGER NOT NULL REFERENCES boat_functions(id) ON DELETE CASCADE,
    helper_id           INTEGER REFERENCES helpers(id) ON DELETE SET NULL,
    helper_name_override TEXT,
    start_date          TEXT,
    end_date            TEXT,
    price_override      REAL,
    notes               TEXT,
    assignment_status   TEXT DEFAULT 'confirmed',
    day_overrides       TEXT DEFAULT '{}',
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════
-- DÉPARTEMENT : SECURITY BOATS
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS security_boats (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id       INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    boat_nr             INTEGER,
    name                TEXT NOT NULL,
    capacity            TEXT,
    night_ok            INTEGER DEFAULT 0,
    wave_rating         TEXT DEFAULT 'Waves',
    captain             TEXT,
    vendor              TEXT,
    group_name          TEXT DEFAULT 'SAFETY',
    notes               TEXT,
    daily_rate_estimate REAL DEFAULT 0,
    daily_rate_actual   REAL,
    image_path          TEXT
);

CREATE TABLE IF NOT EXISTS security_boat_assignments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    boat_function_id    INTEGER NOT NULL REFERENCES boat_functions(id) ON DELETE CASCADE,
    security_boat_id    INTEGER REFERENCES security_boats(id) ON DELETE SET NULL,
    boat_name_override  TEXT,
    start_date          TEXT,
    end_date            TEXT,
    price_override      REAL,
    notes               TEXT,
    assignment_status   TEXT DEFAULT 'confirmed',
    day_overrides       TEXT DEFAULT '{}',
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);

-- Lie un helper à ses jours de présence
CREATE TABLE IF NOT EXISTS helper_schedules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    helper_id       INTEGER NOT NULL REFERENCES helpers(id) ON DELETE CASCADE,
    shooting_day_id INTEGER NOT NULL REFERENCES shooting_days(id) ON DELETE CASCADE,
    present         INTEGER DEFAULT 1,  -- 0/1
    hours           REAL,               -- Si facturation à l'heure
    notes           TEXT
);

-- ═══════════════════════════════════════════════
-- DÉPARTEMENT : FNB (Food & Beverage)
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fnb_services (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id       INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    shooting_day_id     INTEGER NOT NULL REFERENCES shooting_days(id) ON DELETE CASCADE,
    meal_type           TEXT,   -- petit_déjeuner / déjeuner / dîner / snack
    location            TEXT,
    nb_pax_estimate     INTEGER,
    nb_pax_actual       INTEGER,
    unit_cost_estimate  REAL DEFAULT 0,
    unit_cost_actual    REAL,
    supplier            TEXT,
    notes               TEXT
);

-- ═══════════════════════════════════════════════
-- DÉPARTEMENT : FUEL
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fuel_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    shooting_day_id INTEGER NOT NULL REFERENCES shooting_days(id) ON DELETE CASCADE,
    boat_id         INTEGER REFERENCES boats(id) ON DELETE SET NULL,
    liters_estimate REAL DEFAULT 0,
    liters_actual   REAL,
    price_per_liter REAL DEFAULT 0,
    supplier        TEXT,
    notes           TEXT
);

-- ═══════════════════════════════════════════════
-- DÉPARTEMENT : GROUND TRANSPORT
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vehicles (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id       INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,   -- Van 1 / Pickup…
    type                TEXT DEFAULT 'van',  -- van / pickup / bus / moto
    driver              TEXT,
    capacity            INTEGER,
    daily_rate_estimate REAL DEFAULT 0,
    daily_rate_actual   REAL
);

CREATE TABLE IF NOT EXISTS transport_schedules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id      INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    shooting_day_id INTEGER NOT NULL REFERENCES shooting_days(id) ON DELETE CASCADE,
    mission         TEXT,
    departure_time  TEXT,
    notes           TEXT
);

-- ═══════════════════════════════════════════════
-- DÉPARTEMENT : GUARDS SECURITY
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS guards (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id       INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    company             TEXT,
    daily_rate_estimate REAL DEFAULT 0,
    daily_rate_actual   REAL,
    contact             TEXT
);

CREATE TABLE IF NOT EXISTS guard_schedules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    guard_id        INTEGER NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
    shooting_day_id INTEGER NOT NULL REFERENCES shooting_days(id) ON DELETE CASCADE,
    location        TEXT,
    shift           TEXT DEFAULT 'journée'  -- matin / soir / nuit / journée
);

-- ═══════════════════════════════════════════════
-- DÉPARTEMENT : LOCATIONS
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS locations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,   -- Mogo Mogo / Chapera…
    lat             REAL,
    lng             REAL,
    type            TEXT DEFAULT 'île',  -- île / plage / quai / hôtel
    location_type   TEXT DEFAULT 'game', -- tribal_camp / game / reward
    access_note     TEXT,
    price_p         REAL,            -- Price per Prep day
    price_f         REAL,            -- Price per Filming day
    price_w         REAL,            -- Price per Wrap day
    global_deal     REAL             -- Flat rate (overrides per-day pricing)
);

-- Guard posts (dynamic list of guard positions)
CREATE TABLE IF NOT EXISTS guard_posts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    daily_rate      REAL DEFAULT 45,
    notes           TEXT
);

-- Liaison N-N : shooting_days ↔ locations
CREATE TABLE IF NOT EXISTS shooting_day_locations (
    shooting_day_id INTEGER NOT NULL REFERENCES shooting_days(id) ON DELETE CASCADE,
    location_id     INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    role            TEXT DEFAULT 'principal',  -- principal / backup / conseil
    PRIMARY KEY (shooting_day_id, location_id)
);

-- ═══════════════════════════════════════════════
-- DÉPARTEMENT : LOCATION SCHEDULES (P/F/W grid)
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS location_schedules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    location_name   TEXT NOT NULL,
    location_type   TEXT NOT NULL,  -- 'tribal_camp' | 'game' | 'reward'
    date            TEXT NOT NULL,
    status          TEXT NOT NULL,  -- 'P' | 'F' | 'W'
    locked          INTEGER DEFAULT 0,
    notes           TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(production_id, location_name, date)
);


-- ═══════════════════════════════════════════════
-- DÉPARTEMENT : GUARD LOCATION SCHEDULES (P/F/W)
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS guard_location_schedules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    location_name   TEXT NOT NULL,
    date            TEXT NOT NULL,
    status          TEXT NOT NULL,  -- 'P' | 'F' | 'W'
    nb_guards       INTEGER DEFAULT 1,
    locked          INTEGER DEFAULT 0,
    UNIQUE(production_id, location_name, date)
);

-- ═══════════════════════════════════════════════
-- DÉPARTEMENT : GUARD CAMP (Base Camp guards)
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS guard_camp_workers (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id       INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    role                TEXT,
    contact             TEXT,
    group_name          TEXT DEFAULT 'GENERAL',
    daily_rate_estimate REAL DEFAULT 45,
    daily_rate_actual   REAL,
    notes               TEXT,
    image_path          TEXT
);

CREATE TABLE IF NOT EXISTS guard_camp_assignments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    boat_function_id    INTEGER NOT NULL REFERENCES boat_functions(id) ON DELETE CASCADE,
    helper_id           INTEGER REFERENCES guard_camp_workers(id) ON DELETE SET NULL,
    helper_name_override TEXT,
    start_date          TEXT,
    end_date            TEXT,
    price_override      REAL,
    notes               TEXT,
    assignment_status   TEXT DEFAULT 'confirmed',
    day_overrides       TEXT DEFAULT '{}',
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════
-- DÉPARTEMENT : FNB DAILY TRACKING (legacy)
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fnb_daily_tracking (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    date            TEXT NOT NULL,
    category        TEXT NOT NULL,
    pax_actual      INTEGER DEFAULT 0,
    cost_actual     REAL DEFAULT 0,
    notes           TEXT,
    UNIQUE(production_id, date, category)
);

-- ═══════════════════════════════════════════════
-- DÉPARTEMENT : FNB v2 (dynamic categories/items)
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fnb_categories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    color           TEXT DEFAULT '#F97316',
    sort_order      INTEGER DEFAULT 0,
    UNIQUE(production_id, name)
);

CREATE TABLE IF NOT EXISTS fnb_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id     INTEGER NOT NULL REFERENCES fnb_categories(id) ON DELETE CASCADE,
    production_id   INTEGER NOT NULL,
    name            TEXT NOT NULL,
    unit            TEXT DEFAULT 'unit',
    unit_price      REAL DEFAULT 0,
    notes           TEXT,
    sort_order      INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fnb_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id         INTEGER NOT NULL REFERENCES fnb_items(id) ON DELETE CASCADE,
    production_id   INTEGER NOT NULL,
    entry_type      TEXT NOT NULL,
    date            TEXT NOT NULL,
    quantity        REAL DEFAULT 0,
    notes           TEXT,
    UNIQUE(item_id, entry_type, date)
);

-- ═══════════════════════════════════════════════
-- TRANSVERSAL
-- ═══════════════════════════════════════════════

-- Vision consolidée du budget, auto-alimentée ou manuelle
CREATE TABLE IF NOT EXISTS budget_lines (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id       INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    department_id       INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    name                TEXT NOT NULL,
    unit                TEXT DEFAULT 'jour',  -- jour / repas / litre / forfait
    qty_estimate        REAL DEFAULT 0,
    unit_price_estimate REAL DEFAULT 0,
    amount_estimate     REAL DEFAULT 0,       -- qty × unit_price (calculé)
    qty_actual          REAL,
    unit_price_actual   REAL,
    amount_actual       REAL,                 -- calculé
    source              TEXT DEFAULT 'manual', -- auto / manual / ai_generated
    source_ref          TEXT,                 -- JSON {"table": "boat_assignments", "id": 5}
    notes               TEXT
);

CREATE TABLE IF NOT EXISTS documents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    department_id   INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    doc_type        TEXT,   -- PDT / budget / reference / map_kmz / contract
    format          TEXT,   -- pdf / xlsx / csv / kmz
    file_path       TEXT,
    uploaded_at     TEXT DEFAULT (datetime('now')),
    uploaded_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ai_processed    INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_analyses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    document_ids    TEXT,   -- JSON array
    status          TEXT DEFAULT 'pending',  -- pending / processing / done / error
    result_json     TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS comments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    element_type    TEXT NOT NULL,  -- day / boat / helper / vehicle / guard / budget_line / …
    element_id      INTEGER NOT NULL,
    author_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    text            TEXT NOT NULL,
    is_signal       INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name  TEXT NOT NULL,
    record_id   INTEGER,
    action      TEXT NOT NULL,  -- create / update / delete
    old_data    TEXT,           -- JSON snapshot avant
    new_data    TEXT,           -- JSON snapshot après
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- Fuel locked day price snapshots: stores the diesel/petrol price at lock time
CREATE TABLE IF NOT EXISTS fuel_locked_prices (
    date          TEXT PRIMARY KEY,
    diesel_price  REAL DEFAULT 0,
    petrol_price  REAL DEFAULT 0,
    locked_at     TEXT DEFAULT (datetime('now'))
);

-- Budget snapshots (AXE 6.3): full budget state at a point in time
CREATE TABLE IF NOT EXISTS budget_snapshots (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id   INTEGER NOT NULL REFERENCES productions(id),
    trigger_type    TEXT NOT NULL,         -- 'lock', 'manual', 'scheduled'
    trigger_detail  TEXT,                  -- e.g. locked date or note
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_nickname   TEXT,
    snapshot_data   TEXT NOT NULL,         -- JSON: full budget at time of snapshot
    grand_total_estimate REAL DEFAULT 0,
    grand_total_actual   REAL DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- Price change log (AXE 6.3): tracks every rate/price modification
CREATE TABLE IF NOT EXISTS price_change_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id   INTEGER NOT NULL REFERENCES productions(id),
    entity_type     TEXT NOT NULL,         -- 'boat', 'vehicle', 'helper', 'location', 'guard', 'fnb_item', 'fuel'
    entity_id       INTEGER,
    entity_name     TEXT,
    field_changed   TEXT NOT NULL,         -- 'daily_rate_estimate', 'price_override', 'price_p', etc.
    old_value       REAL,
    new_value       REAL,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_nickname   TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════
-- USER EXPORT PREFERENCES (AXE 2.2)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_export_preferences (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    module          TEXT NOT NULL,          -- 'boats', 'picture_boats', 'security_boats', 'transport', 'labour', 'guards', 'fuel', 'fnb', 'budget'
    last_export_from TEXT,                  -- YYYY-MM-DD
    last_export_to   TEXT,                  -- YYYY-MM-DD
    updated_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, production_id, module)
);

-- ═══════════════════════════════════════════════
-- NOTIFICATIONS (AXE 9.2)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notifications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id   INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            TEXT NOT NULL,          -- 'assignment_created', 'assignment_updated', 'budget_exceeded', 'pdt_modified', 'comment_added'
    title           TEXT NOT NULL,
    body            TEXT,
    entity_type     TEXT,                   -- optional link to entity
    entity_id       INTEGER,
    is_read         INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════
-- INDEXES FOR PERFORMANCE
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_boat_assignments_boat ON boat_assignments(boat_id);
CREATE INDEX IF NOT EXISTS idx_boat_assignments_func ON boat_assignments(boat_function_id);
CREATE INDEX IF NOT EXISTS idx_picture_boat_assignments_boat ON picture_boat_assignments(picture_boat_id);
CREATE INDEX IF NOT EXISTS idx_picture_boat_assignments_func ON picture_boat_assignments(boat_function_id);
CREATE INDEX IF NOT EXISTS idx_security_boat_assignments_boat ON security_boat_assignments(security_boat_id);
CREATE INDEX IF NOT EXISTS idx_security_boat_assignments_func ON security_boat_assignments(boat_function_id);
CREATE INDEX IF NOT EXISTS idx_transport_assignments_vehicle ON transport_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fuel_entries_assignment ON fuel_entries(assignment_id);
CREATE INDEX IF NOT EXISTS idx_fuel_entries_date ON fuel_entries(date);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_boat ON fuel_logs(boat_id);
CREATE INDEX IF NOT EXISTS idx_shooting_days_prod ON shooting_days(production_id);
CREATE INDEX IF NOT EXISTS idx_shooting_days_date ON shooting_days(date);
CREATE INDEX IF NOT EXISTS idx_helper_assignments_func ON helper_assignments(boat_function_id);
CREATE INDEX IF NOT EXISTS idx_helper_assignments_helper ON helper_assignments(helper_id);
CREATE INDEX IF NOT EXISTS idx_helper_schedules_helper ON helper_schedules(helper_id);
CREATE INDEX IF NOT EXISTS idx_helper_schedules_day ON helper_schedules(shooting_day_id);
CREATE INDEX IF NOT EXISTS idx_guard_schedules_guard ON guard_schedules(guard_id);
CREATE INDEX IF NOT EXISTS idx_guard_schedules_day ON guard_schedules(shooting_day_id);
CREATE INDEX IF NOT EXISTS idx_guard_location_schedules_prod ON guard_location_schedules(production_id);
CREATE INDEX IF NOT EXISTS idx_guard_location_schedules_date ON guard_location_schedules(date);
CREATE INDEX IF NOT EXISTS idx_guard_camp_assignments_helper ON guard_camp_assignments(helper_id);
CREATE INDEX IF NOT EXISTS idx_location_schedules_prod ON location_schedules(production_id);
CREATE INDEX IF NOT EXISTS idx_location_schedules_date ON location_schedules(date);
CREATE INDEX IF NOT EXISTS idx_fnb_entries_item ON fnb_entries(item_id);
CREATE INDEX IF NOT EXISTS idx_fnb_daily_tracking_prod ON fnb_daily_tracking(production_id);
CREATE INDEX IF NOT EXISTS idx_fnb_daily_tracking_date ON fnb_daily_tracking(date);
CREATE INDEX IF NOT EXISTS idx_history_table_record ON history(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_history_created ON history(created_at);
CREATE INDEX IF NOT EXISTS idx_budget_lines_prod ON budget_lines(production_id);
CREATE INDEX IF NOT EXISTS idx_documents_prod ON documents(production_id);
CREATE INDEX IF NOT EXISTS idx_budget_snapshots_prod ON budget_snapshots(production_id);
CREATE INDEX IF NOT EXISTS idx_budget_snapshots_created ON budget_snapshots(created_at);
CREATE INDEX IF NOT EXISTS idx_price_change_log_prod ON price_change_log(production_id);
CREATE INDEX IF NOT EXISTS idx_price_change_log_entity ON price_change_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_price_change_log_created ON price_change_log(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_prod ON notifications(production_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read);
        """)

    print("Database initialized — ShootLogix schema v1")
    _migrate_db()


def _migrate_db():
    """Add columns to existing DBs that predate schema additions."""
    with get_db() as conn:
        # boat_assignments.assignment_status
        ba_cols = get_table_columns(conn, 'boat_assignments')
        if 'assignment_status' not in ba_cols:
            conn.execute(
                "ALTER TABLE boat_assignments ADD COLUMN assignment_status TEXT DEFAULT 'confirmed'"
            )
            print("Migration: added boat_assignments.assignment_status")
        if 'day_overrides' not in ba_cols:
            conn.execute(
                "ALTER TABLE boat_assignments ADD COLUMN day_overrides TEXT DEFAULT '{}'"
            )
            print("Migration: added boat_assignments.day_overrides")
        # boats.vendor
        b_cols = get_table_columns(conn, 'boats')
        if 'vendor' not in b_cols:
            conn.execute("ALTER TABLE boats ADD COLUMN vendor TEXT")
            print("Migration: added boats.vendor")
        # boat_functions.context
        bf_cols = get_table_columns(conn, 'boat_functions')
        if 'context' not in bf_cols:
            conn.execute("ALTER TABLE boat_functions ADD COLUMN context TEXT DEFAULT 'boats'")
            print("Migration: added boat_functions.context")
        # helpers.group_name, helpers.image_path
        h_cols = get_table_columns(conn, 'helpers')
        if 'group_name' not in h_cols:
            conn.execute("ALTER TABLE helpers ADD COLUMN group_name TEXT DEFAULT 'GENERAL'")
            print("Migration: added helpers.group_name")
        if 'image_path' not in h_cols:
            conn.execute("ALTER TABLE helpers ADD COLUMN image_path TEXT")
            print("Migration: added helpers.image_path")
        # Rename helpers context to labour
        renamed = conn.execute(
            "UPDATE boat_functions SET context='labour' WHERE context='helpers'"
        ).rowcount
        if renamed:
            print(f"Migration: renamed {renamed} boat_functions context helpers -> labour")
        # locations.location_type
        loc_cols = get_table_columns(conn, 'locations')
        if 'location_type' not in loc_cols:
            conn.execute("ALTER TABLE locations ADD COLUMN location_type TEXT DEFAULT 'game'")
            print("Migration: added locations.location_type")
        # locations pricing columns
        if 'price_p' not in loc_cols:
            conn.execute("ALTER TABLE locations ADD COLUMN price_p REAL")
            conn.execute("ALTER TABLE locations ADD COLUMN price_f REAL")
            conn.execute("ALTER TABLE locations ADD COLUMN price_w REAL")
            conn.execute("ALTER TABLE locations ADD COLUMN global_deal REAL")
            print("Migration: added locations pricing columns (price_p, price_f, price_w, global_deal)")

        # pricing_type on all assignment tables (standard / monthly / 24_7)
        for tbl in ['boat_assignments', 'picture_boat_assignments',
                     'security_boat_assignments', 'transport_assignments',
                     'helper_assignments', 'guard_camp_assignments']:
            try:
                cols = get_table_columns(conn, tbl)
                if 'pricing_type' not in cols:
                    conn.execute(f"ALTER TABLE {tbl} ADD COLUMN pricing_type TEXT DEFAULT 'standard'")
                    print(f"Migration: added {tbl}.pricing_type")
            except Exception:
                pass  # table may not exist yet

        # include_sunday on all assignment tables (replaces pricing_type for calculation)
        for tbl in ['boat_assignments', 'picture_boat_assignments',
                     'security_boat_assignments', 'transport_assignments',
                     'helper_assignments', 'guard_camp_assignments']:
            try:
                cols = get_table_columns(conn, tbl)
                if 'include_sunday' not in cols:
                    conn.execute(f"ALTER TABLE {tbl} ADD COLUMN include_sunday INTEGER DEFAULT 1")
                    # Migrate existing pricing_type values: 'standard' meant Sunday=NO -> include_sunday=0
                    conn.execute(f"UPDATE {tbl} SET include_sunday=0 WHERE pricing_type='standard'")
                    # '24_7' meant Sunday=YES -> include_sunday=1 (already default)
                    print(f"Migration: added {tbl}.include_sunday (migrated from pricing_type)")
            except Exception:
                pass  # table may not exist yet

        # guard_posts: guards_prep / guards_film / guards_wrap (variable guard count per phase)
        gp_cols = get_table_columns(conn, 'guard_posts')
        if 'guards_prep' not in gp_cols:
            conn.execute("ALTER TABLE guard_posts ADD COLUMN guards_prep INTEGER DEFAULT 2")
            conn.execute("ALTER TABLE guard_posts ADD COLUMN guards_film INTEGER DEFAULT 2")
            conn.execute("ALTER TABLE guard_posts ADD COLUMN guards_wrap INTEGER DEFAULT 2")
            print("Migration: added guard_posts.guards_prep/guards_film/guards_wrap")

        # sort_order on entity tables for drag & drop reordering
        for tbl in ['boats', 'picture_boats', 'transport_vehicles', 'helpers',
                     'security_boats', 'guard_camp_workers']:
            try:
                cols = get_table_columns(conn, tbl)
                if 'sort_order' not in cols:
                    conn.execute(f"ALTER TABLE {tbl} ADD COLUMN sort_order INTEGER DEFAULT 0")
                    print(f"Migration: added {tbl}.sort_order")
            except Exception:
                pass

        # AXE4: history enrichment — user_nickname, human_description, production_id
        h_cols = get_table_columns(conn, 'history')
        if 'user_nickname' not in h_cols:
            conn.execute("ALTER TABLE history ADD COLUMN user_nickname TEXT")
            print("Migration: added history.user_nickname")
        if 'human_description' not in h_cols:
            conn.execute("ALTER TABLE history ADD COLUMN human_description TEXT")
            print("Migration: added history.human_description")
        if 'production_id' not in h_cols:
            conn.execute("ALTER TABLE history ADD COLUMN production_id INTEGER")
            print("Migration: added history.production_id")
            # Create index for production_id filtering
            conn.execute("CREATE INDEX IF NOT EXISTS idx_history_prod ON history(production_id)")
            # Create index for user_id filtering
            conn.execute("CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id)")
            print("Migration: added history indexes (production_id, user_id)")

        # AXE 9.1: Migrate comments table — add new columns to existing schema
        c_cols = get_table_columns(conn, 'comments')
        if c_cols:  # table exists
            if 'production_id' not in c_cols:
                conn.execute("ALTER TABLE comments ADD COLUMN production_id INTEGER")
                print("Migration: added comments.production_id")
            if 'entity_type' not in c_cols:
                conn.execute("ALTER TABLE comments ADD COLUMN entity_type TEXT")
                # Migrate from old element_type to entity_type
                if 'element_type' in c_cols:
                    conn.execute("UPDATE comments SET entity_type = element_type WHERE entity_type IS NULL")
                print("Migration: added comments.entity_type (migrated from element_type)")
            if 'entity_id' not in c_cols:
                conn.execute("ALTER TABLE comments ADD COLUMN entity_id INTEGER")
                if 'element_id' in c_cols:
                    conn.execute("UPDATE comments SET entity_id = element_id WHERE entity_id IS NULL")
                print("Migration: added comments.entity_id (migrated from element_id)")
            if 'user_id' not in c_cols:
                conn.execute("ALTER TABLE comments ADD COLUMN user_id INTEGER")
                if 'author_id' in c_cols:
                    conn.execute("UPDATE comments SET user_id = author_id WHERE user_id IS NULL")
                print("Migration: added comments.user_id (migrated from author_id)")
            if 'user_nickname' not in c_cols:
                conn.execute("ALTER TABLE comments ADD COLUMN user_nickname TEXT")
                print("Migration: added comments.user_nickname")
            if 'body' not in c_cols:
                conn.execute("ALTER TABLE comments ADD COLUMN body TEXT")
                if 'text' in c_cols:
                    conn.execute("UPDATE comments SET body = text WHERE body IS NULL")
                print("Migration: added comments.body (migrated from text)")
            # Create indexes
            conn.execute("CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_comments_prod ON comments(production_id)")

        # AXE 9.2: Notifications indexes
        n_cols = get_table_columns(conn, 'notifications')
        if n_cols:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_notifications_prod ON notifications(production_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read)")


# ─── Working days ─────────────────────────────────────────────────────────────

def working_days(start_str, end_str):
    """Legacy Excel formula: ROUNDDOWN(total_days - total_days/7, 0).
    Kept for backward compatibility with the /api/working-days endpoint.
    """
    if not start_str or not end_str:
        return 0
    try:
        start = datetime.strptime(start_str[:10], "%Y-%m-%d").date()
        end   = datetime.strptime(end_str[:10],   "%Y-%m-%d").date()
        total = (end - start).days + 1
        return math.floor(total - total / 7)
    except Exception:
        return 0


def calendar_days(start_str, end_str):
    """Total calendar days from start to end (inclusive). Used for monthly/24_7 pricing."""
    if not start_str or not end_str:
        return 0
    try:
        start = datetime.strptime(start_str[:10], "%Y-%m-%d").date()
        end   = datetime.strptime(end_str[:10],   "%Y-%m-%d").date()
        return max(0, (end - start).days + 1)
    except Exception:
        return 0


def active_working_days(start_str, end_str, day_overrides_json, include_sunday=True):
    """Count actual active days by iterating each day in the date range.

    A day is active if:
    - It is within [start, end] AND not explicitly overridden to 'empty'
    - OR it is outside [start, end] but explicitly overridden to a non-empty status

    If include_sunday is False, Sundays are skipped (unless explicitly overridden to active).
    """
    if not start_str or not end_str:
        return 0

    try:
        overrides = json.loads(day_overrides_json or '{}')
    except Exception:
        overrides = {}

    try:
        start = datetime.strptime(start_str[:10], "%Y-%m-%d").date()
        end   = datetime.strptime(end_str[:10],   "%Y-%m-%d").date()
    except Exception:
        return 0

    # Count days within the range that are not excluded
    count = 0
    current = start
    one_day = timedelta(days=1)
    while current <= end:
        dk = current.strftime("%Y-%m-%d")
        if dk in overrides:
            if overrides[dk] and overrides[dk] != 'empty':
                count += 1
        else:
            # Skip Sundays if not included
            if not include_sunday and current.weekday() == 6:
                current += one_day
                continue
            # Default: day within range is active
            count += 1
        current += one_day

    # Add any override days outside the range that are explicitly active
    s_str = start_str[:10]
    e_str = end_str[:10]
    for dk, status in overrides.items():
        if dk < s_str or dk > e_str:
            if status and status != 'empty':
                count += 1

    return count


def compute_working_days(d):
    """Compute working days for an assignment dict.

    Uses include_sunday flag: if 0/False, Sundays are excluded from the count.
    Always uses active_working_days (day-by-day count respecting day_overrides).
    """
    include_sun = d.get("include_sunday", 1)
    return active_working_days(
        d.get("start_date"), d.get("end_date"),
        d.get("day_overrides", "{}"),
        include_sunday=bool(include_sun)
    )


# ─── Productions ──────────────────────────────────────────────────────────────

def get_productions():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM productions ORDER BY id").fetchall()
        return [dict(r) for r in rows]


def get_production(prod_id):
    with get_db() as conn:
        r = conn.execute("SELECT * FROM productions WHERE id=?", (prod_id,)).fetchone()
        return dict(r) if r else None


def create_production(data):
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO productions (name, start_date, end_date, site, status) VALUES (?,?,?,?,?)",
            (data["name"], data.get("start_date"), data.get("end_date"),
             data.get("site"), data.get("status", "draft"))
        )
        return cur.lastrowid


# ─── Departments ──────────────────────────────────────────────────────────────

DEPT_NAMES = ["BOATS", "FNB", "FUEL", "GROUND_TRANSPORT", "GUARDS",
              "HELPERS", "LOCATIONS", "OUT"]


def seed_departments(prod_id):
    """Create default departments for a production if none exist."""
    with get_db() as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM departments WHERE production_id=?", (prod_id,)
        ).fetchone()[0]
        if count > 0:
            return
        for name in DEPT_NAMES:
            conn.execute(
                "INSERT INTO departments (production_id, name) VALUES (?,?)",
                (prod_id, name)
            )


def get_departments(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM departments WHERE production_id=? ORDER BY id", (prod_id,)
        ).fetchall()
        return [dict(r) for r in rows]


# ─── Shooting days ────────────────────────────────────────────────────────────

def get_shooting_days(prod_id):
    with get_db() as conn:
        days = [dict(r) for r in conn.execute(
            "SELECT * FROM shooting_days WHERE production_id=? ORDER BY date, day_number",
            (prod_id,)
        ).fetchall()]
        if not days:
            return days
        # Load all events for this production in one query
        events = [dict(r) for r in conn.execute(
            """SELECT e.* FROM shooting_day_events e
               JOIN shooting_days sd ON e.shooting_day_id = sd.id
               WHERE sd.production_id = ?
               ORDER BY e.shooting_day_id, e.sort_order""",
            (prod_id,)
        ).fetchall()]
        events_by_day = {}
        for ev in events:
            events_by_day.setdefault(ev['shooting_day_id'], []).append(ev)
        for day in days:
            day['events'] = events_by_day.get(day['id'], [])
        return days


def create_shooting_day(data):
    cols = ["production_id", "date", "day_number", "location", "game_name",
            "heure_rehearsal", "heure_animateur", "heure_game",
            "heure_depart_candidats", "maree_hauteur", "maree_statut",
            "nb_candidats", "recompense", "conseil_soir", "notes", "status"]
    fields = {k: data[k] for k in cols if k in data}
    placeholders = ", ".join("?" * len(fields))
    col_names = ", ".join(fields.keys())
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO shooting_days ({col_names}) VALUES ({placeholders})",
            list(fields.values())
        )
        new_id = cur.lastrowid
        new = conn.execute("SELECT * FROM shooting_days WHERE id=?", (new_id,)).fetchone()
        _log_history(conn, 'shooting_days', new_id, 'create', new_data=new)
        return new_id


def update_shooting_day(day_id, data):
    allowed = ["date", "day_number", "location", "game_name",
               "heure_rehearsal", "heure_animateur", "heure_game",
               "heure_depart_candidats", "maree_hauteur", "maree_statut",
               "nb_candidats", "recompense", "conseil_soir", "notes", "status"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [day_id]
    with get_db() as conn:
        old = conn.execute("SELECT * FROM shooting_days WHERE id=?", (day_id,)).fetchone()
        conn.execute(f"UPDATE shooting_days SET {sets} WHERE id=?", vals)
        new = conn.execute("SELECT * FROM shooting_days WHERE id=?", (day_id,)).fetchone()
        if old:
            _log_history(conn, 'shooting_days', day_id, 'update', old, new)


def delete_shooting_day(day_id):
    with get_db() as conn:
        old = conn.execute("SELECT * FROM shooting_days WHERE id=?", (day_id,)).fetchone()
        if old:
            _log_history(conn, 'shooting_days', day_id, 'delete', old)
        conn.execute("DELETE FROM shooting_days WHERE id=?", (day_id,))


def get_shooting_day(day_id):
    with get_db() as conn:
        r = conn.execute("SELECT * FROM shooting_days WHERE id=?", (day_id,)).fetchone()
        return dict(r) if r else None


# ─── Shooting day events ─────────────────────────────────────────────────────

def get_events_for_day(day_id, conn=None):
    def _fetch(c):
        rows = c.execute(
            "SELECT * FROM shooting_day_events WHERE shooting_day_id=? ORDER BY sort_order",
            (day_id,)
        ).fetchall()
        return [dict(r) for r in rows]
    if conn:
        return _fetch(conn)
    with get_db() as c:
        return _fetch(c)


def create_event(data):
    cols = ["shooting_day_id", "sort_order", "event_type", "name", "location",
            "heure_rehearsal", "heure_host", "heure_event", "heure_depart",
            "heure_arrivee", "heure_teaser", "heure_fin",
            "maree_hauteur", "maree_statut", "reward", "notes"]
    fields = {k: data[k] for k in cols if k in data}
    placeholders = ", ".join("?" * len(fields))
    col_names = ", ".join(fields.keys())
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO shooting_day_events ({col_names}) VALUES ({placeholders})",
            list(fields.values())
        )
        return cur.lastrowid


def update_event(event_id, data):
    allowed = ["sort_order", "event_type", "name", "location",
               "heure_rehearsal", "heure_host", "heure_event", "heure_depart",
               "heure_arrivee", "heure_teaser", "heure_fin",
               "maree_hauteur", "maree_statut", "reward", "notes"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [event_id]
    with get_db() as conn:
        conn.execute(f"UPDATE shooting_day_events SET {sets} WHERE id=?", vals)


def delete_event(event_id):
    with get_db() as conn:
        conn.execute("DELETE FROM shooting_day_events WHERE id=?", (event_id,))


def delete_events_for_day(day_id):
    with get_db() as conn:
        conn.execute("DELETE FROM shooting_day_events WHERE shooting_day_id=?", (day_id,))


# ─── Boats ────────────────────────────────────────────────────────────────────

def get_boats(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM boats WHERE production_id=? ORDER BY sort_order, boat_nr, name",
            (prod_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def create_boat(data):
    cols = ["production_id", "boat_nr", "name", "category", "capacity",
            "night_ok", "wave_rating", "captain", "vendor", "group_name", "notes",
            "daily_rate_estimate", "daily_rate_actual", "image_path"]
    fields = {k: data[k] for k in cols if k in data}
    placeholders = ", ".join("?" * len(fields))
    col_names = ", ".join(fields.keys())
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO boats ({col_names}) VALUES ({placeholders})",
            list(fields.values())
        )
        return cur.lastrowid


def update_boat(boat_id, data):
    allowed = ["boat_nr", "name", "category", "capacity", "night_ok",
               "wave_rating", "captain", "vendor", "group_name", "notes",
               "daily_rate_estimate", "daily_rate_actual", "image_path", "sort_order"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [boat_id]
    with get_db() as conn:
        conn.execute(f"UPDATE boats SET {sets} WHERE id=?", vals)


def delete_boat(boat_id):
    with get_db() as conn:
        conn.execute("DELETE FROM boat_assignments WHERE boat_id=?", (boat_id,))
        conn.execute("DELETE FROM boats WHERE id=?", (boat_id,))


# ─── Boat functions (ex-roles) ────────────────────────────────────────────────

def get_boat_functions(prod_id, context=None):
    with get_db() as conn:
        if context:
            rows = conn.execute(
                "SELECT * FROM boat_functions WHERE production_id=? AND context=? ORDER BY sort_order, id",
                (prod_id, context)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM boat_functions WHERE production_id=? ORDER BY sort_order, id",
                (prod_id,)
            ).fetchall()
        return [dict(r) for r in rows]


def create_boat_function(data):
    cols = ["production_id", "name", "function_group", "color",
            "sort_order", "default_start", "default_end", "specs", "context"]
    fields = {k: data[k] for k in cols if k in data}
    placeholders = ", ".join("?" * len(fields))
    col_names = ", ".join(fields.keys())
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO boat_functions ({col_names}) VALUES ({placeholders})",
            list(fields.values())
        )
        return cur.lastrowid


def update_boat_function(func_id, data):
    allowed = ["name", "function_group", "color", "sort_order",
               "default_start", "default_end", "specs", "context"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [func_id]
    with get_db() as conn:
        conn.execute(f"UPDATE boat_functions SET {sets} WHERE id=?", vals)


def delete_boat_function(func_id):
    with get_db() as conn:
        conn.execute("DELETE FROM boat_assignments WHERE boat_function_id=?", (func_id,))
        conn.execute("DELETE FROM picture_boat_assignments WHERE boat_function_id=?", (func_id,))
        conn.execute("DELETE FROM boat_functions WHERE id=?", (func_id,))


def delete_boat_assignment_by_function(func_id):
    with get_db() as conn:
        conn.execute("DELETE FROM boat_assignments WHERE boat_function_id=?", (func_id,))


# ─── Boat assignments ─────────────────────────────────────────────────────────

def get_boat_assignments(prod_id, context=None):
    """Return assignments enriched with boat and function info."""
    with get_db() as conn:
        where = "WHERE bf.production_id = ?"
        params = [prod_id]
        if context:
            where += " AND bf.context = ?"
            params.append(context)
        rows = conn.execute(f"""
            SELECT ba.*,
                   b.name  AS boat_name,
                   b.capacity AS boat_capacity,
                   b.captain,
                   b.wave_rating,
                   b.image_path,
                   b.boat_nr,
                   b.daily_rate_estimate AS boat_daily_rate_estimate,
                   b.daily_rate_actual   AS boat_daily_rate_actual,
                   b.vendor,
                   bf.name  AS function_name,
                   bf.function_group,
                   bf.color
            FROM boat_assignments ba
            LEFT JOIN boats b         ON ba.boat_id = b.id
            LEFT JOIN boat_functions bf ON ba.boat_function_id = bf.id
            {where}
            ORDER BY bf.sort_order, bf.id
        """, params).fetchall()

        result = []
        for r in rows:
            d = dict(r)
            rate_est = d.get("price_override") or d.get("boat_daily_rate_estimate") or 0
            rate_act = d.get("boat_daily_rate_actual") or 0
            wd = compute_working_days(d)
            d["working_days"]      = wd
            d["amount_estimate"]   = round(wd * rate_est, 2)
            d["amount_actual"]     = round(wd * rate_act, 2) if rate_act else None
            result.append(d)
        return result


def create_boat_assignment(data):
    """Create assignment. Multiple assignments per function are allowed (for different periods).
    If start_date/end_date not provided, auto-fill from boat_function defaults."""
    func_id = data["boat_function_id"]
    with get_db() as conn:
        start_date, end_date = _resolve_assignment_dates(conn, data)
        cur = conn.execute(
            """INSERT INTO boat_assignments
               (boat_function_id, boat_id, boat_name_override, start_date, end_date,
                price_override, notes, assignment_status, day_overrides, pricing_type, include_sunday)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (func_id, data.get("boat_id"), data.get("boat_name_override"),
             start_date, end_date,
             data.get("price_override"), data.get("notes"),
             data.get("assignment_status", "confirmed"),
             data.get("day_overrides", "{}"),
             data.get("pricing_type", "standard"),
             data.get("include_sunday", 1))
        )
        new_id = cur.lastrowid
        new = conn.execute("SELECT * FROM boat_assignments WHERE id=?", (new_id,)).fetchone()
        _log_history(conn, 'boat_assignments', new_id, 'create', new_data=new)
        return new_id


def update_boat_assignment(assignment_id, data):
    """Update an existing assignment (dates, status, notes, boat, price)."""
    allowed = ["start_date", "end_date", "price_override", "notes",
               "assignment_status", "day_overrides", "boat_id", "boat_name_override",
               "pricing_type", "include_sunday"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    fields["updated_at"] = "datetime('now')"
    # Build SET clause — updated_at uses SQL function, others use parameters
    set_parts = []
    vals = []
    for k, v in fields.items():
        if k == "updated_at":
            set_parts.append(f"{k}=datetime('now')")
        else:
            set_parts.append(f"{k}=?")
            vals.append(v)
    vals.append(assignment_id)
    with get_db() as conn:
        old = conn.execute("SELECT * FROM boat_assignments WHERE id=?", (assignment_id,)).fetchone()
        conn.execute(f"UPDATE boat_assignments SET {', '.join(set_parts)} WHERE id=?", vals)
        new = conn.execute("SELECT * FROM boat_assignments WHERE id=?", (assignment_id,)).fetchone()
        if old:
            _log_history(conn, 'boat_assignments', assignment_id, 'update', old, new)


def delete_boat_assignment(assignment_id):
    with get_db() as conn:
        old = conn.execute("SELECT * FROM boat_assignments WHERE id=?", (assignment_id,)).fetchone()
        if old:
            _log_history(conn, 'boat_assignments', assignment_id, 'delete', old)
        conn.execute("DELETE FROM boat_assignments WHERE id=?", (assignment_id,))


# ─── Picture Boats ────────────────────────────────────────────────────────────

def get_picture_boats(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM picture_boats WHERE production_id=? ORDER BY sort_order, boat_nr, name",
            (prod_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def create_picture_boat(data):
    cols = ["production_id", "boat_nr", "name", "capacity", "night_ok",
            "wave_rating", "captain", "vendor", "group_name", "notes",
            "daily_rate_estimate", "daily_rate_actual", "image_path"]
    fields = {k: data[k] for k in cols if k in data}
    placeholders = ", ".join("?" * len(fields))
    col_names = ", ".join(fields.keys())
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO picture_boats ({col_names}) VALUES ({placeholders})",
            list(fields.values())
        )
        return cur.lastrowid


def update_picture_boat(pb_id, data):
    allowed = ["boat_nr", "name", "capacity", "night_ok", "wave_rating",
               "captain", "vendor", "group_name", "notes",
               "daily_rate_estimate", "daily_rate_actual", "image_path", "sort_order"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [pb_id]
    with get_db() as conn:
        conn.execute(f"UPDATE picture_boats SET {sets} WHERE id=?", vals)


def delete_picture_boat(pb_id):
    with get_db() as conn:
        conn.execute("DELETE FROM picture_boat_assignments WHERE picture_boat_id=?", (pb_id,))
        conn.execute("DELETE FROM picture_boats WHERE id=?", (pb_id,))


# ─── Picture Boat Assignments ─────────────────────────────────────────────────

def get_picture_boat_assignments(prod_id):
    """Return picture boat assignments enriched with boat and function info."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT pba.*,
                   pb.name  AS boat_name,
                   pb.capacity AS boat_capacity,
                   pb.captain,
                   pb.wave_rating,
                   pb.image_path,
                   pb.boat_nr,
                   pb.daily_rate_estimate AS boat_daily_rate_estimate,
                   pb.daily_rate_actual   AS boat_daily_rate_actual,
                   pb.vendor,
                   bf.name  AS function_name,
                   bf.function_group,
                   bf.color
            FROM picture_boat_assignments pba
            LEFT JOIN picture_boats pb ON pba.picture_boat_id = pb.id
            LEFT JOIN boat_functions bf ON pba.boat_function_id = bf.id
            WHERE bf.production_id = ?
            ORDER BY bf.sort_order, bf.id
        """, (prod_id,)).fetchall()

        result = []
        for r in rows:
            d = dict(r)
            rate_est = d.get("price_override") or d.get("boat_daily_rate_estimate") or 0
            rate_act = d.get("boat_daily_rate_actual") or 0
            wd = compute_working_days(d)
            d["working_days"]    = wd
            d["amount_estimate"] = round(wd * rate_est, 2)
            d["amount_actual"]   = round(wd * rate_act, 2) if rate_act else None
            result.append(d)
        return result


def _resolve_assignment_dates(conn, data):
    """Auto-fill start_date/end_date from boat_function defaults if not provided."""
    start = data.get("start_date")
    end = data.get("end_date")
    func_id = data.get("boat_function_id")
    if func_id and (not start or not end):
        func = conn.execute("SELECT default_start, default_end FROM boat_functions WHERE id=?", (func_id,)).fetchone()
        if func:
            if not start and func['default_start']:
                start = func['default_start']
            if not end and func['default_end']:
                end = func['default_end']
    return start, end


def create_picture_boat_assignment(data):
    func_id = data["boat_function_id"]
    with get_db() as conn:
        start_date, end_date = _resolve_assignment_dates(conn, data)
        cur = conn.execute(
            """INSERT INTO picture_boat_assignments
               (boat_function_id, picture_boat_id, boat_name_override, start_date, end_date,
                price_override, notes, assignment_status, day_overrides, pricing_type, include_sunday)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (func_id, data.get("picture_boat_id"), data.get("boat_name_override"),
             start_date, end_date,
             data.get("price_override"), data.get("notes"),
             data.get("assignment_status", "confirmed"),
             data.get("day_overrides", "{}"),
             data.get("pricing_type", "standard"),
             data.get("include_sunday", 1))
        )
        new_id = cur.lastrowid
        new = conn.execute("SELECT * FROM picture_boat_assignments WHERE id=?", (new_id,)).fetchone()
        _log_history(conn, 'picture_boat_assignments', new_id, 'create', new_data=new)
        return new_id


def update_picture_boat_assignment(assignment_id, data):
    allowed = ["start_date", "end_date", "price_override", "notes",
               "assignment_status", "day_overrides", "picture_boat_id", "boat_name_override",
               "pricing_type", "include_sunday"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    set_parts = []
    vals = []
    for k, v in fields.items():
        set_parts.append(f"{k}=?")
        vals.append(v)
    set_parts.append("updated_at=datetime('now')")
    vals.append(assignment_id)
    with get_db() as conn:
        old = conn.execute("SELECT * FROM picture_boat_assignments WHERE id=?", (assignment_id,)).fetchone()
        conn.execute(
            f"UPDATE picture_boat_assignments SET {', '.join(set_parts)} WHERE id=?", vals
        )
        new = conn.execute("SELECT * FROM picture_boat_assignments WHERE id=?", (assignment_id,)).fetchone()
        if old:
            _log_history(conn, 'picture_boat_assignments', assignment_id, 'update', old, new)


def delete_picture_boat_assignment(assignment_id):
    with get_db() as conn:
        old = conn.execute("SELECT * FROM picture_boat_assignments WHERE id=?", (assignment_id,)).fetchone()
        if old:
            _log_history(conn, 'picture_boat_assignments', assignment_id, 'delete', old)
        conn.execute("DELETE FROM picture_boat_assignments WHERE id=?", (assignment_id,))


def delete_picture_boat_assignment_by_function(func_id):
    with get_db() as conn:
        conn.execute("DELETE FROM picture_boat_assignments WHERE boat_function_id=?", (func_id,))



# ─── Transport Vehicles ───────────────────────────────────────────────────────

def get_transport_vehicles(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM transport_vehicles WHERE production_id=? ORDER BY sort_order, vehicle_nr, name",
            (prod_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def create_transport_vehicle(data):
    cols = ["production_id", "vehicle_nr", "name", "type", "driver",
            "vendor", "group_name", "notes", "daily_rate_estimate", "daily_rate_actual", "image_path"]
    fields = {k: data[k] for k in cols if k in data}
    placeholders = ", ".join("?" * len(fields))
    col_names = ", ".join(fields.keys())
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO transport_vehicles ({col_names}) VALUES ({placeholders})",
            list(fields.values())
        )
        return cur.lastrowid


def update_transport_vehicle(vehicle_id, data):
    allowed = ["vehicle_nr", "name", "type", "driver", "vendor", "group_name",
               "notes", "daily_rate_estimate", "daily_rate_actual", "image_path", "sort_order"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [vehicle_id]
    with get_db() as conn:
        conn.execute(f"UPDATE transport_vehicles SET {sets} WHERE id=?", vals)


def delete_transport_vehicle(vehicle_id):
    with get_db() as conn:
        conn.execute("DELETE FROM transport_assignments WHERE vehicle_id=?", (vehicle_id,))
        conn.execute("DELETE FROM transport_vehicles WHERE id=?", (vehicle_id,))


def get_transport_assignments(prod_id):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT ta.*,
                   tv.name  AS vehicle_name,
                   tv.type  AS vehicle_type,
                   tv.driver,
                   tv.image_path,
                   tv.vehicle_nr,
                   tv.daily_rate_estimate AS vehicle_daily_rate_estimate,
                   tv.daily_rate_actual   AS vehicle_daily_rate_actual,
                   tv.vendor,
                   bf.name  AS function_name,
                   bf.function_group,
                   bf.color
            FROM transport_assignments ta
            LEFT JOIN transport_vehicles tv ON ta.vehicle_id = tv.id
            LEFT JOIN boat_functions bf ON ta.boat_function_id = bf.id
            WHERE bf.production_id = ?
            ORDER BY bf.sort_order, bf.id
        """, (prod_id,)).fetchall()

        result = []
        for r in rows:
            d = dict(r)
            rate_est = d.get("price_override") or d.get("vehicle_daily_rate_estimate") or 0
            rate_act = d.get("vehicle_daily_rate_actual") or 0
            wd = compute_working_days(d)
            d["working_days"]    = wd
            d["amount_estimate"] = round(wd * rate_est, 2)
            d["amount_actual"]   = round(wd * rate_act, 2) if rate_act else None
            result.append(d)
        return result


def create_transport_assignment(data):
    func_id = data["boat_function_id"]
    with get_db() as conn:
        start_date, end_date = _resolve_assignment_dates(conn, data)
        cur = conn.execute(
            """INSERT INTO transport_assignments
               (boat_function_id, vehicle_id, vehicle_name_override, start_date, end_date,
                price_override, notes, assignment_status, day_overrides, pricing_type, include_sunday)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (func_id, data.get("vehicle_id"), data.get("vehicle_name_override"),
             start_date, end_date,
             data.get("price_override"), data.get("notes"),
             data.get("assignment_status", "confirmed"),
             data.get("day_overrides", "{}"),
             data.get("pricing_type", "standard"),
             data.get("include_sunday", 1))
        )
        new_id = cur.lastrowid
        new = conn.execute("SELECT * FROM transport_assignments WHERE id=?", (new_id,)).fetchone()
        _log_history(conn, 'transport_assignments', new_id, 'create', new_data=new)
        return new_id


def update_transport_assignment(assignment_id, data):
    allowed = ["start_date", "end_date", "price_override", "notes",
               "assignment_status", "day_overrides", "vehicle_id", "vehicle_name_override",
               "pricing_type", "include_sunday"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    set_parts = []
    vals = []
    for k, v in fields.items():
        set_parts.append(f"{k}=?")
        vals.append(v)
    set_parts.append("updated_at=datetime('now')")
    vals.append(assignment_id)
    with get_db() as conn:
        old = conn.execute("SELECT * FROM transport_assignments WHERE id=?", (assignment_id,)).fetchone()
        conn.execute(
            f"UPDATE transport_assignments SET {', '.join(set_parts)} WHERE id=?", vals
        )
        new = conn.execute("SELECT * FROM transport_assignments WHERE id=?", (assignment_id,)).fetchone()
        if old:
            _log_history(conn, 'transport_assignments', assignment_id, 'update', old, new)


def delete_transport_assignment(assignment_id):
    with get_db() as conn:
        old = conn.execute("SELECT * FROM transport_assignments WHERE id=?", (assignment_id,)).fetchone()
        if old:
            _log_history(conn, 'transport_assignments', assignment_id, 'delete', old)
        conn.execute("DELETE FROM transport_assignments WHERE id=?", (assignment_id,))


def delete_transport_assignment_by_function(func_id):
    with get_db() as conn:
        conn.execute("DELETE FROM transport_assignments WHERE boat_function_id=?", (func_id,))


# ─── Fuel ─────────────────────────────────────────────────────────────────────

def get_fuel_entries(prod_id, source_type=None):
    with get_db() as conn:
        if source_type:
            rows = conn.execute(
                "SELECT * FROM fuel_entries WHERE production_id=? AND source_type=? ORDER BY source_type, assignment_id, date",
                (prod_id, source_type)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM fuel_entries WHERE production_id=? ORDER BY source_type, assignment_id, date",
                (prod_id,)
            ).fetchall()
        return [dict(r) for r in rows]


def upsert_fuel_entry(data):
    cols = ['production_id', 'source_type', 'assignment_id', 'date', 'liters', 'fuel_type']
    vals = [data.get(c) for c in cols]
    with get_db() as conn:
        old = conn.execute(
            "SELECT * FROM fuel_entries WHERE source_type=? AND assignment_id=? AND date=?",
            (data.get('source_type'), data.get('assignment_id'), data.get('date'))
        ).fetchone()
        conn.execute(
            f"INSERT OR REPLACE INTO fuel_entries ({', '.join(cols)}) VALUES ({', '.join(['?']*len(cols))})",
            vals
        )
        row = conn.execute(
            "SELECT * FROM fuel_entries WHERE source_type=? AND assignment_id=? AND date=?",
            (data['source_type'], data['assignment_id'], data['date'])
        ).fetchone()
        if row:
            action = 'update' if old else 'create'
            _log_history(conn, 'fuel_entries', row['id'], action, old, row)
        return dict(row) if row else None


def delete_fuel_entry(entry_id):
    with get_db() as conn:
        old = conn.execute("SELECT * FROM fuel_entries WHERE id=?", (entry_id,)).fetchone()
        if old:
            _log_history(conn, 'fuel_entries', entry_id, 'delete', old)
        conn.execute("DELETE FROM fuel_entries WHERE id=?", (entry_id,))


def delete_fuel_entries_for_assignment(source_type, assignment_id):
    with get_db() as conn:
        conn.execute(
            "DELETE FROM fuel_entries WHERE source_type=? AND assignment_id=?",
            (source_type, assignment_id)
        )


def get_fuel_machinery(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM fuel_machinery WHERE production_id=? ORDER BY name",
            (prod_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def create_fuel_machinery(data):
    cols = ['production_id', 'name', 'fuel_type', 'start_date', 'end_date', 'liters_per_day', 'notes']
    vals = [data.get(c) for c in cols]
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO fuel_machinery ({', '.join(cols)}) VALUES ({', '.join(['?']*len(cols))})",
            vals
        )
        new_id = cur.lastrowid
        new = conn.execute("SELECT * FROM fuel_machinery WHERE id=?", (new_id,)).fetchone()
        _log_history(conn, 'fuel_machinery', new_id, 'create', new_data=new)
        return new_id


def update_fuel_machinery(machinery_id, data):
    allowed = ['name', 'fuel_type', 'start_date', 'end_date', 'liters_per_day', 'notes', 'updated_at']
    sets, vals = [], []
    for k, v in data.items():
        if k in allowed:
            sets.append(f"{k}=?")
            vals.append(v)
    if not sets:
        return
    vals.append(machinery_id)
    with get_db() as conn:
        old = conn.execute("SELECT * FROM fuel_machinery WHERE id=?", (machinery_id,)).fetchone()
        conn.execute(f"UPDATE fuel_machinery SET {', '.join(sets)} WHERE id=?", vals)
        new = conn.execute("SELECT * FROM fuel_machinery WHERE id=?", (machinery_id,)).fetchone()
        if old:
            _log_history(conn, 'fuel_machinery', machinery_id, 'update', old, new)


def delete_fuel_machinery(machinery_id):
    with get_db() as conn:
        old = conn.execute("SELECT * FROM fuel_machinery WHERE id=?", (machinery_id,)).fetchone()
        if old:
            _log_history(conn, 'fuel_machinery', machinery_id, 'delete', old)
        conn.execute("DELETE FROM fuel_machinery WHERE id=?", (machinery_id,))


# ─── Fuel locked prices ─────────────────────────────────────────────────────

def get_fuel_locked_prices():
    """Return all locked day price snapshots as {date: {diesel_price, petrol_price}}."""
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM fuel_locked_prices ORDER BY date").fetchall()
        return {r["date"]: {"diesel_price": r["diesel_price"], "petrol_price": r["petrol_price"]} for r in rows}


def set_fuel_locked_price(date, diesel_price, petrol_price):
    """Lock a day with the current fuel prices."""
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO fuel_locked_prices (date, diesel_price, petrol_price) VALUES (?,?,?)",
            (date, diesel_price, petrol_price)
        )


def delete_fuel_locked_price(date):
    """Unlock a day (remove the price snapshot)."""
    with get_db() as conn:
        conn.execute("DELETE FROM fuel_locked_prices WHERE date=?", (date,))


# ─── Helpers ──────────────────────────────────────────────────────────────────

def get_helpers(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM helpers WHERE production_id=? ORDER BY sort_order, name", (prod_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def create_helper(data):
    cols = ["production_id", "name", "role", "contact", "group_name",
            "daily_rate_estimate", "daily_rate_actual", "notes", "image_path"]
    fields = {k: data[k] for k in cols if k in data}
    placeholders = ", ".join("?" * len(fields))
    col_names = ", ".join(fields.keys())
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO helpers ({col_names}) VALUES ({placeholders})",
            list(fields.values())
        )
        return cur.lastrowid


def update_helper(helper_id, data):
    allowed = ["name", "role", "contact", "group_name",
               "daily_rate_estimate", "daily_rate_actual", "notes", "image_path", "sort_order"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [helper_id]
    with get_db() as conn:
        conn.execute(f"UPDATE helpers SET {sets} WHERE id=?", vals)


def delete_helper(helper_id):
    with get_db() as conn:
        conn.execute("DELETE FROM helper_assignments WHERE helper_id=?", (helper_id,))
        conn.execute("DELETE FROM helpers WHERE id=?", (helper_id,))


def get_helper_assignments(prod_id):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT ha.*,
                   h.name  AS helper_name,
                   h.role  AS helper_role,
                   h.contact AS helper_contact,
                   h.group_name AS helper_group,
                   h.daily_rate_estimate AS helper_daily_rate_estimate,
                   h.daily_rate_actual   AS helper_daily_rate_actual,
                   bf.name  AS function_name,
                   bf.function_group,
                   bf.color
            FROM helper_assignments ha
            LEFT JOIN helpers h ON ha.helper_id = h.id
            LEFT JOIN boat_functions bf ON ha.boat_function_id = bf.id
            WHERE bf.production_id = ?
            ORDER BY bf.sort_order, bf.id
        """, (prod_id,)).fetchall()

        result = []
        for r in rows:
            d = dict(r)
            rate_est = d.get("price_override") or d.get("helper_daily_rate_estimate") or 0
            rate_act = d.get("helper_daily_rate_actual") or 0
            wd = compute_working_days(d)
            d["working_days"]    = wd
            d["amount_estimate"] = round(wd * rate_est, 2)
            d["amount_actual"]   = round(wd * rate_act, 2) if rate_act else None
            result.append(d)
        return result


def create_helper_assignment(data):
    func_id = data["boat_function_id"]
    with get_db() as conn:
        start_date, end_date = _resolve_assignment_dates(conn, data)
        cur = conn.execute(
            """INSERT INTO helper_assignments
               (boat_function_id, helper_id, helper_name_override, start_date, end_date,
                price_override, notes, assignment_status, day_overrides, pricing_type, include_sunday)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (func_id, data.get("helper_id"), data.get("helper_name_override"),
             start_date, end_date,
             data.get("price_override"), data.get("notes"),
             data.get("assignment_status", "confirmed"),
             data.get("day_overrides", "{}"),
             data.get("pricing_type", "standard"),
             data.get("include_sunday", 1))
        )
        new_id = cur.lastrowid
        new = conn.execute("SELECT * FROM helper_assignments WHERE id=?", (new_id,)).fetchone()
        _log_history(conn, 'helper_assignments', new_id, 'create', new_data=new)
        return new_id


def update_helper_assignment(assignment_id, data):
    allowed = ["start_date", "end_date", "price_override", "notes",
               "assignment_status", "day_overrides", "helper_id", "helper_name_override",
               "pricing_type", "include_sunday"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    set_parts = []
    vals = []
    for k, v in fields.items():
        set_parts.append(f"{k}=?")
        vals.append(v)
    set_parts.append("updated_at=datetime('now')")
    vals.append(assignment_id)
    with get_db() as conn:
        old = conn.execute("SELECT * FROM helper_assignments WHERE id=?", (assignment_id,)).fetchone()
        conn.execute(
            f"UPDATE helper_assignments SET {', '.join(set_parts)} WHERE id=?", vals
        )
        new = conn.execute("SELECT * FROM helper_assignments WHERE id=?", (assignment_id,)).fetchone()
        if old:
            _log_history(conn, 'helper_assignments', assignment_id, 'update', old, new)


def delete_helper_assignment(assignment_id):
    with get_db() as conn:
        old = conn.execute("SELECT * FROM helper_assignments WHERE id=?", (assignment_id,)).fetchone()
        if old:
            _log_history(conn, 'helper_assignments', assignment_id, 'delete', old)
        conn.execute("DELETE FROM helper_assignments WHERE id=?", (assignment_id,))


def delete_helper_assignment_by_function(func_id):
    with get_db() as conn:
        conn.execute("DELETE FROM helper_assignments WHERE boat_function_id=?", (func_id,))


def get_helper_schedules(prod_id):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT hs.*, h.name AS helper_name, h.role AS helper_role,
                   h.daily_rate_estimate, h.daily_rate_actual,
                   sd.date, sd.day_number
            FROM helper_schedules hs
            JOIN helpers h ON hs.helper_id = h.id
            JOIN shooting_days sd ON hs.shooting_day_id = sd.id
            WHERE h.production_id = ?
            ORDER BY sd.date, h.name
        """, (prod_id,)).fetchall()
        return [dict(r) for r in rows]


# ─── Guard Camp Workers ──────────────────────────────────────────────────────

def get_guard_camp_workers(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM guard_camp_workers WHERE production_id=? ORDER BY sort_order, name", (prod_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def create_guard_camp_worker(data):
    cols = ["production_id", "name", "role", "contact", "group_name",
            "daily_rate_estimate", "daily_rate_actual", "notes", "image_path"]
    fields = {k: data[k] for k in cols if k in data}
    placeholders = ", ".join("?" * len(fields))
    col_names = ", ".join(fields.keys())
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO guard_camp_workers ({col_names}) VALUES ({placeholders})",
            list(fields.values())
        )
        return cur.lastrowid


def update_guard_camp_worker(worker_id, data):
    allowed = ["name", "role", "contact", "group_name",
               "daily_rate_estimate", "daily_rate_actual", "notes", "image_path", "sort_order"]
    sets = []
    vals = []
    for k in allowed:
        if k in data:
            sets.append(f"{k}=?")
            vals.append(data[k])
    if not sets:
        return
    vals.append(worker_id)
    with get_db() as conn:
        conn.execute(f"UPDATE guard_camp_workers SET {', '.join(sets)} WHERE id=?", vals)


def delete_guard_camp_worker(worker_id):
    with get_db() as conn:
        conn.execute("DELETE FROM guard_camp_assignments WHERE helper_id=?", (worker_id,))
        conn.execute("DELETE FROM guard_camp_workers WHERE id=?", (worker_id,))


def get_guard_camp_assignments(prod_id):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT gca.*,
                   gcw.name  AS helper_name,
                   gcw.role  AS helper_role,
                   gcw.contact AS helper_contact,
                   gcw.group_name AS helper_group,
                   gcw.daily_rate_estimate AS helper_daily_rate_estimate,
                   gcw.daily_rate_actual   AS helper_daily_rate_actual,
                   bf.name  AS function_name,
                   bf.function_group,
                   bf.color
            FROM guard_camp_assignments gca
            LEFT JOIN guard_camp_workers gcw ON gca.helper_id = gcw.id
            LEFT JOIN boat_functions bf ON gca.boat_function_id = bf.id
            WHERE bf.production_id = ?
            ORDER BY bf.sort_order, gca.id
        """, (prod_id,)).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            # Compute working_days based on pricing_type
            if d.get("start_date") and d.get("end_date"):
                wd = compute_working_days(d)
                d["working_days"] = wd
                rate = d.get("price_override") or d.get("helper_daily_rate_estimate") or 0
                d["amount_estimate"] = round(wd * rate)
            else:
                d["working_days"] = 0
                d["amount_estimate"] = 0
            result.append(d)
        return result


def create_guard_camp_assignment(data):
    func_id = data["boat_function_id"]
    with get_db() as conn:
        start, end = _resolve_assignment_dates(conn, data)
        cur = conn.execute(
            """INSERT INTO guard_camp_assignments
               (boat_function_id, helper_id, helper_name_override, start_date, end_date,
                price_override, notes, assignment_status, day_overrides, pricing_type, include_sunday)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (func_id, data.get("helper_id"), data.get("helper_name_override"),
             start, end,
             data.get("price_override"), data.get("notes"),
             data.get("assignment_status", "confirmed"),
             data.get("day_overrides", "{}"),
             data.get("pricing_type", "standard"),
             data.get("include_sunday", 1))
        )
        new_id = cur.lastrowid
        new = conn.execute("SELECT * FROM guard_camp_assignments WHERE id=?", (new_id,)).fetchone()
        _log_history(conn, 'guard_camp_assignments', new_id, 'create', new_data=new)
        return new_id


def update_guard_camp_assignment(assignment_id, data):
    allowed = ["boat_function_id", "helper_id", "helper_name_override",
               "start_date", "end_date", "price_override", "notes",
               "assignment_status", "day_overrides", "pricing_type", "include_sunday"]
    set_parts = []
    vals = []
    for k in allowed:
        if k in data:
            set_parts.append(f"{k}=?")
            vals.append(data[k])
    set_parts.append("updated_at=datetime('now')")
    vals.append(assignment_id)
    with get_db() as conn:
        old = conn.execute("SELECT * FROM guard_camp_assignments WHERE id=?", (assignment_id,)).fetchone()
        conn.execute(
            f"UPDATE guard_camp_assignments SET {', '.join(set_parts)} WHERE id=?", vals
        )
        new = conn.execute("SELECT * FROM guard_camp_assignments WHERE id=?", (assignment_id,)).fetchone()
        if old:
            _log_history(conn, 'guard_camp_assignments', assignment_id, 'update', old, new)


def delete_guard_camp_assignment(assignment_id):
    with get_db() as conn:
        old = conn.execute("SELECT * FROM guard_camp_assignments WHERE id=?", (assignment_id,)).fetchone()
        if old:
            _log_history(conn, 'guard_camp_assignments', assignment_id, 'delete', old)
        conn.execute("DELETE FROM guard_camp_assignments WHERE id=?", (assignment_id,))


def delete_guard_camp_assignment_by_function(func_id):
    with get_db() as conn:
        conn.execute("DELETE FROM guard_camp_assignments WHERE boat_function_id=?", (func_id,))


# ─── Security Boats ──────────────────────────────────────────────────────────

def get_security_boats(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM security_boats WHERE production_id=? ORDER BY sort_order, boat_nr, name",
            (prod_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def create_security_boat(data):
    cols = ["production_id", "boat_nr", "name", "capacity", "night_ok",
            "wave_rating", "captain", "vendor", "group_name", "notes",
            "daily_rate_estimate", "daily_rate_actual", "image_path"]
    fields = {k: data[k] for k in cols if k in data}
    placeholders = ", ".join("?" * len(fields))
    col_names = ", ".join(fields.keys())
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO security_boats ({col_names}) VALUES ({placeholders})",
            list(fields.values())
        )
        return cur.lastrowid


def update_security_boat(sb_id, data):
    allowed = ["boat_nr", "name", "capacity", "night_ok", "wave_rating",
               "captain", "vendor", "group_name", "notes",
               "daily_rate_estimate", "daily_rate_actual", "image_path", "sort_order"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [sb_id]
    with get_db() as conn:
        conn.execute(f"UPDATE security_boats SET {sets} WHERE id=?", vals)


def delete_security_boat(sb_id):
    with get_db() as conn:
        conn.execute("DELETE FROM security_boat_assignments WHERE security_boat_id=?", (sb_id,))
        conn.execute("DELETE FROM security_boats WHERE id=?", (sb_id,))


def get_security_boat_assignments(prod_id):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT sba.*,
                   sb.name  AS boat_name,
                   sb.capacity AS boat_capacity,
                   sb.captain,
                   sb.wave_rating,
                   sb.image_path,
                   sb.boat_nr,
                   sb.daily_rate_estimate AS boat_daily_rate_estimate,
                   sb.daily_rate_actual   AS boat_daily_rate_actual,
                   sb.vendor,
                   bf.name  AS function_name,
                   bf.function_group,
                   bf.color
            FROM security_boat_assignments sba
            LEFT JOIN security_boats sb ON sba.security_boat_id = sb.id
            LEFT JOIN boat_functions bf ON sba.boat_function_id = bf.id
            WHERE bf.production_id = ?
            ORDER BY bf.sort_order, bf.id
        """, (prod_id,)).fetchall()

        result = []
        for r in rows:
            d = dict(r)
            rate_est = d.get("price_override") or d.get("boat_daily_rate_estimate") or 0
            rate_act = d.get("boat_daily_rate_actual") or 0
            wd = compute_working_days(d)
            d["working_days"]    = wd
            d["amount_estimate"] = round(wd * rate_est, 2)
            d["amount_actual"]   = round(wd * rate_act, 2) if rate_act else None
            result.append(d)
        return result


def create_security_boat_assignment(data):
    func_id = data["boat_function_id"]
    with get_db() as conn:
        start, end = _resolve_assignment_dates(conn, data)
        cur = conn.execute(
            """INSERT INTO security_boat_assignments
               (boat_function_id, security_boat_id, boat_name_override, start_date, end_date,
                price_override, notes, assignment_status, day_overrides, pricing_type, include_sunday)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (func_id, data.get("security_boat_id"), data.get("boat_name_override"),
             start, end,
             data.get("price_override"), data.get("notes"),
             data.get("assignment_status", "confirmed"),
             data.get("day_overrides", "{}"),
             data.get("pricing_type", "standard"),
             data.get("include_sunday", 1))
        )
        new_id = cur.lastrowid
        new = conn.execute("SELECT * FROM security_boat_assignments WHERE id=?", (new_id,)).fetchone()
        _log_history(conn, 'security_boat_assignments', new_id, 'create', new_data=new)
        return new_id


def update_security_boat_assignment(assignment_id, data):
    allowed = ["start_date", "end_date", "price_override", "notes",
               "assignment_status", "day_overrides", "security_boat_id", "boat_name_override",
               "pricing_type", "include_sunday"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    set_parts = []
    vals = []
    for k, v in fields.items():
        set_parts.append(f"{k}=?")
        vals.append(v)
    set_parts.append("updated_at=datetime('now')")
    vals.append(assignment_id)
    with get_db() as conn:
        old = conn.execute("SELECT * FROM security_boat_assignments WHERE id=?", (assignment_id,)).fetchone()
        conn.execute(
            f"UPDATE security_boat_assignments SET {', '.join(set_parts)} WHERE id=?", vals
        )
        new = conn.execute("SELECT * FROM security_boat_assignments WHERE id=?", (assignment_id,)).fetchone()
        if old:
            _log_history(conn, 'security_boat_assignments', assignment_id, 'update', old, new)


def delete_security_boat_assignment(assignment_id):
    with get_db() as conn:
        old = conn.execute("SELECT * FROM security_boat_assignments WHERE id=?", (assignment_id,)).fetchone()
        if old:
            _log_history(conn, 'security_boat_assignments', assignment_id, 'delete', old)
        conn.execute("DELETE FROM security_boat_assignments WHERE id=?", (assignment_id,))


def delete_security_boat_assignment_by_function(func_id):
    with get_db() as conn:
        conn.execute("DELETE FROM security_boat_assignments WHERE boat_function_id=?", (func_id,))


# ─── FNB ──────────────────────────────────────────────────────────────────────

def get_fnb_services(prod_id):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT fs.*, sd.date, sd.day_number, sd.location AS day_location
            FROM fnb_services fs
            JOIN shooting_days sd ON fs.shooting_day_id = sd.id
            WHERE fs.production_id = ?
            ORDER BY sd.date, fs.meal_type
        """, (prod_id,)).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["amount_estimate"] = round((d["nb_pax_estimate"] or 0) * (d["unit_cost_estimate"] or 0), 2)
            d["amount_actual"]   = (
                round((d["nb_pax_actual"] or 0) * (d["unit_cost_actual"] or 0), 2)
                if d["nb_pax_actual"] is not None else None
            )
            result.append(d)
        return result


# ─── Fuel ─────────────────────────────────────────────────────────────────────

def get_fuel_logs(prod_id):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT fl.*, sd.date, sd.day_number, b.name AS boat_name
            FROM fuel_logs fl
            JOIN shooting_days sd ON fl.shooting_day_id = sd.id
            LEFT JOIN boats b ON fl.boat_id = b.id
            WHERE fl.production_id = ?
            ORDER BY sd.date
        """, (prod_id,)).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["amount_estimate"] = round((d["liters_estimate"] or 0) * (d["price_per_liter"] or 0), 2)
            d["amount_actual"]   = (
                round((d["liters_actual"] or 0) * (d["price_per_liter"] or 0), 2)
                if d["liters_actual"] is not None else None
            )
            result.append(d)
        return result


# ─── Transport ────────────────────────────────────────────────────────────────

def get_transport_schedules(prod_id):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT ts.*, v.name AS vehicle_name, v.type AS vehicle_type,
                   v.daily_rate_estimate, v.daily_rate_actual,
                   sd.date, sd.day_number
            FROM transport_schedules ts
            JOIN vehicles v ON ts.vehicle_id = v.id
            JOIN shooting_days sd ON ts.shooting_day_id = sd.id
            WHERE v.production_id = ?
            ORDER BY sd.date, v.name
        """, (prod_id,)).fetchall()
        return [dict(r) for r in rows]


# ─── Guards ───────────────────────────────────────────────────────────────────

def get_guard_schedules(prod_id):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT gs.*, g.name AS guard_name, g.company,
                   g.daily_rate_estimate, g.daily_rate_actual,
                   sd.date, sd.day_number
            FROM guard_schedules gs
            JOIN guards g ON gs.guard_id = g.id
            JOIN shooting_days sd ON gs.shooting_day_id = sd.id
            WHERE g.production_id = ?
            ORDER BY sd.date, g.name
        """, (prod_id,)).fetchall()
        return [dict(r) for r in rows]


# ─── Location Schedules ──────────────────────────────────────────────────────

def get_location_schedules(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM location_schedules WHERE production_id=? ORDER BY location_name, date",
            (prod_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def upsert_location_schedule(data):
    """Create or update a location schedule cell (P/F/W)."""
    with get_db() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO location_schedules
               (production_id, location_name, location_type, date, status, locked, notes)
               VALUES (?,?,?,?,?,
                 COALESCE((SELECT locked FROM location_schedules
                           WHERE production_id=? AND location_name=? AND date=?), 0),
                 ?)""",
            (data['production_id'], data['location_name'], data['location_type'],
             data['date'], data['status'],
             data['production_id'], data['location_name'], data['date'],
             data.get('notes'))
        )
        row = conn.execute(
            "SELECT * FROM location_schedules WHERE production_id=? AND location_name=? AND date=?",
            (data['production_id'], data['location_name'], data['date'])
        ).fetchone()
        return dict(row) if row else None


def delete_location_schedule(prod_id, location_name, date):
    with get_db() as conn:
        conn.execute(
            "DELETE FROM location_schedules WHERE production_id=? AND location_name=? AND date=?",
            (prod_id, location_name, date)
        )


def delete_location_schedule_by_id(schedule_id):
    with get_db() as conn:
        conn.execute("DELETE FROM location_schedules WHERE id=?", (schedule_id,))


def lock_location_schedules(prod_id, dates, locked):
    """Lock or unlock location schedule cells for given dates."""
    with get_db() as conn:
        for d in dates:
            conn.execute(
                "UPDATE location_schedules SET locked=? WHERE production_id=? AND date=?",
                (1 if locked else 0, prod_id, d)
            )


def auto_fill_locations_from_pdt(prod_id):
    """Auto-fill location schedules with 'F' from shooting days data."""
    from database import get_shooting_days
    days = get_shooting_days(prod_id)

    # Load location sites from DB dynamically
    db_sites = get_location_sites(prod_id)
    # Build lookup: uppercase name -> (original_name, location_type)
    site_lookup = {}
    for s in db_sites:
        site_lookup[s['name'].upper()] = (s['name'], s.get('location_type', 'game'))
    # Add common aliases
    if any(s['name'] == 'ARENA (SABOGA)' for s in db_sites):
        site_lookup['ARENA'] = ('ARENA (SABOGA)', 'game')
        site_lookup['SABOGA'] = ('ARENA (SABOGA)', 'game')

    created = 0
    with get_db() as conn:
        for day in days:
            locations_found = set()  # set of (original_name, location_type)
            # Check main location
            if day.get('location'):
                loc_upper = day['location'].strip().upper()
                for uname, (orig, ltype) in site_lookup.items():
                    if uname in loc_upper or loc_upper in uname:
                        locations_found.add((orig, ltype))
            # Check events
            for ev in day.get('events', []):
                if ev.get('location'):
                    ev_loc = ev['location'].strip().upper()
                    for uname, (orig, ltype) in site_lookup.items():
                        if uname in ev_loc or ev_loc in uname:
                            locations_found.add((orig, ltype))
                # Also map ARENA from arena event type
                if ev.get('event_type') == 'arena' and 'ARENA (SABOGA)' in site_lookup:
                    locations_found.add(site_lookup['ARENA (SABOGA)'])
                elif ev.get('event_type') == 'arena':
                    # fallback
                    locations_found.add(('ARENA (SABOGA)', 'game'))

            for loc_name, loc_type in locations_found:
                try:
                    conn.execute(
                        """INSERT OR IGNORE INTO location_schedules
                           (production_id, location_name, location_type, date, status)
                           VALUES (?,?,?,?,?)""",
                        (prod_id, loc_name, loc_type, day['date'], 'F')
                    )
                    created += 1
                except Exception:
                    pass
    return created


def _normalize_location_name(name):
    """Normalize a location name for matching: trim, lowercase, remove accents."""
    if not name:
        return ''
    s = name.strip().lower()
    # Remove accents (e.g. é -> e, ñ -> n)
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    # Collapse multiple spaces
    s = ' '.join(s.split())
    return s


def sync_pdt_day_to_locations(prod_id, day_date, locations_from_pdt):
    """Sync a single PDT day's locations to the location_schedules table.

    - locations_from_pdt: list of location name strings found in the PDT day
      (from shooting_days.location + shooting_day_events.location)
    - Auto-creates missing location sites in the locations table
    - Upserts 'F' entries in location_schedules for each location on this date
    - Removes 'F' entries on this date that are no longer in the PDT
      (but NEVER touches P or W entries)
    - Respects locked cells: does not modify locked schedule entries
    Returns: dict with 'created', 'matched', 'ignored' lists for logging.
    """
    if not day_date:
        return {'created': [], 'matched': [], 'ignored': []}

    sync_log = {'created': [], 'matched': [], 'ignored': []}

    # Normalize and deduplicate location names (skip empty/null)
    loc_names = set()
    for name in locations_from_pdt:
        if name and name.strip():
            loc_names.add(name.strip())

    with get_db() as conn:
        # Load existing location sites for matching
        db_sites = [dict(r) for r in conn.execute(
            "SELECT * FROM locations WHERE production_id=?", (prod_id,)
        ).fetchall()]
        # Build normalized lookup: normalized_name -> (canonical_name, location_type)
        site_lookup = {}
        site_lookup_upper = {}  # Keep uppercase for backward compat
        for s in db_sites:
            norm = _normalize_location_name(s['name'])
            site_lookup[norm] = (s['name'], s.get('location_type', 'game'))
            site_lookup_upper[s['name'].upper()] = (s['name'], s.get('location_type', 'game'))

        # Resolve each PDT location to a canonical site name, auto-creating if needed
        resolved_names = set()
        for raw_name in loc_names:
            raw_norm = _normalize_location_name(raw_name)
            raw_upper = raw_name.upper()

            # Try normalized match first
            if raw_norm in site_lookup:
                resolved_names.add(site_lookup[raw_norm][0])
                sync_log['matched'].append(raw_name)
                continue
            # Fallback: uppercase exact match
            if raw_upper in site_lookup_upper:
                resolved_names.add(site_lookup_upper[raw_upper][0])
                sync_log['matched'].append(raw_name)
                continue
            # Try substring match on normalized names
            matched = False
            for norm_name, (orig, ltype) in site_lookup.items():
                if norm_name in raw_norm or raw_norm in norm_name:
                    resolved_names.add(orig)
                    sync_log['matched'].append(f"{raw_name} -> {orig}")
                    matched = True
                    break
            if not matched:
                # Auto-create a new location site
                conn.execute(
                    "INSERT INTO locations (production_id, name, location_type) VALUES (?,?,?)",
                    (prod_id, raw_name, 'game')
                )
                norm = _normalize_location_name(raw_name)
                site_lookup[norm] = (raw_name, 'game')
                site_lookup_upper[raw_upper] = (raw_name, 'game')
                resolved_names.add(raw_name)
                sync_log['created'].append(raw_name)

        # Get existing F entries on this date (to know what to remove)
        existing_f = conn.execute(
            "SELECT * FROM location_schedules WHERE production_id=? AND date=? AND status='F'",
            (prod_id, day_date)
        ).fetchall()
        existing_f_names = set()
        for row in existing_f:
            r = dict(row)
            existing_f_names.add(r['location_name'])

        # Upsert F for each resolved location (skip if locked)
        for loc_name in resolved_names:
            # Check if cell is locked
            locked_row = conn.execute(
                "SELECT locked FROM location_schedules WHERE production_id=? AND location_name=? AND date=?",
                (prod_id, loc_name, day_date)
            ).fetchone()
            if locked_row and locked_row['locked']:
                continue
            # Find location_type
            loc_type = 'game'
            upper = loc_name.upper()
            if upper in site_lookup:
                loc_type = site_lookup[upper][1]
            conn.execute(
                """INSERT OR REPLACE INTO location_schedules
                   (production_id, location_name, location_type, date, status, locked, notes)
                   VALUES (?,?,?,?,'F',
                     COALESCE((SELECT locked FROM location_schedules
                               WHERE production_id=? AND location_name=? AND date=?), 0),
                     (SELECT notes FROM location_schedules
                      WHERE production_id=? AND location_name=? AND date=?))""",
                (prod_id, loc_name, loc_type, day_date,
                 prod_id, loc_name, day_date,
                 prod_id, loc_name, day_date)
            )

        # Remove F entries that are no longer in the PDT for this date
        # (only remove F, never P or W, and never locked cells)
        names_to_remove = existing_f_names - resolved_names
        for name in names_to_remove:
            # Check if this F was potentially set from another shooting day on the same date
            # (unlikely but possible if two shooting days share the same date)
            other_days = conn.execute(
                """SELECT COUNT(*) as cnt FROM shooting_days
                   WHERE production_id=? AND date=? AND location LIKE ?""",
                (prod_id, day_date, f'%{name}%')
            ).fetchone()
            # Also check events
            other_events = conn.execute(
                """SELECT COUNT(*) as cnt FROM shooting_day_events e
                   JOIN shooting_days sd ON e.shooting_day_id = sd.id
                   WHERE sd.production_id=? AND sd.date=? AND e.location LIKE ?""",
                (prod_id, day_date, f'%{name}%')
            ).fetchone()
            if (other_days and other_days['cnt'] > 0) or (other_events and other_events['cnt'] > 0):
                continue  # Still referenced by another day/event on same date
            conn.execute(
                "DELETE FROM location_schedules WHERE production_id=? AND location_name=? AND date=? AND status='F' AND locked=0",
                (prod_id, name, day_date)
            )

    return sync_log


def remove_pdt_film_days_for_date(prod_id, day_date):
    """Remove all F entries for a given date that came from PDT sync.
    Called when a shooting day is deleted. Only removes F, never P or W.
    Respects locked cells."""
    if not day_date:
        return
    with get_db() as conn:
        # Only delete F entries that are NOT locked and where no other shooting day
        # on the same date references this location
        f_entries = conn.execute(
            "SELECT * FROM location_schedules WHERE production_id=? AND date=? AND status='F' AND locked=0",
            (prod_id, day_date)
        ).fetchall()
        for row in f_entries:
            r = dict(row)
            loc_name = r['location_name']
            # Check if any remaining shooting day on this date still references this location
            remaining = conn.execute(
                """SELECT COUNT(*) as cnt FROM shooting_days
                   WHERE production_id=? AND date=? AND location IS NOT NULL AND location != ''""",
                (prod_id, day_date)
            ).fetchone()
            remaining_events = conn.execute(
                """SELECT COUNT(*) as cnt FROM shooting_day_events e
                   JOIN shooting_days sd ON e.shooting_day_id = sd.id
                   WHERE sd.production_id=? AND sd.date=? AND e.location IS NOT NULL AND e.location != ''""",
                (prod_id, day_date)
            ).fetchone()
            # If no remaining shooting days reference anything on this date, remove the F
            if (not remaining or remaining['cnt'] == 0) and (not remaining_events or remaining_events['cnt'] == 0):
                conn.execute(
                    "DELETE FROM location_schedules WHERE id=?", (r['id'],)
                )


# ─── Guard Location Schedules ───────────────────────────────────────────────

def get_guard_location_schedules(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM guard_location_schedules WHERE production_id=? ORDER BY location_name, date",
            (prod_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def upsert_guard_location_schedule(data):
    with get_db() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO guard_location_schedules
               (production_id, location_name, date, status, nb_guards,
                locked)
               VALUES (?,?,?,?,?,
                 COALESCE((SELECT locked FROM guard_location_schedules
                           WHERE production_id=? AND location_name=? AND date=?), 0))""",
            (data['production_id'], data['location_name'], data['date'],
             data['status'], data.get('nb_guards', 1),
             data['production_id'], data['location_name'], data['date'])
        )
        row = conn.execute(
            "SELECT * FROM guard_location_schedules WHERE production_id=? AND location_name=? AND date=?",
            (data['production_id'], data['location_name'], data['date'])
        ).fetchone()
        return dict(row) if row else None


def delete_guard_location_schedule(prod_id, location_name, date):
    with get_db() as conn:
        conn.execute(
            "DELETE FROM guard_location_schedules WHERE production_id=? AND location_name=? AND date=?",
            (prod_id, location_name, date)
        )


def lock_guard_location_schedules(prod_id, dates, locked):
    with get_db() as conn:
        for d in dates:
            conn.execute(
                "UPDATE guard_location_schedules SET locked=? WHERE production_id=? AND date=?",
                (1 if locked else 0, prod_id, d)
            )


def sync_guard_location_from_locations(prod_id):
    """Sync guard_location_schedules from location_schedules.
    For each location/date with P/F/W activity, ensure a guard_location_schedule
    entry exists (with default nb_guards from guard_post config per phase).
    Remove entries where the location no longer has activity.
    Returns the full list of guard_location_schedules."""
    loc_sites = get_location_sites(prod_id)
    loc_schedules = get_location_schedules(prod_id)
    type_by_name = {s['name']: s.get('location_type', 'game') for s in loc_sites}

    # Build guard_post lookup by name for phase-based defaults
    guard_posts = get_guard_posts(prod_id)
    gp_by_name = {gp['name']: gp for gp in guard_posts}

    # Build set of active (location_name, date) from location_schedules
    active_pairs = set()
    for ls in loc_schedules:
        active_pairs.add((ls['location_name'], ls['date']))

    with get_db() as conn:
        # Get existing guard_location_schedules
        existing = conn.execute(
            "SELECT * FROM guard_location_schedules WHERE production_id=?",
            (prod_id,)
        ).fetchall()
        existing_pairs = {(r['location_name'], r['date']): dict(r) for r in existing}

        # Insert missing entries with default nb_guards from guard_post config
        for ls in loc_schedules:
            key = (ls['location_name'], ls['date'])
            if key not in existing_pairs:
                status = ls.get('status', 'P')
                gp = gp_by_name.get(ls['location_name'])
                if gp:
                    phase_map = {'P': 'guards_prep', 'F': 'guards_film', 'W': 'guards_wrap'}
                    default_guards = gp.get(phase_map.get(status, 'guards_film'), 2) or 2
                else:
                    loc_type = type_by_name.get(ls['location_name'], 'game')
                    default_guards = 4 if loc_type == 'tribal_camp' else 2
                conn.execute(
                    """INSERT OR IGNORE INTO guard_location_schedules
                       (production_id, location_name, date, status, nb_guards, locked)
                       VALUES (?,?,?,?,?,0)""",
                    (prod_id, ls['location_name'], ls['date'],
                     status, default_guards)
                )

        # Remove entries where the location no longer has activity
        for (loc_name, date), entry in existing_pairs.items():
            if (loc_name, date) not in active_pairs:
                conn.execute(
                    "DELETE FROM guard_location_schedules WHERE production_id=? AND location_name=? AND date=?",
                    (prod_id, loc_name, date)
                )

    return get_guard_location_schedules(prod_id)


def update_guard_location_nb_guards(prod_id, location_name, date, nb_guards):
    """Update the nb_guards value for a specific guard_location_schedule entry."""
    with get_db() as conn:
        conn.execute(
            """UPDATE guard_location_schedules SET nb_guards=?
               WHERE production_id=? AND location_name=? AND date=?""",
            (nb_guards, prod_id, location_name, date)
        )
        row = conn.execute(
            "SELECT * FROM guard_location_schedules WHERE production_id=? AND location_name=? AND date=?",
            (prod_id, location_name, date)
        ).fetchone()
        return dict(row) if row else None


# ─── Location Sites CRUD ────────────────────────────────────────────────────

def get_location_sites(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM locations WHERE production_id=? ORDER BY location_type, name",
            (prod_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def create_location_site(data):
    cols = ["production_id", "name", "location_type", "type", "access_note", "lat", "lng",
            "price_p", "price_f", "price_w", "global_deal"]
    fields = {k: data[k] for k in cols if k in data}
    placeholders = ", ".join("?" * len(fields))
    col_names = ", ".join(fields.keys())
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO locations ({col_names}) VALUES ({placeholders})",
            list(fields.values())
        )
        row = conn.execute("SELECT * FROM locations WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row) if row else None


def update_location_site(loc_id, data):
    allowed = ["name", "location_type", "type", "access_note", "lat", "lng",
               "price_p", "price_f", "price_w", "global_deal"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [loc_id]
    with get_db() as conn:
        conn.execute(f"UPDATE locations SET {sets} WHERE id=?", vals)
        # Also update location_schedules if name changed
        if 'name' in data:
            old = conn.execute("SELECT name FROM locations WHERE id=?", (loc_id,)).fetchone()
            # name already updated above, but we need old name to cascade
            # Actually the update already happened, so this is trickier.
            # We handle cascade in the API layer instead.
        row = conn.execute("SELECT * FROM locations WHERE id=?", (loc_id,)).fetchone()
        return dict(row) if row else None


def delete_location_site(loc_id):
    with get_db() as conn:
        # Get name to cascade delete schedules
        loc = conn.execute("SELECT * FROM locations WHERE id=?", (loc_id,)).fetchone()
        if loc:
            loc = dict(loc)
            conn.execute(
                "DELETE FROM location_schedules WHERE production_id=? AND location_name=?",
                (loc['production_id'], loc['name'])
            )
        conn.execute("DELETE FROM shooting_day_locations WHERE location_id=?", (loc_id,))
        conn.execute("DELETE FROM locations WHERE id=?", (loc_id,))


def rename_location_in_schedules(prod_id, old_name, new_name):
    """Update location_name in location_schedules when a location is renamed."""
    with get_db() as conn:
        conn.execute(
            "UPDATE location_schedules SET location_name=? WHERE production_id=? AND location_name=?",
            (new_name, prod_id, old_name)
        )



# ─── Guard Posts CRUD ────────────────────────────────────────────────────────

def get_guard_posts(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM guard_posts WHERE production_id=? ORDER BY name",
            (prod_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def create_guard_post(data):
    cols = ["production_id", "name", "daily_rate", "notes", "guards_prep", "guards_film", "guards_wrap"]
    fields = {k: data[k] for k in cols if k in data}
    placeholders = ", ".join("?" * len(fields))
    col_names = ", ".join(fields.keys())
    with get_db() as conn:
        cur = conn.execute(
            f"INSERT INTO guard_posts ({col_names}) VALUES ({placeholders})",
            list(fields.values())
        )
        row = conn.execute("SELECT * FROM guard_posts WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row) if row else None


def update_guard_post(post_id, data):
    allowed = ["name", "daily_rate", "notes", "guards_prep", "guards_film", "guards_wrap"]
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [post_id]
    with get_db() as conn:
        conn.execute(f"UPDATE guard_posts SET {sets} WHERE id=?", vals)
        row = conn.execute("SELECT * FROM guard_posts WHERE id=?", (post_id,)).fetchone()
        return dict(row) if row else None


def delete_guard_post(post_id):
    with get_db() as conn:
        # Get name to cascade delete schedules
        post = conn.execute("SELECT * FROM guard_posts WHERE id=?", (post_id,)).fetchone()
        if post:
            post = dict(post)
            conn.execute(
                "DELETE FROM guard_location_schedules WHERE production_id=? AND location_name=?",
                (post['production_id'], post['name'])
            )
        conn.execute("DELETE FROM guard_posts WHERE id=?", (post_id,))


def rename_guard_post_in_schedules(prod_id, old_name, new_name):
    """Update location_name in guard_location_schedules when a guard post is renamed."""
    with get_db() as conn:
        conn.execute(
            "UPDATE guard_location_schedules SET location_name=? WHERE production_id=? AND location_name=?",
            (new_name, prod_id, old_name)
        )


# ─── FNB Daily Tracking ─────────────────────────────────────────────────────

def get_fnb_tracking(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM fnb_daily_tracking WHERE production_id=? ORDER BY date, category",
            (prod_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def upsert_fnb_tracking(data):
    with get_db() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO fnb_daily_tracking
               (production_id, date, category, pax_actual, cost_actual, notes)
               VALUES (?,?,?,?,?,?)""",
            (data['production_id'], data['date'], data['category'],
             data.get('pax_actual', 0), data.get('cost_actual', 0),
             data.get('notes'))
        )
        row = conn.execute(
            "SELECT * FROM fnb_daily_tracking WHERE production_id=? AND date=? AND category=?",
            (data['production_id'], data['date'], data['category'])
        ).fetchone()
        return dict(row) if row else None


def delete_fnb_tracking(entry_id):
    with get_db() as conn:
        conn.execute("DELETE FROM fnb_daily_tracking WHERE id=?", (entry_id,))


def get_fnb_summary(prod_id):
    """Return comparison of estimated vs actual FNB costs."""
    tracking = get_fnb_tracking(prod_id)

    # Actual totals by category
    actual_by_cat = {}
    for t in tracking:
        cat = t['category']
        if cat not in actual_by_cat:
            actual_by_cat[cat] = {'pax_total': 0, 'cost_total': 0}
        actual_by_cat[cat]['pax_total'] += t.get('pax_actual', 0) or 0
        actual_by_cat[cat]['cost_total'] += t.get('cost_actual', 0) or 0

    return {
        'tracking': tracking,
        'actual_by_category': actual_by_cat,
    }


# ─── FNB v2 (dynamic categories / items / entries) ──────────────────────────

def get_fnb_categories(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM fnb_categories WHERE production_id=? ORDER BY sort_order, name",
            (prod_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def create_fnb_category(data):
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO fnb_categories (production_id, name, color, sort_order) VALUES (?,?,?,?)",
            (data['production_id'], data['name'], data.get('color', '#F97316'),
             data.get('sort_order', 0))
        )
        row = conn.execute("SELECT * FROM fnb_categories WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)


def update_fnb_category(cat_id, data):
    with get_db() as conn:
        fields = []
        vals = []
        for k in ('name', 'color', 'sort_order'):
            if k in data:
                fields.append(f"{k}=?")
                vals.append(data[k])
        if fields:
            vals.append(cat_id)
            conn.execute(f"UPDATE fnb_categories SET {','.join(fields)} WHERE id=?", vals)
        row = conn.execute("SELECT * FROM fnb_categories WHERE id=?", (cat_id,)).fetchone()
        return dict(row) if row else None


def delete_fnb_category(cat_id):
    with get_db() as conn:
        # Cascade: delete entries for items in this category, then items, then category
        conn.execute("DELETE FROM fnb_entries WHERE item_id IN (SELECT id FROM fnb_items WHERE category_id=?)", (cat_id,))
        conn.execute("DELETE FROM fnb_items WHERE category_id=?", (cat_id,))
        conn.execute("DELETE FROM fnb_categories WHERE id=?", (cat_id,))


def get_fnb_items(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            """SELECT fi.*, fc.name AS category_name, fc.color AS category_color
               FROM fnb_items fi
               JOIN fnb_categories fc ON fi.category_id = fc.id
               WHERE fi.production_id=?
               ORDER BY fc.sort_order, fc.name, fi.sort_order, fi.name""",
            (prod_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def create_fnb_item(data):
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO fnb_items (category_id, production_id, name, unit, unit_price, notes, sort_order)
               VALUES (?,?,?,?,?,?,?)""",
            (data['category_id'], data['production_id'], data['name'],
             data.get('unit', 'unit'), data.get('unit_price', 0),
             data.get('notes'), data.get('sort_order', 0))
        )
        row = conn.execute(
            """SELECT fi.*, fc.name AS category_name, fc.color AS category_color
               FROM fnb_items fi JOIN fnb_categories fc ON fi.category_id = fc.id
               WHERE fi.id=?""", (cur.lastrowid,)
        ).fetchone()
        return dict(row)


def update_fnb_item(item_id, data):
    with get_db() as conn:
        fields = []
        vals = []
        for k in ('category_id', 'name', 'unit', 'unit_price', 'notes', 'sort_order'):
            if k in data:
                fields.append(f"{k}=?")
                vals.append(data[k])
        if fields:
            vals.append(item_id)
            conn.execute(f"UPDATE fnb_items SET {','.join(fields)} WHERE id=?", vals)
        row = conn.execute(
            """SELECT fi.*, fc.name AS category_name, fc.color AS category_color
               FROM fnb_items fi JOIN fnb_categories fc ON fi.category_id = fc.id
               WHERE fi.id=?""", (item_id,)
        ).fetchone()
        return dict(row) if row else None


def delete_fnb_item(item_id):
    with get_db() as conn:
        conn.execute("DELETE FROM fnb_entries WHERE item_id=?", (item_id,))
        conn.execute("DELETE FROM fnb_items WHERE id=?", (item_id,))


def get_fnb_entries(prod_id, entry_type=None):
    with get_db() as conn:
        sql = "SELECT * FROM fnb_entries WHERE production_id=?"
        params = [prod_id]
        if entry_type:
            sql += " AND entry_type=?"
            params.append(entry_type)
        sql += " ORDER BY date, item_id"
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]


def upsert_fnb_entry(data):
    with get_db() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO fnb_entries
               (item_id, production_id, entry_type, date, quantity, notes)
               VALUES (?,?,?,?,?,?)""",
            (data['item_id'], data['production_id'], data['entry_type'],
             data['date'], data.get('quantity', 0), data.get('notes'))
        )
        row = conn.execute(
            "SELECT * FROM fnb_entries WHERE item_id=? AND entry_type=? AND date=?",
            (data['item_id'], data['entry_type'], data['date'])
        ).fetchone()
        return dict(row) if row else None


def delete_fnb_entry(entry_id):
    with get_db() as conn:
        conn.execute("DELETE FROM fnb_entries WHERE id=?", (entry_id,))


def get_fnb_budget_data(prod_id):
    """Compute FNB budget from dynamic categories/items/entries."""
    categories = get_fnb_categories(prod_id)
    items = get_fnb_items(prod_id)
    entries = get_fnb_entries(prod_id)

    # Build lookup: item_id -> { purchase_qty, consumption_qty }
    item_totals = {}
    for e in entries:
        iid = e['item_id']
        if iid not in item_totals:
            item_totals[iid] = {'purchase': 0, 'consumption': 0}
        item_totals[iid][e['entry_type']] += e.get('quantity', 0) or 0

    # Build per-category summary
    cat_summary = {}
    for cat in categories:
        cat_summary[cat['id']] = {
            'name': cat['name'],
            'color': cat['color'],
            'purchase_total': 0,
            'consumption_total': 0,
        }

    grand_purchase = 0
    grand_consumption = 0
    for it in items:
        cid = it['category_id']
        totals = item_totals.get(it['id'], {'purchase': 0, 'consumption': 0})
        p_cost = totals['purchase'] * (it['unit_price'] or 0)
        c_cost = totals['consumption'] * (it['unit_price'] or 0)
        if cid in cat_summary:
            cat_summary[cid]['purchase_total'] += p_cost
            cat_summary[cid]['consumption_total'] += c_cost
        grand_purchase += p_cost
        grand_consumption += c_cost

    return {
        'categories': list(cat_summary.values()),
        'grand_purchase': round(grand_purchase, 2),
        'grand_consumption': round(grand_consumption, 2),
        'balance': round(grand_purchase - grand_consumption, 2),
    }


# ─── Budget ───────────────────────────────────────────────────────────────────

def get_budget(prod_id):
    """Aggregate all department costs into a unified budget view."""
    assignments = get_boat_assignments(prod_id, context='boats')
    depts = {d["name"]: d["id"] for d in get_departments(prod_id)}

    rows = []
    grand_total_est = 0
    grand_total_act = 0

    def _add_rows(dept_name, items, name_key='function_name', entity_key='boat_name', rate_est_key='boat_daily_rate_estimate'):
        nonlocal grand_total_est, grand_total_act
        for a in items:
            if not a.get("working_days"):
                continue
            est = a.get("amount_estimate", 0) or 0
            act = a.get("amount_actual")
            grand_total_est += est
            if act:
                grand_total_act += act
            rows.append({
                "department": dept_name,
                "name": a.get(name_key, ""),
                "boat": a.get("boat_name_override") or a.get(entity_key) or a.get("helper_name_override") or a.get("vehicle_name_override") or "",
                "vendor": a.get("vendor") or "",
                "start_date": a.get("start_date"),
                "end_date": a.get("end_date"),
                "working_days": a["working_days"],
                "unit_price_estimate": (a.get("price_override") or a.get(rate_est_key) or 0),
                "amount_estimate": est,
                "amount_actual": act,
                "source": "auto",
            })

    # BOATS
    _add_rows("BOATS", assignments)

    # PICTURE BOATS
    from database import get_picture_boat_assignments
    pb_asgns = get_picture_boat_assignments(prod_id)
    _add_rows("PICTURE BOATS", pb_asgns, rate_est_key='boat_daily_rate_estimate')

    # SECURITY BOATS
    sb_asgns = get_security_boat_assignments(prod_id)
    _add_rows("SECURITY BOATS", sb_asgns, rate_est_key='boat_daily_rate_estimate')

    # TRANSPORT
    from database import get_transport_assignments
    ta_asgns = get_transport_assignments(prod_id)
    _add_rows("TRANSPORT", ta_asgns, entity_key='vehicle_name', rate_est_key='vehicle_daily_rate_estimate')

    # LABOUR (ex-HELPERS)
    helper_asgns = get_helper_assignments(prod_id)
    _add_rows("LABOUR", helper_asgns, entity_key='helper_name', rate_est_key='helper_daily_rate_estimate')

    # FNB (dynamic from fnb_categories/items/entries)
    fnb_budget = get_fnb_budget_data(prod_id)
    for cat_info in fnb_budget['categories']:
        p_total = cat_info['purchase_total']
        c_total = cat_info['consumption_total']
        if p_total > 0 or c_total > 0:
            grand_total_est += p_total
            if c_total > 0:
                grand_total_act += c_total
            rows.append({
                "department": "FNB",
                "name": cat_info['name'],
                "boat": "",
                "vendor": "",
                "start_date": None,
                "end_date": None,
                "working_days": 1,
                "unit_price_estimate": p_total,
                "amount_estimate": p_total,
                "amount_actual": c_total if c_total > 0 else None,
                "source": "auto",
            })

    # FUEL (static budget data)
    fuel_data = [
        {"name": "BOAT FUEL & OIL", "amount_estimate": 145000},
        {"name": "VEHICLE FUEL & OIL", "amount_estimate": 10300},
        {"name": "GENERATOR FUEL", "amount_estimate": 21000},
        {"name": "HEAVY MACHINERY FUEL", "amount_estimate": 3000},
    ]
    for f in fuel_data:
        grand_total_est += f["amount_estimate"]
        rows.append({
            "department": "FUEL",
            "name": f["name"],
            "boat": "",
            "vendor": "",
            "start_date": None,
            "end_date": None,
            "working_days": 1,
            "unit_price_estimate": f["amount_estimate"],
            "amount_estimate": f["amount_estimate"],
            "amount_actual": None,
            "source": "auto",
        })

    # LOCATIONS (site pricing)
    loc_schedules = get_location_schedules(prod_id)
    loc_sites = get_location_sites(prod_id)
    site_pricing = {}
    for s in loc_sites:
        site_pricing[s['name']] = {
            'price_p': s.get('price_p') or 0,
            'price_f': s.get('price_f') or 0,
            'price_w': s.get('price_w') or 0,
            'global_deal': s.get('global_deal'),
        }

    # Count P/F/W days per location
    loc_day_counts = {}
    for ls in loc_schedules:
        loc_name = ls['location_name']
        loc_day_counts.setdefault(loc_name, {'P': 0, 'F': 0, 'W': 0})
        if ls['status'] in ('P', 'F', 'W'):
            loc_day_counts[loc_name][ls['status']] += 1

    for loc_name, counts in loc_day_counts.items():
        pricing = site_pricing.get(loc_name, {'price_p': 0, 'price_f': 0, 'price_w': 0, 'global_deal': None})
        if pricing['global_deal'] and pricing['global_deal'] > 0:
            total = pricing['global_deal']
        else:
            total = (counts['P'] * pricing['price_p'] +
                     counts['F'] * pricing['price_f'] +
                     counts['W'] * pricing['price_w'])
        if total > 0:
            grand_total_est += total
            days_str = []
            if counts['P']: days_str.append(f"{counts['P']}P")
            if counts['F']: days_str.append(f"{counts['F']}F")
            if counts['W']: days_str.append(f"{counts['W']}W")
            rows.append({
                "department": "LOCATIONS",
                "name": loc_name,
                "boat": "",
                "vendor": "GLOBAL DEAL" if (pricing['global_deal'] and pricing['global_deal'] > 0) else ", ".join(days_str),
                "start_date": None,
                "end_date": None,
                "working_days": counts['P'] + counts['F'] + counts['W'],
                "unit_price_estimate": pricing['global_deal'] if (pricing['global_deal'] and pricing['global_deal'] > 0) else total / max(counts['P'] + counts['F'] + counts['W'], 1),
                "amount_estimate": total,
                "amount_actual": None,
                "source": "auto",
            })

    # GUARDS (merged: Location Guards + Base Camp)
    # Location Guards: read from guard_location_schedules (actual stored values)
    guard_loc_schedules = get_guard_location_schedules(prod_id)
    loc_guard_by_loc = {}
    for gls in guard_loc_schedules:
        loc_name = gls['location_name']
        nb = gls.get('nb_guards', 2)
        loc_guard_by_loc.setdefault(loc_name, {'days': 0, 'total_guard_days': 0, 'cost': 0})
        loc_guard_by_loc[loc_name]['days'] += 1
        loc_guard_by_loc[loc_name]['total_guard_days'] += nb
        loc_guard_by_loc[loc_name]['cost'] += nb * 45

    if loc_guard_by_loc:
        for loc, info in loc_guard_by_loc.items():
            grand_total_est += info['cost']
            rows.append({
                "department": "GUARDS",
                "name": f"LOCATION - {loc}",
                "boat": "",
                "vendor": "LOCALS",
                "start_date": None,
                "end_date": None,
                "working_days": info['total_guard_days'],
                "unit_price_estimate": 45,
                "amount_estimate": info['cost'],
                "amount_actual": None,
                "source": "auto",
            })

    # Base Camp guards
    gc_asgns = get_guard_camp_assignments(prod_id)
    _add_rows("GUARDS", gc_asgns, entity_key='helper_name', rate_est_key='helper_daily_rate_estimate')

    # Manual budget_lines (other departments)
    with get_db() as conn:
        manual = conn.execute("""
            SELECT bl.*, d.name AS dept_name
            FROM budget_lines bl
            LEFT JOIN departments d ON bl.department_id = d.id
            WHERE bl.production_id = ? AND bl.source != 'auto'
            ORDER BY bl.department_id, bl.id
        """, (prod_id,)).fetchall()
        for r in manual:
            d = dict(r)
            grand_total_est += d.get("amount_estimate") or 0
            if d.get("amount_actual"):
                grand_total_act += d["amount_actual"]
            rows.append(d)

    # Summary by department
    by_dept = {}
    for r in rows:
        dept = r.get("dept_name") or r.get("department", "BOATS")
        by_dept.setdefault(dept, {"total_estimate": 0, "total_actual": 0, "lines": []})
        by_dept[dept]["total_estimate"] += r.get("amount_estimate") or 0
        by_dept[dept]["lines"].append(r)
        if r.get("amount_actual"):
            by_dept[dept]["total_actual"] += r["amount_actual"]

    return {
        "rows": rows,
        "by_department": by_dept,
        "grand_total_estimate": round(grand_total_est, 2),
        "grand_total_actual":   round(grand_total_act, 2),
        "fnb_purchase_total":   fnb_budget['grand_purchase'],
        "fnb_consumption_total": fnb_budget['grand_consumption'],
    }


def _is_assignment_active_on(date_str, assignment):
    """Check if an assignment is active on a specific date.

    Checks: date within [start, end], not overridden as 'empty',
    respects include_sunday flag.
    """
    start = assignment.get("start_date")
    end = assignment.get("end_date")
    if not start or not end:
        return False
    if date_str < start[:10] or date_str > end[:10]:
        # Check if explicitly overridden outside range
        try:
            overrides = json.loads(assignment.get("day_overrides") or "{}")
        except Exception:
            overrides = {}
        status = overrides.get(date_str)
        return bool(status and status != "empty")

    try:
        overrides = json.loads(assignment.get("day_overrides") or "{}")
    except Exception:
        overrides = {}

    if date_str in overrides:
        return overrides[date_str] and overrides[date_str] != "empty"

    # Check Sunday exclusion
    if not assignment.get("include_sunday", 1):
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
        if d.weekday() == 6:
            return False

    return True


def get_daily_budget(prod_id):
    """Compute cost breakdown per shooting day across all departments."""
    prod = get_production(prod_id)
    if not prod:
        return {"days": [], "averages": {}}

    shooting_days = get_shooting_days(prod_id)
    if not shooting_days:
        return {"days": [], "averages": {}}

    # Build date -> day info map (with day type from events)
    day_map = {}
    for sd in shooting_days:
        date = sd.get("date", "")[:10]
        if not date:
            continue
        events = sd.get("events", [])
        # Determine day type: game > arena > council > off > standard
        day_type = "standard"
        for ev in events:
            et = ev.get("event_type", "")
            if et == "game":
                day_type = "game"
                break
            elif et == "arena":
                day_type = "arena"
            elif et == "council" and day_type not in ("arena",):
                day_type = "council"
            elif et == "off" and day_type == "standard":
                day_type = "off"
        day_map[date] = {
            "date": date,
            "day_number": sd.get("day_number"),
            "day_type": day_type,
            "location": sd.get("location", ""),
            "boats": 0, "picture_boats": 0, "security_boats": 0,
            "transport": 0, "labour": 0, "guards": 0,
            "locations": 0, "fnb": 0, "fuel": 0,
            "total": 0,
        }

    all_dates = sorted(day_map.keys())
    if not all_dates:
        return {"days": [], "averages": {}}
    num_days = len(all_dates)

    def _daily_rate(assignment, rate_key):
        return assignment.get("price_override") or assignment.get(rate_key) or 0

    # --- BOATS ---
    boat_asgns = get_boat_assignments(prod_id, context='boats')
    for a in boat_asgns:
        rate = _daily_rate(a, "boat_daily_rate_estimate")
        for date in all_dates:
            if _is_assignment_active_on(date, a):
                day_map[date]["boats"] += rate

    # --- PICTURE BOATS ---
    pb_asgns = get_picture_boat_assignments(prod_id)
    for a in pb_asgns:
        rate = _daily_rate(a, "boat_daily_rate_estimate")
        for date in all_dates:
            if _is_assignment_active_on(date, a):
                day_map[date]["picture_boats"] += rate

    # --- SECURITY BOATS ---
    sb_asgns = get_security_boat_assignments(prod_id)
    for a in sb_asgns:
        rate = _daily_rate(a, "boat_daily_rate_estimate")
        for date in all_dates:
            if _is_assignment_active_on(date, a):
                day_map[date]["security_boats"] += rate

    # --- TRANSPORT ---
    tr_asgns = get_transport_assignments(prod_id)
    for a in tr_asgns:
        rate = _daily_rate(a, "vehicle_daily_rate_estimate")
        for date in all_dates:
            if _is_assignment_active_on(date, a):
                day_map[date]["transport"] += rate

    # --- LABOUR ---
    lb_asgns = get_helper_assignments(prod_id)
    for a in lb_asgns:
        rate = _daily_rate(a, "helper_daily_rate_estimate")
        for date in all_dates:
            if _is_assignment_active_on(date, a):
                day_map[date]["labour"] += rate

    # --- GUARDS (Base Camp) ---
    gc_asgns = get_guard_camp_assignments(prod_id)
    for a in gc_asgns:
        rate = _daily_rate(a, "helper_daily_rate_estimate")
        for date in all_dates:
            if _is_assignment_active_on(date, a):
                day_map[date]["guards"] += rate

    # --- GUARDS (Location) ---
    guard_loc_schedules = get_guard_location_schedules(prod_id)
    for gls in guard_loc_schedules:
        date = (gls.get("date") or "")[:10]
        if date in day_map:
            nb = gls.get("nb_guards", 2)
            day_map[date]["guards"] += nb * 45

    # --- LOCATIONS ---
    loc_schedules = get_location_schedules(prod_id)
    loc_sites = get_location_sites(prod_id)
    site_pricing = {}
    for s in loc_sites:
        site_pricing[s["name"]] = {
            "price_p": s.get("price_p") or 0,
            "price_f": s.get("price_f") or 0,
            "price_w": s.get("price_w") or 0,
            "global_deal": s.get("global_deal"),
        }
    # For global_deal locations, distribute evenly across their scheduled days
    loc_global_days = {}
    for ls in loc_schedules:
        loc_name = ls["location_name"]
        pricing = site_pricing.get(loc_name, {})
        if pricing.get("global_deal") and pricing["global_deal"] > 0:
            loc_global_days.setdefault(loc_name, [])
            if ls["status"] in ("P", "F", "W"):
                loc_global_days[loc_name].append(ls)
        else:
            date = (ls.get("date") or "")[:10]
            if date in day_map and ls["status"] in ("P", "F", "W"):
                price_key = f"price_{ls['status'].lower()}"
                day_map[date]["locations"] += pricing.get(price_key, 0)

    # Distribute global deals evenly
    for loc_name, entries in loc_global_days.items():
        if entries:
            deal = site_pricing[loc_name]["global_deal"]
            per_day = deal / len(entries)
            for ls in entries:
                date = (ls.get("date") or "")[:10]
                if date in day_map:
                    day_map[date]["locations"] += per_day

    # --- FNB (distribute evenly across all days) ---
    fnb_budget = get_fnb_budget_data(prod_id)
    fnb_total = sum(c.get("purchase_total", 0) or 0 for c in fnb_budget.get("categories", []))
    if fnb_total > 0 and num_days > 0:
        fnb_per_day = fnb_total / num_days
        for date in all_dates:
            day_map[date]["fnb"] = round(fnb_per_day, 2)

    # --- FUEL (distribute evenly across all days) ---
    fuel_total = 145000 + 10300 + 21000 + 3000  # hardcoded totals
    fuel_per_day = fuel_total / num_days if num_days > 0 else 0
    for date in all_dates:
        day_map[date]["fuel"] = round(fuel_per_day, 2)

    # Compute totals per day and round
    days_list = []
    for date in all_dates:
        d = day_map[date]
        for key in ("boats", "picture_boats", "security_boats", "transport",
                     "labour", "guards", "locations"):
            d[key] = round(d[key], 2)
        d["total"] = round(sum(d[k] for k in (
            "boats", "picture_boats", "security_boats", "transport",
            "labour", "guards", "locations", "fnb", "fuel"
        )), 2)
        days_list.append(d)

    # Compute averages by day type
    type_totals = {}
    for d in days_list:
        dt = d["day_type"]
        type_totals.setdefault(dt, {"sum": 0, "count": 0})
        type_totals[dt]["sum"] += d["total"]
        type_totals[dt]["count"] += 1

    averages = {}
    for dt, info in type_totals.items():
        averages[dt] = round(info["sum"] / info["count"], 2) if info["count"] > 0 else 0

    return {
        "days": days_list,
        "averages": averages,
        "grand_total": round(sum(d["total"] for d in days_list), 2),
    }


# ─── History / Undo ───────────────────────────────────────────────────────────

def get_history(prod_id, limit=50, entity_type=None, entity_id=None,
                user_id=None, action_type=None, date_from=None, date_to=None):
    """Return recent history entries with filtering by production, module, user, dates, action."""
    with get_db() as conn:
        query = "SELECT * FROM history"
        params = []
        conditions = []
        # Filter by production (if column populated)
        if prod_id:
            conditions.append("(production_id = ? OR production_id IS NULL)")
            params.append(prod_id)
        if entity_type:
            conditions.append("table_name = ?")
            params.append(entity_type)
        if entity_id:
            conditions.append("record_id = ?")
            params.append(entity_id)
        if user_id:
            conditions.append("user_id = ?")
            params.append(user_id)
        if action_type:
            conditions.append("action = ?")
            params.append(action_type)
        if date_from:
            conditions.append("created_at >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("created_at <= ?")
            params.append(date_to + " 23:59:59" if len(date_to) == 10 else date_to)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def undo_history_entry(history_id):
    """Generic undo: restore old_data for a given history entry."""
    with get_db() as conn:
        entry = conn.execute("SELECT * FROM history WHERE id=?", (history_id,)).fetchone()
        if not entry:
            return {"message": "History entry not found"}
        entry = dict(entry)
        table = entry["table_name"]
        record_id = entry["record_id"]
        action = entry["action"]
        old_data = json.loads(entry["old_data"]) if entry["old_data"] else None

        # Validate table name to prevent injection
        allowed_tables = {
            "boat_assignments", "picture_boat_assignments", "security_boat_assignments",
            "transport_assignments", "helper_assignments", "guard_camp_assignments",
            "boats", "picture_boats", "security_boats", "transport_vehicles",
            "helpers", "guard_camp_workers", "fuel_entries", "fuel_machinery",
            "shooting_days",
        }
        if table not in allowed_tables:
            return {"message": f"Undo not supported for table: {table}"}

        if action == "create":
            # Undo create = delete
            conn.execute(f"DELETE FROM {table} WHERE id=?", (record_id,))
        elif action == "update" and old_data:
            # Undo update = restore old values
            cols = [k for k in old_data.keys() if k != 'id']
            set_clause = ", ".join(f"{k}=?" for k in cols)
            vals = [old_data[k] for k in cols]
            vals.append(record_id)
            conn.execute(f"UPDATE {table} SET {set_clause} WHERE id=?", vals)
        elif action == "delete" and old_data:
            # Undo delete = re-insert
            cols = list(old_data.keys())
            placeholders = ", ".join("?" for _ in cols)
            col_names = ", ".join(cols)
            vals = [old_data[k] for k in cols]
            conn.execute(f"INSERT OR REPLACE INTO {table} ({col_names}) VALUES ({placeholders})", vals)

        # Remove the history entry
        conn.execute("DELETE FROM history WHERE id=?", (history_id,))
        return {"message": "Undo successful", "action": action, "table": table, "restored": old_data}


def undo_last_boat_assignment(prod_id):
    """Undo the most recent boat_assignment change for this production."""
    with get_db() as conn:
        last = conn.execute(
            """SELECT h.* FROM history h
               WHERE h.table_name = 'boat_assignments'
               ORDER BY h.id DESC LIMIT 1"""
        ).fetchone()
        if not last:
            return {"message": "Nothing to undo"}
        last = dict(last)
        old = json.loads(last["old_data"]) if last["old_data"] else None
        record_id = last["record_id"]

        # Remove current assignment
        conn.execute("DELETE FROM boat_assignments WHERE id=?", (record_id,))

        if old and last["action"] in ("update", "delete"):
            conn.execute(
                """INSERT INTO boat_assignments
                   (id, boat_function_id, boat_id, boat_name_override,
                    start_date, end_date, price_override, notes, assignment_status, day_overrides)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (old.get("id"), old.get("boat_function_id"), old.get("boat_id"),
                 old.get("boat_name_override"), old.get("start_date"),
                 old.get("end_date"), old.get("price_override"), old.get("notes"),
                 old.get("assignment_status", "confirmed"),
                 old.get("day_overrides", "{}"))
            )

        conn.execute("DELETE FROM history WHERE id=?", (last["id"],))
        return {"message": "Undo successful", "restored": old}


# ─── Budget Snapshots (AXE 6.3) ───────────────────────────────────────────────

def create_budget_snapshot(prod_id, trigger_type='manual', trigger_detail=None,
                           user_id=None, user_nickname=None):
    """Take a full budget snapshot and store it."""
    budget = get_budget(prod_id)
    snapshot_data = json.dumps(budget, default=str)
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO budget_snapshots
               (production_id, trigger_type, trigger_detail, user_id, user_nickname,
                snapshot_data, grand_total_estimate, grand_total_actual)
               VALUES (?,?,?,?,?,?,?,?)""",
            (prod_id, trigger_type, trigger_detail, user_id, user_nickname,
             snapshot_data,
             budget.get('grand_total_estimate', 0),
             budget.get('grand_total_actual', 0))
        )
        return cur.lastrowid


def get_budget_snapshots(prod_id, limit=50):
    """List budget snapshots for a production (without full data)."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT id, production_id, trigger_type, trigger_detail,
                      user_id, user_nickname, grand_total_estimate, grand_total_actual, created_at
               FROM budget_snapshots
               WHERE production_id = ?
               ORDER BY created_at DESC
               LIMIT ?""",
            (prod_id, limit)
        ).fetchall()
        return [dict(r) for r in rows]


def get_budget_snapshot(snapshot_id):
    """Get a single budget snapshot with full data."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM budget_snapshots WHERE id = ?", (snapshot_id,)
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        d['snapshot_data'] = json.loads(d['snapshot_data'])
        return d


def compare_budget_snapshots(snap_id_a, snap_id_b):
    """Compare two budget snapshots and return differences."""
    a = get_budget_snapshot(snap_id_a)
    b = get_budget_snapshot(snap_id_b)
    if not a or not b:
        return None

    a_data = a['snapshot_data']
    b_data = b['snapshot_data']

    # Build department-level comparison
    a_depts = a_data.get('by_department', {})
    b_depts = b_data.get('by_department', {})
    all_depts = sorted(set(list(a_depts.keys()) + list(b_depts.keys())))

    dept_comparison = []
    for dept in all_depts:
        a_est = a_depts.get(dept, {}).get('total_estimate', 0)
        b_est = b_depts.get(dept, {}).get('total_estimate', 0)
        diff = b_est - a_est
        pct = round(diff / a_est * 100, 1) if a_est else (100.0 if b_est else 0.0)
        dept_comparison.append({
            'department': dept,
            'snapshot_a': round(a_est, 2),
            'snapshot_b': round(b_est, 2),
            'difference': round(diff, 2),
            'change_pct': pct,
        })

    # Build line-level comparison
    a_rows = {(r.get('department', ''), r.get('name', '')): r for r in a_data.get('rows', [])}
    b_rows = {(r.get('department', ''), r.get('name', '')): r for r in b_data.get('rows', [])}
    all_keys = sorted(set(list(a_rows.keys()) + list(b_rows.keys())))

    line_changes = []
    for key in all_keys:
        ar = a_rows.get(key)
        br = b_rows.get(key)
        a_amt = (ar or {}).get('amount_estimate', 0) or 0
        b_amt = (br or {}).get('amount_estimate', 0) or 0
        if abs(b_amt - a_amt) > 0.01:
            line_changes.append({
                'department': key[0],
                'name': key[1],
                'snapshot_a': round(a_amt, 2),
                'snapshot_b': round(b_amt, 2),
                'difference': round(b_amt - a_amt, 2),
            })

    return {
        'snapshot_a': {
            'id': a['id'], 'created_at': a['created_at'],
            'trigger_type': a['trigger_type'], 'trigger_detail': a['trigger_detail'],
            'grand_total_estimate': a['grand_total_estimate'],
        },
        'snapshot_b': {
            'id': b['id'], 'created_at': b['created_at'],
            'trigger_type': b['trigger_type'], 'trigger_detail': b['trigger_detail'],
            'grand_total_estimate': b['grand_total_estimate'],
        },
        'total_diff': round(b['grand_total_estimate'] - a['grand_total_estimate'], 2),
        'departments': dept_comparison,
        'line_changes': line_changes,
    }


def delete_budget_snapshot(snapshot_id):
    """Delete a budget snapshot."""
    with get_db() as conn:
        conn.execute("DELETE FROM budget_snapshots WHERE id = ?", (snapshot_id,))


# ─── Price Change Log (AXE 6.3) ──────────────────────────────────────────────

def log_price_change(prod_id, entity_type, entity_id, entity_name,
                     field_changed, old_value, new_value,
                     user_id=None, user_nickname=None):
    """Record a price/rate modification."""
    if old_value == new_value:
        return
    with get_db() as conn:
        conn.execute(
            """INSERT INTO price_change_log
               (production_id, entity_type, entity_id, entity_name,
                field_changed, old_value, new_value, user_id, user_nickname)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (prod_id, entity_type, entity_id, entity_name,
             field_changed, old_value, new_value, user_id, user_nickname)
        )


def get_price_change_log(prod_id, limit=100, entity_type=None, entity_id=None):
    """Get price change log entries."""
    query = """SELECT * FROM price_change_log WHERE production_id = ?"""
    params = [prod_id]
    if entity_type:
        query += " AND entity_type = ?"
        params.append(entity_type)
    if entity_id:
        query += " AND entity_id = ?"
        params.append(entity_id)
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


# ─── User Export Preferences (AXE 2.2) ────────────────────────────────────────

def get_export_preference(user_id, production_id, module):
    """Get last export date range for this user/production/module."""
    with get_db() as conn:
        r = conn.execute(
            "SELECT last_export_from, last_export_to FROM user_export_preferences "
            "WHERE user_id=? AND production_id=? AND module=?",
            (user_id, production_id, module)
        ).fetchone()
        return dict(r) if r else None


def save_export_preference(user_id, production_id, module, date_from, date_to):
    """Save last export date range for this user/production/module."""
    with get_db() as conn:
        conn.execute(
            "INSERT INTO user_export_preferences (user_id, production_id, module, last_export_from, last_export_to, updated_at) "
            "VALUES (?, ?, ?, ?, ?, datetime('now')) "
            "ON CONFLICT(user_id, production_id, module) DO UPDATE SET "
            "last_export_from=excluded.last_export_from, last_export_to=excluded.last_export_to, updated_at=datetime('now')",
            (user_id, production_id, module, date_from, date_to)
        )


def get_module_date_range(production_id, module):
    """Get the first and last date with data for a module.
    Returns {'first_date': str, 'last_date': str} or None."""
    date_queries = {
        'boats': "SELECT MIN(start_date) as first_date, MAX(end_date) as last_date FROM boat_assignments ba JOIN boat_functions bf ON ba.boat_function_id=bf.id WHERE bf.production_id=?",
        'picture_boats': "SELECT MIN(start_date) as first_date, MAX(end_date) as last_date FROM picture_boat_assignments pa JOIN boat_functions bf ON pa.boat_function_id=bf.id WHERE bf.production_id=?",
        'security_boats': "SELECT MIN(start_date) as first_date, MAX(end_date) as last_date FROM security_boat_assignments sa JOIN boat_functions bf ON sa.boat_function_id=bf.id WHERE bf.production_id=?",
        'transport': "SELECT MIN(start_date) as first_date, MAX(end_date) as last_date FROM transport_assignments ta JOIN boat_functions bf ON ta.boat_function_id=bf.id WHERE bf.production_id=?",
        'labour': "SELECT MIN(start_date) as first_date, MAX(end_date) as last_date FROM helper_assignments ha JOIN boat_functions bf ON ha.boat_function_id=bf.id WHERE bf.production_id=?",
        'guards': "SELECT MIN(start_date) as first_date, MAX(end_date) as last_date FROM guard_camp_assignments ga JOIN boat_functions bf ON ga.boat_function_id=bf.id WHERE bf.production_id=?",
        'fuel': "SELECT MIN(date) as first_date, MAX(date) as last_date FROM fuel_entries WHERE production_id=?",
        'fnb': "SELECT MIN(date) as first_date, MAX(date) as last_date FROM fnb_daily_tracking WHERE production_id=?",
        'budget': "SELECT MIN(start_date) as first_date, MAX(end_date) as last_date FROM boat_assignments ba JOIN boat_functions bf ON ba.boat_function_id=bf.id WHERE bf.production_id=?",
        'locations': "SELECT MIN(date) as first_date, MAX(date) as last_date FROM location_schedules WHERE production_id=?",
    }
    query = date_queries.get(module)
    if not query:
        return None
    with get_db() as conn:
        r = conn.execute(query, (production_id,)).fetchone()
        if r and r['first_date']:
            return {'first_date': r['first_date'], 'last_date': r['last_date']}
    return None


# ─── Settings ─────────────────────────────────────────────────────────────────

def get_setting(key, default=None):
    with get_db() as conn:
        r = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return r["value"] if r else default


def set_setting(key, value):
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)", (key, value)
        )


# ─── PDT Cascade (AXE 7.2) ──────────────────────────────────────────────────

_ASSIGNMENT_TABLES = [
    ("boat_assignments", "boat_id", "boats", "name", "Boats"),
    ("picture_boat_assignments", "picture_boat_id", "picture_boats", "name", "Picture Boats"),
    ("security_boat_assignments", "security_boat_id", "security_boats", "name", "Security Boats"),
    ("transport_assignments", "vehicle_id", "vehicles", "name", "Transport"),
    ("helper_assignments", "helper_id", "helpers", "name", "Labour"),
    ("guard_camp_assignments", None, None, None, "Guards"),
]


def cascade_preview(prod_id, day_id, old_date, new_date):
    """Preview what would change if a shooting day moves from old_date to new_date.
    Returns a dict with affected items grouped by category."""
    result = {
        "assignments": [],
        "fuel_entries": [],
        "location_schedules": [],
        "summary": {"assignments": 0, "fuel_entries": 0, "location_schedules": 0},
    }
    with get_db() as conn:
        # 1. Assignments with day_overrides containing old_date
        for table, entity_col, entity_table, name_col, label in _ASSIGNMENT_TABLES:
            rows = conn.execute(
                f"SELECT a.*, bf.name AS function_name "
                f"FROM {table} a "
                f"JOIN boat_functions bf ON a.boat_function_id = bf.id "
                f"WHERE bf.production_id = ?",
                (prod_id,)
            ).fetchall()
            for row in rows:
                rd = dict(row)
                overrides = json.loads(rd.get("day_overrides") or "{}")
                in_overrides = old_date in overrides
                start_match = rd.get("start_date") == old_date
                end_match = rd.get("end_date") == old_date
                # Only show assignments that would actually change
                if not (in_overrides or start_match or end_match):
                    continue
                # Resolve entity name
                entity_name = None
                if entity_col and entity_table and rd.get(entity_col):
                    try:
                        ent = conn.execute(
                            f"SELECT {name_col} FROM {entity_table} WHERE id=?",
                            (rd[entity_col],)
                        ).fetchone()
                        if ent:
                            entity_name = ent[name_col]
                    except Exception:
                        pass
                name_override = (rd.get("boat_name_override")
                                 or rd.get("vehicle_name_override")
                                 or rd.get("helper_name_override"))
                impact = []
                if in_overrides:
                    impact.append("override jour")
                if start_match:
                    impact.append("date debut")
                if end_match:
                    impact.append("date fin")
                result["assignments"].append({
                    "table": table,
                    "id": rd["id"],
                    "module": label,
                    "function_name": rd.get("function_name"),
                    "entity_name": entity_name or name_override or f"#{rd['id']}",
                    "impact": impact,
                    "override_status": overrides.get(old_date) if in_overrides else None,
                })

        result["summary"]["assignments"] = len(result["assignments"])

        # 2. Fuel entries on old_date
        fuel_rows = conn.execute(
            "SELECT * FROM fuel_entries WHERE production_id=? AND date=?",
            (prod_id, old_date)
        ).fetchall()
        for fr in fuel_rows:
            result["fuel_entries"].append({
                "id": fr["id"],
                "source_type": fr["source_type"],
                "assignment_id": fr["assignment_id"],
                "liters": fr["liters"],
                "fuel_type": fr["fuel_type"],
            })
        result["summary"]["fuel_entries"] = len(result["fuel_entries"])

        # 3. Location schedules on old_date
        loc_rows = conn.execute(
            "SELECT * FROM location_schedules WHERE production_id=? AND date=?",
            (prod_id, old_date)
        ).fetchall()
        for lr in loc_rows:
            result["location_schedules"].append({
                "id": lr["id"],
                "location_name": lr["location_name"],
                "status": lr["status"],
                "locked": lr["locked"],
            })
        result["summary"]["location_schedules"] = len(result["location_schedules"])

    return result


def cascade_apply(prod_id, day_id, old_date, new_date):
    """Apply cascade: move date-keyed data from old_date to new_date."""
    applied = {"assignments": 0, "fuel_entries": 0, "location_schedules": 0}
    with get_db() as conn:
        # 1. Update assignment day_overrides
        for table, entity_col, entity_table, name_col, label in _ASSIGNMENT_TABLES:
            rows = conn.execute(
                f"SELECT a.id, a.day_overrides, a.start_date, a.end_date "
                f"FROM {table} a "
                f"JOIN boat_functions bf ON a.boat_function_id = bf.id "
                f"WHERE bf.production_id = ?",
                (prod_id,)
            ).fetchall()
            for row in rows:
                overrides = json.loads(row["day_overrides"] or "{}")
                in_overrides = old_date in overrides
                start_match = row["start_date"] == old_date
                end_match = row["end_date"] == old_date
                # Only cascade if there's actually something to change
                if not (in_overrides or start_match or end_match):
                    continue

                new_overrides = dict(overrides)
                if in_overrides:
                    new_overrides[new_date] = new_overrides.pop(old_date)

                new_start = new_date if start_match else row["start_date"]
                new_end = new_date if end_match else row["end_date"]

                conn.execute(
                    f"UPDATE {table} SET day_overrides=?, start_date=?, end_date=?, "
                    f"updated_at=datetime('now') WHERE id=?",
                    (json.dumps(new_overrides), new_start, new_end, row["id"])
                )
                applied["assignments"] += 1

        # 2. Update fuel entries date
        cur = conn.execute(
            "UPDATE fuel_entries SET date=? WHERE production_id=? AND date=?",
            (new_date, prod_id, old_date)
        )
        applied["fuel_entries"] = cur.rowcount

        # 3. Location schedules are handled by the existing sync logic
        # (frontend calls _syncPdtLocationsDelete + _syncPdtLocations)
        # But we also move non-F entries (P/W) that might exist on old_date
        loc_rows = conn.execute(
            "SELECT * FROM location_schedules WHERE production_id=? AND date=? AND locked=0",
            (prod_id, old_date)
        ).fetchall()
        for lr in loc_rows:
            # Check if new_date already has an entry for this location
            existing = conn.execute(
                "SELECT id FROM location_schedules "
                "WHERE production_id=? AND location_name=? AND date=?",
                (prod_id, lr["location_name"], new_date)
            ).fetchone()
            if existing:
                # Update existing entry
                conn.execute(
                    "UPDATE location_schedules SET status=? WHERE id=?",
                    (lr["status"], existing["id"])
                )
            else:
                # Move the entry to new date
                conn.execute(
                    "UPDATE location_schedules SET date=? WHERE id=?",
                    (new_date, lr["id"])
                )
            applied["location_schedules"] += 1

        # Log cascade action in history
        _log_history(conn, 'shooting_days', day_id, 'cascade',
                     {"old_date": old_date},
                     {"new_date": new_date,
                      "assignments": applied["assignments"],
                      "fuel_entries": applied["fuel_entries"],
                      "location_schedules": applied["location_schedules"]})

    return applied


# ─── Comments (AXE 9.1) ──────────────────────────────────────────────────────

def get_comments(production_id, entity_type, entity_id, limit=50):
    """Get comments for a specific entity."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT * FROM comments
               WHERE production_id=? AND entity_type=? AND entity_id=?
               ORDER BY created_at DESC LIMIT ?""",
            (production_id, entity_type, entity_id, limit)
        ).fetchall()
        return [dict(r) for r in rows]


def get_comment_counts(production_id, entity_type, entity_ids):
    """Get comment counts for multiple entities of the same type."""
    if not entity_ids:
        return {}
    placeholders = ','.join('?' for _ in entity_ids)
    with get_db() as conn:
        rows = conn.execute(
            f"""SELECT entity_id, COUNT(*) as cnt FROM comments
                WHERE production_id=? AND entity_type=?
                AND entity_id IN ({placeholders})
                GROUP BY entity_id""",
            [production_id, entity_type] + list(entity_ids)
        ).fetchall()
        return {r['entity_id']: r['cnt'] for r in rows}


def create_comment(production_id, entity_type, entity_id, body,
                   user_id=None, user_nickname=None):
    """Create a comment on an entity."""
    if user_id is None or user_nickname is None:
        try:
            from flask import g as _g, has_request_context
            if has_request_context():
                if user_id is None:
                    user_id = getattr(_g, 'user_id', None)
                if user_nickname is None:
                    user_nickname = getattr(_g, 'nickname', None)
        except ImportError:
            pass

    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO comments
               (production_id, entity_type, entity_id, user_id, user_nickname, body)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (production_id, entity_type, entity_id, user_id, user_nickname, body)
        )
        new_id = cur.lastrowid
        row = conn.execute("SELECT * FROM comments WHERE id=?", (new_id,)).fetchone()
        _log_history(conn, 'comments', new_id, 'create', new_data=row,
                     production_id=production_id)
        return dict(row)


def delete_comment(comment_id):
    """Delete a comment by id. Returns the deleted comment or None."""
    with get_db() as conn:
        row = conn.execute("SELECT * FROM comments WHERE id=?", (comment_id,)).fetchone()
        if not row:
            return None
        conn.execute("DELETE FROM comments WHERE id=?", (comment_id,))
        _log_history(conn, 'comments', comment_id, 'delete', old_data=row,
                     production_id=row['production_id'])
        return dict(row)


# ─── Notifications (AXE 9.2) ─────────────────────────────────────────────────

def get_notifications(user_id, production_id=None, unread_only=False, limit=50):
    """Get notifications for a user, optionally filtered by production and read status."""
    conditions = ["user_id=?"]
    params = [user_id]
    if production_id:
        conditions.append("production_id=?")
        params.append(production_id)
    if unread_only:
        conditions.append("is_read=0")
    params.append(limit)
    where = " AND ".join(conditions)
    with get_db() as conn:
        rows = conn.execute(
            f"SELECT * FROM notifications WHERE {where} ORDER BY created_at DESC LIMIT ?",
            params
        ).fetchall()
        return [dict(r) for r in rows]


def get_unread_notification_count(user_id, production_id=None):
    """Get count of unread notifications."""
    if production_id:
        with get_db() as conn:
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM notifications WHERE user_id=? AND production_id=? AND is_read=0",
                (user_id, production_id)
            ).fetchone()
            return row['cnt'] if row else 0
    else:
        with get_db() as conn:
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM notifications WHERE user_id=? AND is_read=0",
                (user_id,)
            ).fetchone()
            return row['cnt'] if row else 0


def create_notification(production_id, user_id, notif_type, title, body=None,
                        entity_type=None, entity_id=None):
    """Create a notification for a specific user."""
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO notifications
               (production_id, user_id, type, title, body, entity_type, entity_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (production_id, user_id, notif_type, title, body, entity_type, entity_id)
        )
        return cur.lastrowid


def create_notifications_for_production(production_id, notif_type, title, body=None,
                                         entity_type=None, entity_id=None,
                                         exclude_user_id=None):
    """Create a notification for ALL members of a production (except exclude_user_id)."""
    with get_db() as conn:
        # Get all users who are members of this production
        rows = conn.execute(
            "SELECT user_id FROM project_memberships WHERE production_id=?",
            (production_id,)
        ).fetchall()
        count = 0
        for r in rows:
            uid = r['user_id']
            if exclude_user_id and uid == exclude_user_id:
                continue
            conn.execute(
                """INSERT INTO notifications
                   (production_id, user_id, type, title, body, entity_type, entity_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (production_id, uid, notif_type, title, body, entity_type, entity_id)
            )
            count += 1
        return count


def mark_notification_read(notification_id, user_id):
    """Mark a single notification as read."""
    with get_db() as conn:
        conn.execute(
            "UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?",
            (notification_id, user_id)
        )


def mark_all_notifications_read(user_id, production_id=None):
    """Mark all notifications as read for a user."""
    if production_id:
        with get_db() as conn:
            conn.execute(
                "UPDATE notifications SET is_read=1 WHERE user_id=? AND production_id=? AND is_read=0",
                (user_id, production_id)
            )
    else:
        with get_db() as conn:
            conn.execute(
                "UPDATE notifications SET is_read=1 WHERE user_id=? AND is_read=0",
                (user_id,)
            )
