"""
database.py — ShootLogix Phase 1
Full schema + data access layer.
"""
import os
import sqlite3
import json
import math
from datetime import datetime, timedelta
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shootlogix.db")


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript("""
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
        """)

    print("Database initialized — ShootLogix schema v1")
    _migrate_db()


def _migrate_db():
    """Add columns to existing DBs that predate schema additions."""
    with get_db() as conn:
        # boat_assignments.assignment_status
        ba_cols = [r[1] for r in conn.execute("PRAGMA table_info(boat_assignments)").fetchall()]
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
        b_cols = [r[1] for r in conn.execute("PRAGMA table_info(boats)").fetchall()]
        if 'vendor' not in b_cols:
            conn.execute("ALTER TABLE boats ADD COLUMN vendor TEXT")
            print("Migration: added boats.vendor")
        # boat_functions.context
        bf_cols = [r[1] for r in conn.execute("PRAGMA table_info(boat_functions)").fetchall()]
        if 'context' not in bf_cols:
            conn.execute("ALTER TABLE boat_functions ADD COLUMN context TEXT DEFAULT 'boats'")
            print("Migration: added boat_functions.context")
        # helpers.group_name, helpers.image_path
        h_cols = [r[1] for r in conn.execute("PRAGMA table_info(helpers)").fetchall()]
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
        loc_cols = [r[1] for r in conn.execute("PRAGMA table_info(locations)").fetchall()]
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


# ─── Working days ─────────────────────────────────────────────────────────────

def working_days(start_str, end_str):
    """Excel formula: ROUNDDOWN(total_days - total_days/7, 0)"""
    if not start_str or not end_str:
        return 0
    try:
        start = datetime.strptime(start_str[:10], "%Y-%m-%d").date()
        end   = datetime.strptime(end_str[:10],   "%Y-%m-%d").date()
        total = (end - start).days + 1
        return math.floor(total - total / 7)
    except Exception:
        return 0


def active_working_days(start_str, end_str, day_overrides_json):
    """Count working days respecting day_overrides exclusions.

    Uses the Excel working_days() formula as a base, then:
    - Subtracts weekdays explicitly marked 'empty' within the range
    - Adds weekdays with an explicit active status outside the range (rare)

    Returns the same value as working_days() when day_overrides is empty ({}).
    """
    try:
        overrides = json.loads(day_overrides_json or '{}')
    except Exception:
        overrides = {}

    if not overrides:
        return working_days(start_str, end_str)

    base = working_days(start_str, end_str)
    s = start_str[:10] if start_str else None
    e = end_str[:10] if end_str else None

    delta = 0
    for dk, status in overrides.items():
        try:
            d = datetime.strptime(dk, "%Y-%m-%d").date()
            is_weekday = d.weekday() < 5
        except Exception:
            continue

        in_range = bool(s and e and s <= dk <= e)

        if status == 'empty':
            if in_range and is_weekday:
                delta -= 1  # excluded a working day
        else:  # active override
            if not in_range and is_weekday:
                delta += 1  # added a working day outside base range

    return max(0, base + delta)


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
        return cur.lastrowid


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
        conn.execute(f"UPDATE shooting_days SET {sets} WHERE id=?", vals)


def delete_shooting_day(day_id):
    with get_db() as conn:
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
            "SELECT * FROM boats WHERE production_id=? ORDER BY boat_nr, name",
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
               "daily_rate_estimate", "daily_rate_actual", "image_path"]
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
            wd = active_working_days(d["start_date"], d["end_date"], d.get("day_overrides", "{}"))
            d["working_days"]      = wd
            d["amount_estimate"]   = round(wd * rate_est, 2)
            d["amount_actual"]     = round(wd * rate_act, 2) if rate_act else None
            result.append(d)
        return result


def create_boat_assignment(data):
    """Create assignment. Multiple assignments per function are allowed (for different periods)."""
    func_id = data["boat_function_id"]
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO boat_assignments
               (boat_function_id, boat_id, boat_name_override, start_date, end_date,
                price_override, notes, assignment_status, day_overrides)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (func_id, data.get("boat_id"), data.get("boat_name_override"),
             data.get("start_date"), data.get("end_date"),
             data.get("price_override"), data.get("notes"),
             data.get("assignment_status", "confirmed"),
             data.get("day_overrides", "{}"))
        )
        new_id = cur.lastrowid

        # Write history
        new = conn.execute("SELECT * FROM boat_assignments WHERE id=?", (new_id,)).fetchone()
        conn.execute(
            """INSERT INTO history (table_name, record_id, action, old_data, new_data)
               VALUES ('boat_assignments', ?, 'create', NULL, ?)""",
            (new_id, json.dumps(dict(new)))
        )
        return new_id


def update_boat_assignment(assignment_id, data):
    """Update an existing assignment (dates, status, notes, boat, price)."""
    allowed = ["start_date", "end_date", "price_override", "notes",
               "assignment_status", "day_overrides", "boat_id", "boat_name_override"]
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
            conn.execute(
                """INSERT INTO history (table_name, record_id, action, old_data, new_data)
                   VALUES ('boat_assignments', ?, 'update', ?, ?)""",
                (assignment_id, json.dumps(dict(old)), json.dumps(dict(new)) if new else None)
            )


def delete_boat_assignment(assignment_id):
    with get_db() as conn:
        old = conn.execute(
            "SELECT * FROM boat_assignments WHERE id=?", (assignment_id,)
        ).fetchone()
        if old:
            conn.execute(
                """INSERT INTO history (table_name, record_id, action, old_data, new_data)
                   VALUES ('boat_assignments', ?, 'delete', ?, NULL)""",
                (assignment_id, json.dumps(dict(old)))
            )
        conn.execute("DELETE FROM boat_assignments WHERE id=?", (assignment_id,))


# ─── Picture Boats ────────────────────────────────────────────────────────────

def get_picture_boats(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM picture_boats WHERE production_id=? ORDER BY boat_nr, name",
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
               "daily_rate_estimate", "daily_rate_actual", "image_path"]
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
            wd = active_working_days(d["start_date"], d["end_date"], d.get("day_overrides", "{}"))
            d["working_days"]    = wd
            d["amount_estimate"] = round(wd * rate_est, 2)
            d["amount_actual"]   = round(wd * rate_act, 2) if rate_act else None
            result.append(d)
        return result


def create_picture_boat_assignment(data):
    func_id = data["boat_function_id"]
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO picture_boat_assignments
               (boat_function_id, picture_boat_id, boat_name_override, start_date, end_date,
                price_override, notes, assignment_status, day_overrides)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (func_id, data.get("picture_boat_id"), data.get("boat_name_override"),
             data.get("start_date"), data.get("end_date"),
             data.get("price_override"), data.get("notes"),
             data.get("assignment_status", "confirmed"),
             data.get("day_overrides", "{}"))
        )
        return cur.lastrowid


def update_picture_boat_assignment(assignment_id, data):
    allowed = ["start_date", "end_date", "price_override", "notes",
               "assignment_status", "day_overrides", "picture_boat_id", "boat_name_override"]
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
        conn.execute(
            f"UPDATE picture_boat_assignments SET {', '.join(set_parts)} WHERE id=?", vals
        )


def delete_picture_boat_assignment(assignment_id):
    with get_db() as conn:
        conn.execute("DELETE FROM picture_boat_assignments WHERE id=?", (assignment_id,))


def delete_picture_boat_assignment_by_function(func_id):
    with get_db() as conn:
        conn.execute("DELETE FROM picture_boat_assignments WHERE boat_function_id=?", (func_id,))



# ─── Transport Vehicles ───────────────────────────────────────────────────────

def get_transport_vehicles(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM transport_vehicles WHERE production_id=? ORDER BY vehicle_nr, name",
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
               "notes", "daily_rate_estimate", "daily_rate_actual", "image_path"]
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
            wd = active_working_days(d["start_date"], d["end_date"], d.get("day_overrides", "{}"))
            d["working_days"]    = wd
            d["amount_estimate"] = round(wd * rate_est, 2)
            d["amount_actual"]   = round(wd * rate_act, 2) if rate_act else None
            result.append(d)
        return result


def create_transport_assignment(data):
    func_id = data["boat_function_id"]
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO transport_assignments
               (boat_function_id, vehicle_id, vehicle_name_override, start_date, end_date,
                price_override, notes, assignment_status, day_overrides)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (func_id, data.get("vehicle_id"), data.get("vehicle_name_override"),
             data.get("start_date"), data.get("end_date"),
             data.get("price_override"), data.get("notes"),
             data.get("assignment_status", "confirmed"),
             data.get("day_overrides", "{}"))
        )
        return cur.lastrowid


def update_transport_assignment(assignment_id, data):
    allowed = ["start_date", "end_date", "price_override", "notes",
               "assignment_status", "day_overrides", "vehicle_id", "vehicle_name_override"]
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
        conn.execute(
            f"UPDATE transport_assignments SET {', '.join(set_parts)} WHERE id=?", vals
        )


def delete_transport_assignment(assignment_id):
    with get_db() as conn:
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
        conn.execute(
            f"INSERT OR REPLACE INTO fuel_entries ({', '.join(cols)}) VALUES ({', '.join(['?']*len(cols))})",
            vals
        )
        row = conn.execute(
            "SELECT * FROM fuel_entries WHERE source_type=? AND assignment_id=? AND date=?",
            (data['source_type'], data['assignment_id'], data['date'])
        ).fetchone()
        return dict(row) if row else None


def delete_fuel_entry(entry_id):
    with get_db() as conn:
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
        return cur.lastrowid


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
        conn.execute(f"UPDATE fuel_machinery SET {', '.join(sets)} WHERE id=?", vals)


def delete_fuel_machinery(machinery_id):
    with get_db() as conn:
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
            "SELECT * FROM helpers WHERE production_id=? ORDER BY name", (prod_id,)
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
               "daily_rate_estimate", "daily_rate_actual", "notes", "image_path"]
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
            wd = active_working_days(d["start_date"], d["end_date"], d.get("day_overrides", "{}"))
            d["working_days"]    = wd
            d["amount_estimate"] = round(wd * rate_est, 2)
            d["amount_actual"]   = round(wd * rate_act, 2) if rate_act else None
            result.append(d)
        return result


def create_helper_assignment(data):
    func_id = data["boat_function_id"]
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO helper_assignments
               (boat_function_id, helper_id, helper_name_override, start_date, end_date,
                price_override, notes, assignment_status, day_overrides)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (func_id, data.get("helper_id"), data.get("helper_name_override"),
             data.get("start_date"), data.get("end_date"),
             data.get("price_override"), data.get("notes"),
             data.get("assignment_status", "confirmed"),
             data.get("day_overrides", "{}"))
        )
        return cur.lastrowid


def update_helper_assignment(assignment_id, data):
    allowed = ["start_date", "end_date", "price_override", "notes",
               "assignment_status", "day_overrides", "helper_id", "helper_name_override"]
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
        conn.execute(
            f"UPDATE helper_assignments SET {', '.join(set_parts)} WHERE id=?", vals
        )


def delete_helper_assignment(assignment_id):
    with get_db() as conn:
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
            "SELECT * FROM guard_camp_workers WHERE production_id=? ORDER BY name", (prod_id,)
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
               "daily_rate_estimate", "daily_rate_actual", "notes", "image_path"]
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
            # Compute working_days
            if d.get("start_date") and d.get("end_date"):
                d["working_days"] = working_days(d["start_date"], d["end_date"])
                rate = d.get("price_override") or d.get("helper_daily_rate_estimate") or 0
                d["amount_estimate"] = round(d["working_days"] * rate)
            else:
                d["working_days"] = 0
                d["amount_estimate"] = 0
            result.append(d)
        return result


def create_guard_camp_assignment(data):
    func_id = data["boat_function_id"]
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO guard_camp_assignments
               (boat_function_id, helper_id, helper_name_override, start_date, end_date,
                price_override, notes, assignment_status, day_overrides)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (func_id, data.get("helper_id"), data.get("helper_name_override"),
             data.get("start_date"), data.get("end_date"),
             data.get("price_override"), data.get("notes"),
             data.get("assignment_status", "confirmed"),
             data.get("day_overrides", "{}"))
        )
        return cur.lastrowid


def update_guard_camp_assignment(assignment_id, data):
    allowed = ["boat_function_id", "helper_id", "helper_name_override",
               "start_date", "end_date", "price_override", "notes",
               "assignment_status", "day_overrides"]
    set_parts = []
    vals = []
    for k in allowed:
        if k in data:
            set_parts.append(f"{k}=?")
            vals.append(data[k])
    set_parts.append("updated_at=datetime('now')")
    vals.append(assignment_id)
    with get_db() as conn:
        conn.execute(
            f"UPDATE guard_camp_assignments SET {', '.join(set_parts)} WHERE id=?", vals
        )


def delete_guard_camp_assignment(assignment_id):
    with get_db() as conn:
        conn.execute("DELETE FROM guard_camp_assignments WHERE id=?", (assignment_id,))


def delete_guard_camp_assignment_by_function(func_id):
    with get_db() as conn:
        conn.execute("DELETE FROM guard_camp_assignments WHERE boat_function_id=?", (func_id,))


# ─── Security Boats ──────────────────────────────────────────────────────────

def get_security_boats(prod_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM security_boats WHERE production_id=? ORDER BY boat_nr, name",
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
               "daily_rate_estimate", "daily_rate_actual", "image_path"]
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
            wd = active_working_days(d["start_date"], d["end_date"], d.get("day_overrides", "{}"))
            d["working_days"]    = wd
            d["amount_estimate"] = round(wd * rate_est, 2)
            d["amount_actual"]   = round(wd * rate_act, 2) if rate_act else None
            result.append(d)
        return result


def create_security_boat_assignment(data):
    func_id = data["boat_function_id"]
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO security_boat_assignments
               (boat_function_id, security_boat_id, boat_name_override, start_date, end_date,
                price_override, notes, assignment_status, day_overrides)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (func_id, data.get("security_boat_id"), data.get("boat_name_override"),
             data.get("start_date"), data.get("end_date"),
             data.get("price_override"), data.get("notes"),
             data.get("assignment_status", "confirmed"),
             data.get("day_overrides", "{}"))
        )
        return cur.lastrowid


def update_security_boat_assignment(assignment_id, data):
    allowed = ["start_date", "end_date", "price_override", "notes",
               "assignment_status", "day_overrides", "security_boat_id", "boat_name_override"]
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
        conn.execute(
            f"UPDATE security_boat_assignments SET {', '.join(set_parts)} WHERE id=?", vals
        )


def delete_security_boat_assignment(assignment_id):
    with get_db() as conn:
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


def sync_pdt_day_to_locations(prod_id, day_date, locations_from_pdt):
    """Sync a single PDT day's locations to the location_schedules table.

    - locations_from_pdt: list of location name strings found in the PDT day
      (from shooting_days.location + shooting_day_events.location)
    - Auto-creates missing location sites in the locations table
    - Upserts 'F' entries in location_schedules for each location on this date
    - Removes 'F' entries on this date that are no longer in the PDT
      (but NEVER touches P or W entries)
    - Respects locked cells: does not modify locked schedule entries
    """
    if not day_date:
        return

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
        site_lookup = {}  # uppercase name -> (canonical_name, location_type)
        for s in db_sites:
            site_lookup[s['name'].upper()] = (s['name'], s.get('location_type', 'game'))

        # Resolve each PDT location to a canonical site name, auto-creating if needed
        resolved_names = set()
        for raw_name in loc_names:
            raw_upper = raw_name.upper()
            # Try exact match first
            if raw_upper in site_lookup:
                resolved_names.add(site_lookup[raw_upper][0])
                continue
            # Try substring match (existing auto_fill logic)
            matched = False
            for uname, (orig, ltype) in site_lookup.items():
                if uname in raw_upper or raw_upper in uname:
                    resolved_names.add(orig)
                    matched = True
                    break
            if not matched:
                # Auto-create a new location site
                conn.execute(
                    "INSERT INTO locations (production_id, name, location_type) VALUES (?,?,?)",
                    (prod_id, raw_name, 'game')
                )
                site_lookup[raw_upper] = (raw_name, 'game')
                resolved_names.add(raw_name)

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
    entry exists (with default nb_guards based on location_type).
    Remove entries where the location no longer has activity.
    Returns the full list of guard_location_schedules."""
    loc_sites = get_location_sites(prod_id)
    loc_schedules = get_location_schedules(prod_id)
    type_by_name = {s['name']: s.get('location_type', 'game') for s in loc_sites}

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

        # Insert missing entries with default nb_guards
        for ls in loc_schedules:
            key = (ls['location_name'], ls['date'])
            if key not in existing_pairs:
                loc_type = type_by_name.get(ls['location_name'], 'game')
                default_guards = 4 if loc_type == 'tribal_camp' else 2
                conn.execute(
                    """INSERT OR IGNORE INTO guard_location_schedules
                       (production_id, location_name, date, status, nb_guards, locked)
                       VALUES (?,?,?,?,?,0)""",
                    (prod_id, ls['location_name'], ls['date'],
                     ls.get('status', 'P'), default_guards)
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
    cols = ["production_id", "name", "daily_rate", "notes"]
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
    allowed = ["name", "daily_rate", "notes"]
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


# ─── History / Undo ───────────────────────────────────────────────────────────

def get_history(prod_id, limit=50):
    """Return recent history entries — filtered by production via boat_functions join."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM history ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


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
