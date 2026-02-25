"""
app.py — ShootLogix
Flask REST API for the full production logistics SPA.
Run: python3 app.py  →  http://localhost:5002
"""
import csv
import io
import json
import os
import tempfile
from flask import Flask, jsonify, request, render_template, abort, Response

from database import (
    init_db, get_db,
    get_productions, get_production, create_production,
    get_departments, seed_departments,
    get_shooting_days, create_shooting_day, update_shooting_day,
    delete_shooting_day, get_shooting_day,
    get_events_for_day, create_event, update_event, delete_event, delete_events_for_day,
    get_boats, create_boat, update_boat, delete_boat,
    get_boat_functions, create_boat_function, update_boat_function,
    delete_boat_function, delete_boat_assignment_by_function,
    get_boat_assignments, create_boat_assignment, update_boat_assignment, delete_boat_assignment,
    get_picture_boats, create_picture_boat, update_picture_boat, delete_picture_boat,
    get_picture_boat_assignments, create_picture_boat_assignment,
    update_picture_boat_assignment, delete_picture_boat_assignment,
    delete_picture_boat_assignment_by_function,
    get_transport_vehicles, create_transport_vehicle, update_transport_vehicle, delete_transport_vehicle,
    get_transport_assignments, create_transport_assignment, update_transport_assignment,
    delete_transport_assignment, delete_transport_assignment_by_function,
    get_fuel_entries, upsert_fuel_entry, delete_fuel_entry, delete_fuel_entries_for_assignment,
    get_fuel_machinery, create_fuel_machinery, update_fuel_machinery, delete_fuel_machinery,
    get_fuel_locked_prices, set_fuel_locked_price, delete_fuel_locked_price,
    get_helpers, create_helper, update_helper, delete_helper,
    get_helper_assignments, create_helper_assignment, update_helper_assignment,
    delete_helper_assignment, delete_helper_assignment_by_function,
    get_helper_schedules,
    get_security_boats, create_security_boat, update_security_boat, delete_security_boat,
    get_security_boat_assignments, create_security_boat_assignment,
    update_security_boat_assignment, delete_security_boat_assignment,
    delete_security_boat_assignment_by_function,
    get_fnb_services,
    get_fuel_logs,
    get_transport_schedules,
    get_guard_schedules,
    get_budget,
    get_history, undo_last_boat_assignment,
    get_setting, set_setting,
    working_days,
    # New modules
    get_location_schedules, upsert_location_schedule,
    delete_location_schedule, delete_location_schedule_by_id,
    lock_location_schedules, auto_fill_locations_from_pdt,
    sync_pdt_day_to_locations, remove_pdt_film_days_for_date,
    get_guard_location_schedules, upsert_guard_location_schedule,
    delete_guard_location_schedule, lock_guard_location_schedules,
    sync_guard_location_from_locations, update_guard_location_nb_guards,
    get_fnb_tracking, upsert_fnb_tracking, delete_fnb_tracking, get_fnb_summary,
    # FNB v2
    get_fnb_categories, create_fnb_category, update_fnb_category, delete_fnb_category,
    get_fnb_items, create_fnb_item, update_fnb_item, delete_fnb_item,
    get_fnb_entries, upsert_fnb_entry, delete_fnb_entry, get_fnb_budget_data,
    # Location sites CRUD
    get_location_sites, create_location_site, update_location_site,
    delete_location_site, rename_location_in_schedules,
    # Guard posts CRUD
    get_guard_posts, create_guard_post, update_guard_post,
    delete_guard_post, rename_guard_post_in_schedules,
    # Guard Camp (Base Camp guards)
    get_guard_camp_workers, create_guard_camp_worker, update_guard_camp_worker,
    delete_guard_camp_worker,
    get_guard_camp_assignments, create_guard_camp_assignment,
    update_guard_camp_assignment, delete_guard_camp_assignment,
    delete_guard_camp_assignment_by_function,
)

app = Flask(__name__)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def prod_or_404(prod_id):
    p = get_production(prod_id)
    if not p:
        abort(404, description=f"Production {prod_id} not found")
    return p


def _row_or_404(conn, table, id_):
    r = conn.execute(f"SELECT * FROM {table} WHERE id=?", (id_,)).fetchone()
    if not r:
        abort(404)
    return dict(r)


# ─── UI ───────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# ─── Health ───────────────────────────────────────────────────────────────────

@app.route("/api/health")
def health():
    with get_db() as conn:
        tables = [r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()]
    return jsonify({"status": "ok", "tables": tables, "table_count": len(tables)})


# ─── Productions ──────────────────────────────────────────────────────────────

@app.route("/api/productions", methods=["GET"])
def api_productions():
    return jsonify(get_productions())


@app.route("/api/productions", methods=["POST"])
def api_create_production():
    data = request.json or {}
    if not data.get("name"):
        return jsonify({"error": "name required"}), 400
    prod_id = create_production(data)
    seed_departments(prod_id)
    return jsonify(get_production(prod_id)), 201


@app.route("/api/productions/<int:prod_id>", methods=["GET"])
def api_get_production(prod_id):
    return jsonify(prod_or_404(prod_id))


# ─── Departments ──────────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/departments")
def api_departments(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_departments(prod_id))


# ─── Shooting days ────────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/shooting-days", methods=["GET"])
def api_shooting_days(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_shooting_days(prod_id))


@app.route("/api/productions/<int:prod_id>/shooting-days", methods=["POST"])
def api_create_shooting_day(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data["production_id"] = prod_id
    if not data.get("date"):
        return jsonify({"error": "date required"}), 400
    day_id = create_shooting_day(data)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM shooting_days WHERE id=?", (day_id,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/productions/<int:prod_id>/shooting-days/<int:day_id>", methods=["GET"])
def api_get_shooting_day(prod_id, day_id):
    prod_or_404(prod_id)
    day = get_shooting_day(day_id)
    if not day:
        abort(404)
    return jsonify(day)


@app.route("/api/productions/<int:prod_id>/shooting-days/<int:day_id>", methods=["PUT"])
def api_update_shooting_day(prod_id, day_id):
    prod_or_404(prod_id)
    update_shooting_day(day_id, request.json or {})
    day = get_shooting_day(day_id)
    if not day:
        abort(404)
    return jsonify(day)


@app.route("/api/productions/<int:prod_id>/shooting-days/<int:day_id>", methods=["DELETE"])
def api_delete_shooting_day(prod_id, day_id):
    prod_or_404(prod_id)
    delete_shooting_day(day_id)
    return jsonify({"deleted": day_id})


# ─── Shooting day events ─────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/shooting-days/<int:day_id>/events", methods=["GET"])
def api_get_day_events(prod_id, day_id):
    prod_or_404(prod_id)
    return jsonify(get_events_for_day(day_id))


@app.route("/api/productions/<int:prod_id>/shooting-days/<int:day_id>/events", methods=["POST"])
def api_create_event(prod_id, day_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data["shooting_day_id"] = day_id
    if not data.get("event_type"):
        return jsonify({"error": "event_type required"}), 400
    event_id = create_event(data)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM shooting_day_events WHERE id=?", (event_id,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/events/<int:event_id>", methods=["PUT"])
def api_update_event(event_id):
    update_event(event_id, request.json or {})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM shooting_day_events WHERE id=?", (event_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/events/<int:event_id>", methods=["DELETE"])
def api_delete_event(event_id):
    delete_event(event_id)
    return jsonify({"deleted": event_id})


# ─── Parse PDT PDF ────────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/parse-pdt", methods=["POST"])
def api_parse_pdt(prod_id):
    prod_or_404(prod_id)
    from pdf_parser import parse_pdt_pdf

    # Check existing days
    existing = get_shooting_days(prod_id)
    if existing and not (request.json or {}).get("force"):
        return jsonify({
            "message": "Shooting days already exist. Pass force=true to overwrite.",
            "existing_count": len(existing),
        }), 409

    # Delete existing if force
    if existing:
        with get_db() as conn:
            conn.execute(
                "DELETE FROM shooting_days WHERE production_id=?", (prod_id,)
            )

    days = parse_pdt_pdf()
    created = []
    for d in days:
        events = d.pop("events", [])
        d["production_id"] = prod_id
        day_id = create_shooting_day(d)
        created.append(day_id)
        for ev in events:
            ev["shooting_day_id"] = day_id
            create_event(ev)

    return jsonify({
        "created": len(created),
        "message": f"{len(created)} shooting days imported from PDT PDF",
    }), 201


# ─── Upload PDT PDF (browser file picker + smart merge) ─────────────────────

@app.route("/api/productions/<int:prod_id>/upload-pdt", methods=["POST"])
def api_upload_pdt(prod_id):
    """
    Receive a PDF file upload, parse it, and smart-merge with existing days.
    Merge logic:
      - Match by day_number
      - If existing day has status='modifie' -> skip (preserve manual edits)
      - If existing day has other status -> update fields from PDF
      - If day doesn't exist -> create it
      - Days in DB but not in PDF -> keep them (no delete)
    """
    prod_or_404(prod_id)
    from pdf_parser import parse_pdt_pdf

    if 'pdf' not in request.files:
        return jsonify({"error": "No PDF file provided"}), 400

    pdf_file = request.files['pdf']
    if not pdf_file.filename:
        return jsonify({"error": "Empty filename"}), 400

    # Save to temp file, parse, then delete
    tmp_fd, tmp_path = tempfile.mkstemp(suffix='.pdf')
    try:
        pdf_file.save(tmp_path)
        parsed_days = parse_pdt_pdf(pdf_path=tmp_path)
    finally:
        os.close(tmp_fd)
        os.unlink(tmp_path)

    # Build lookup of existing days by day_number
    existing = get_shooting_days(prod_id)
    existing_by_dn = {}
    for d in existing:
        if d.get('day_number'):
            existing_by_dn[d['day_number']] = d

    stats = {"created": 0, "updated": 0, "skipped": 0}

    for parsed in parsed_days:
        events = parsed.pop("events", [])
        dn = parsed.get("day_number")
        if not dn:
            continue

        if dn in existing_by_dn:
            ex = existing_by_dn[dn]
            # Skip days manually edited by user
            if ex.get('status') == 'modifié':
                stats["skipped"] += 1
                continue
            # Update day fields from PDF
            update_shooting_day(ex['id'], parsed)
            # Replace events: delete old, insert new
            delete_events_for_day(ex['id'])
            for ev in events:
                ev["shooting_day_id"] = ex['id']
                create_event(ev)
            stats["updated"] += 1
        else:
            # Create new day
            parsed["production_id"] = prod_id
            day_id = create_shooting_day(parsed)
            for ev in events:
                ev["shooting_day_id"] = day_id
                create_event(ev)
            stats["created"] += 1

    return jsonify(stats), 200


# ─── Boats ────────────────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/boats", methods=["GET"])
def api_boats(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_boats(prod_id))


@app.route("/api/productions/<int:prod_id>/boats", methods=["POST"])
def api_create_boat(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data["production_id"] = prod_id
    if not data.get("name"):
        return jsonify({"error": "name required"}), 400
    boat_id = create_boat(data)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM boats WHERE id=?", (boat_id,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/boats/<int:boat_id>", methods=["GET"])
def api_get_boat(boat_id):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM boats WHERE id=?", (boat_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/boats/<int:boat_id>", methods=["PUT"])
def api_update_boat(boat_id):
    update_boat(boat_id, request.json or {})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM boats WHERE id=?", (boat_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/boats/<int:boat_id>", methods=["DELETE"])
def api_delete_boat(boat_id):
    delete_boat(boat_id)
    return jsonify({"deleted": boat_id})


@app.route("/api/boats/<int:boat_id>/upload-image", methods=["POST"])
def api_upload_boat_image(boat_id):
    import os
    f = request.files.get('image')
    if not f:
        return jsonify({"error": "No file provided"}), 400
    upload_dir = os.path.join(os.path.dirname(__file__), 'static', 'uploads', 'boats')
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(f.filename or '')[1].lower() or '.jpg'
    filename = f"boat_{boat_id}{ext}"
    filepath = os.path.join(upload_dir, filename)
    f.save(filepath)
    rel_path = f"static/uploads/boats/{filename}"
    update_boat(boat_id, {"image_path": rel_path})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM boats WHERE id=?", (boat_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


# ─── Boat functions ───────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/boat-functions", methods=["GET"])
def api_boat_functions(prod_id):
    prod_or_404(prod_id)
    context = request.args.get('context')
    return jsonify(get_boat_functions(prod_id, context=context))


@app.route("/api/productions/<int:prod_id>/boat-functions", methods=["POST"])
def api_create_boat_function(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data["production_id"] = prod_id
    if not data.get("name"):
        return jsonify({"error": "name required"}), 400
    func_id = create_boat_function(data)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM boat_functions WHERE id=?", (func_id,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/boat-functions/<int:func_id>", methods=["PUT"])
def api_update_boat_function(func_id):
    update_boat_function(func_id, request.json or {})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM boat_functions WHERE id=?", (func_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/boat-functions/<int:func_id>", methods=["DELETE"])
def api_delete_boat_function(func_id):
    delete_boat_function(func_id)
    return jsonify({"deleted": func_id})


# ─── Boat assignments ─────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/assignments", methods=["GET"])
def api_assignments(prod_id):
    prod_or_404(prod_id)
    context = request.args.get('context')
    return jsonify(get_boat_assignments(prod_id, context=context))


@app.route("/api/productions/<int:prod_id>/assignments", methods=["POST"])
def api_create_assignment(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    if not data.get("boat_function_id"):
        return jsonify({"error": "boat_function_id required"}), 400
    assignment_id = create_boat_assignment(data)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM boat_assignments WHERE id=?", (assignment_id,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/assignments/<int:assignment_id>", methods=["PUT"])
def api_update_assignment(assignment_id):
    update_boat_assignment(assignment_id, request.json or {})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM boat_assignments WHERE id=?", (assignment_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/assignments/<int:assignment_id>", methods=["DELETE"])
def api_delete_assignment(assignment_id):
    delete_boat_assignment(assignment_id)
    return jsonify({"deleted": assignment_id})


@app.route("/api/productions/<int:prod_id>/assignments/function/<int:func_id>", methods=["DELETE"])
def api_delete_assignment_by_function(prod_id, func_id):
    prod_or_404(prod_id)
    delete_boat_assignment_by_function(func_id)
    return jsonify({"deleted_for_function": func_id})


# ─── Picture Boats ────────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/picture-boats", methods=["GET"])
def api_picture_boats(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_picture_boats(prod_id))


@app.route("/api/productions/<int:prod_id>/picture-boats", methods=["POST"])
def api_create_picture_boat(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data["production_id"] = prod_id
    if not data.get("name"):
        return jsonify({"error": "name required"}), 400
    pb_id = create_picture_boat(data)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM picture_boats WHERE id=?", (pb_id,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/picture-boats/<int:pb_id>", methods=["GET"])
def api_get_picture_boat(pb_id):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM picture_boats WHERE id=?", (pb_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/picture-boats/<int:pb_id>", methods=["PUT"])
def api_update_picture_boat(pb_id):
    update_picture_boat(pb_id, request.json or {})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM picture_boats WHERE id=?", (pb_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/picture-boats/<int:pb_id>", methods=["DELETE"])
def api_delete_picture_boat(pb_id):
    delete_picture_boat(pb_id)
    return jsonify({"deleted": pb_id})


@app.route("/api/picture-boats/<int:pb_id>/upload-image", methods=["POST"])
def api_upload_picture_boat_image(pb_id):
    import os
    f = request.files.get('image')
    if not f:
        return jsonify({"error": "No file provided"}), 400
    upload_dir = os.path.join(os.path.dirname(__file__), 'static', 'uploads', 'picture-boats')
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(f.filename or '')[1].lower() or '.jpg'
    filename = f"pb_{pb_id}{ext}"
    filepath = os.path.join(upload_dir, filename)
    f.save(filepath)
    rel_path = f"static/uploads/picture-boats/{filename}"
    update_picture_boat(pb_id, {"image_path": rel_path})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM picture_boats WHERE id=?", (pb_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


# ─── Picture Boat Assignments ─────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/picture-boat-assignments", methods=["GET"])
def api_picture_boat_assignments(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_picture_boat_assignments(prod_id))


@app.route("/api/productions/<int:prod_id>/picture-boat-assignments", methods=["POST"])
def api_create_picture_boat_assignment(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    if not data.get("boat_function_id"):
        return jsonify({"error": "boat_function_id required"}), 400
    assignment_id = create_picture_boat_assignment(data)
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM picture_boat_assignments WHERE id=?", (assignment_id,)
        ).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/picture-boat-assignments/<int:assignment_id>", methods=["PUT"])
def api_update_picture_boat_assignment(assignment_id):
    update_picture_boat_assignment(assignment_id, request.json or {})
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM picture_boat_assignments WHERE id=?", (assignment_id,)
        ).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/picture-boat-assignments/<int:assignment_id>", methods=["DELETE"])
def api_delete_picture_boat_assignment(assignment_id):
    delete_picture_boat_assignment(assignment_id)
    return jsonify({"deleted": assignment_id})


@app.route("/api/productions/<int:prod_id>/picture-boat-assignments/function/<int:func_id>",
           methods=["DELETE"])
def api_delete_picture_boat_assignment_by_function(prod_id, func_id):
    prod_or_404(prod_id)
    delete_picture_boat_assignment_by_function(func_id)
    return jsonify({"deleted_for_function": func_id})


# ─── Helpers ──────────────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/helpers", methods=["GET"])
def api_helpers(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_helpers(prod_id))


@app.route("/api/productions/<int:prod_id>/helpers", methods=["POST"])
def api_create_helper(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data["production_id"] = prod_id
    if not data.get("name"):
        return jsonify({"error": "name required"}), 400
    hid = create_helper(data)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM helpers WHERE id=?", (hid,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/helpers/<int:helper_id>", methods=["GET"])
def api_get_helper(helper_id):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM helpers WHERE id=?", (helper_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/helpers/<int:helper_id>", methods=["PUT"])
def api_update_helper(helper_id):
    update_helper(helper_id, request.json or {})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM helpers WHERE id=?", (helper_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/helpers/<int:helper_id>", methods=["DELETE"])
def api_delete_helper(helper_id):
    delete_helper(helper_id)
    return jsonify({"deleted": helper_id})


@app.route("/api/helpers/<int:helper_id>/upload-image", methods=["POST"])
def api_upload_helper_image(helper_id):
    import os
    f = request.files.get('image')
    if not f:
        return jsonify({"error": "No file provided"}), 400
    upload_dir = os.path.join(os.path.dirname(__file__), 'static', 'uploads', 'labour')
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(f.filename or '')[1].lower() or '.jpg'
    filename = f"worker_{helper_id}{ext}"
    filepath = os.path.join(upload_dir, filename)
    f.save(filepath)
    rel_path = f"static/uploads/labour/{filename}"
    update_helper(helper_id, {"image_path": rel_path})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM helpers WHERE id=?", (helper_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/productions/<int:prod_id>/helper-assignments", methods=["GET"])
def api_helper_assignments(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_helper_assignments(prod_id))


@app.route("/api/productions/<int:prod_id>/helper-assignments", methods=["POST"])
def api_create_helper_assignment(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    if not data.get("boat_function_id"):
        return jsonify({"error": "boat_function_id required"}), 400
    aid = create_helper_assignment(data)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM helper_assignments WHERE id=?", (aid,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/helper-assignments/<int:assignment_id>", methods=["PUT"])
def api_update_helper_assignment(assignment_id):
    update_helper_assignment(assignment_id, request.json or {})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM helper_assignments WHERE id=?", (assignment_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/helper-assignments/<int:assignment_id>", methods=["DELETE"])
def api_delete_helper_assignment(assignment_id):
    delete_helper_assignment(assignment_id)
    return jsonify({"deleted": assignment_id})


@app.route("/api/productions/<int:prod_id>/helper-assignments/function/<int:func_id>",
           methods=["DELETE"])
def api_delete_helper_assignment_by_function(prod_id, func_id):
    prod_or_404(prod_id)
    delete_helper_assignment_by_function(func_id)
    return jsonify({"deleted_for_function": func_id})


@app.route("/api/productions/<int:prod_id>/helpers/schedules", methods=["GET"])
def api_helper_schedules(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_helper_schedules(prod_id))


@app.route("/api/productions/<int:prod_id>/export/labour/csv")
def api_export_labour_csv(prod_id):
    prod_or_404(prod_id)
    rows = [r for r in get_helper_assignments(prod_id) if r.get("working_days")]
    # Group by function_group
    from collections import OrderedDict
    by_group = OrderedDict()
    for r in rows:
        g = r.get("function_group") or r.get("helper_group") or "GENERAL"
        if g not in by_group:
            by_group[g] = []
        by_group[g].append(r)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Group", "Function", "Worker", "Role", "Contact",
                     "Start", "End", "Working Days", "Rate/day",
                     "Total Estimate", "Total Actual"])
    grand_est = 0
    grand_act = 0
    for group_name, group_rows in by_group.items():
        group_est = 0
        group_act = 0
        for r in group_rows:
            est = r.get("amount_estimate") or 0
            act = r.get("amount_actual") or 0
            group_est += est
            group_act += act
            writer.writerow([
                group_name,
                r.get("function_name") or "",
                r.get("helper_name_override") or r.get("helper_name") or "",
                r.get("helper_role") or "",
                r.get("helper_contact") or "",
                r.get("start_date") or "", r.get("end_date") or "",
                r.get("working_days") or "",
                r.get("price_override") or r.get("helper_daily_rate_estimate") or "",
                est,
                act if act else "",
            ])
        writer.writerow(["", "", "", "", "", "", f"SUB-TOTAL {group_name}", "", "", group_est, group_act if group_act else ""])
        writer.writerow([])
        grand_est += group_est
        grand_act += group_act
    writer.writerow(["", "", "", "", "", "", "GRAND TOTAL", "", "", grand_est, grand_act if grand_act else ""])
    output.seek(0)
    from datetime import datetime as dt
    fname = f"KLAS7_LABOUR_{dt.now().strftime('%y%m%d')}.csv"
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={fname}"}
    )


# Keep old endpoint for backward compatibility
@app.route("/api/productions/<int:prod_id>/export/helpers/csv")
def api_export_helpers_csv(prod_id):
    return api_export_labour_csv(prod_id)


# ─── Security Boats ──────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/security-boats", methods=["GET"])
def api_security_boats(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_security_boats(prod_id))


@app.route("/api/productions/<int:prod_id>/security-boats", methods=["POST"])
def api_create_security_boat(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data["production_id"] = prod_id
    if not data.get("name"):
        return jsonify({"error": "name required"}), 400
    sb_id = create_security_boat(data)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM security_boats WHERE id=?", (sb_id,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/security-boats/<int:sb_id>", methods=["GET"])
def api_get_security_boat(sb_id):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM security_boats WHERE id=?", (sb_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/security-boats/<int:sb_id>", methods=["PUT"])
def api_update_security_boat(sb_id):
    update_security_boat(sb_id, request.json or {})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM security_boats WHERE id=?", (sb_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/security-boats/<int:sb_id>", methods=["DELETE"])
def api_delete_security_boat(sb_id):
    delete_security_boat(sb_id)
    return jsonify({"deleted": sb_id})


@app.route("/api/security-boats/<int:sb_id>/upload-image", methods=["POST"])
def api_upload_security_boat_image(sb_id):
    import os
    f = request.files.get('image')
    if not f:
        return jsonify({"error": "No file provided"}), 400
    upload_dir = os.path.join(os.path.dirname(__file__), 'static', 'uploads', 'security-boats')
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(f.filename or '')[1].lower() or '.jpg'
    filename = f"sb_{sb_id}{ext}"
    filepath = os.path.join(upload_dir, filename)
    f.save(filepath)
    rel_path = f"static/uploads/security-boats/{filename}"
    update_security_boat(sb_id, {"image_path": rel_path})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM security_boats WHERE id=?", (sb_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/productions/<int:prod_id>/security-boat-assignments", methods=["GET"])
def api_security_boat_assignments(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_security_boat_assignments(prod_id))


@app.route("/api/productions/<int:prod_id>/security-boat-assignments", methods=["POST"])
def api_create_security_boat_assignment(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    if not data.get("boat_function_id"):
        return jsonify({"error": "boat_function_id required"}), 400
    aid = create_security_boat_assignment(data)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM security_boat_assignments WHERE id=?", (aid,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/security-boat-assignments/<int:assignment_id>", methods=["PUT"])
def api_update_security_boat_assignment(assignment_id):
    update_security_boat_assignment(assignment_id, request.json or {})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM security_boat_assignments WHERE id=?", (assignment_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/security-boat-assignments/<int:assignment_id>", methods=["DELETE"])
def api_delete_security_boat_assignment(assignment_id):
    delete_security_boat_assignment(assignment_id)
    return jsonify({"deleted": assignment_id})


@app.route("/api/productions/<int:prod_id>/security-boat-assignments/function/<int:func_id>",
           methods=["DELETE"])
def api_delete_security_boat_assignment_by_function(prod_id, func_id):
    prod_or_404(prod_id)
    delete_security_boat_assignment_by_function(func_id)
    return jsonify({"deleted_for_function": func_id})


@app.route("/api/productions/<int:prod_id>/export/security-boats/csv")
def api_export_security_boats_csv(prod_id):
    prod_or_404(prod_id)
    rows = [r for r in get_security_boat_assignments(prod_id) if r.get("working_days")]
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Function", "Group", "Boat", "Captain", "Vendor",
                     "Start", "End", "Working Days", "Rate/day (est.)",
                     "Total Estimate", "Total Actual"])
    for r in rows:
        writer.writerow([
            r.get("function_name") or "",
            r.get("function_group") or "",
            r.get("boat_name_override") or r.get("boat_name") or "",
            r.get("captain") or "",
            r.get("vendor") or "",
            r.get("start_date") or "", r.get("end_date") or "",
            r.get("working_days") or "",
            r.get("price_override") or r.get("boat_daily_rate_estimate") or "",
            r.get("amount_estimate") or "",
            r.get("amount_actual") or "",
        ])
    grand_est = sum(r.get("amount_estimate") or 0 for r in rows)
    grand_act = sum(r.get("amount_actual") or 0 for r in rows)
    writer.writerow([])
    writer.writerow(["", "", "", "", "", "", "GRAND TOTAL", "", "", grand_est, grand_act])
    output.seek(0)
    from datetime import datetime as dt
    fname = f"KLAS7_SECURITY-BOATS_{dt.now().strftime('%y%m%d')}.csv"
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={fname}"}
    )


@app.route("/api/productions/<int:prod_id>/export/security-boats/json")
def api_export_security_boats_json(prod_id):
    prod_or_404(prod_id)
    data = {
        "production": get_production(prod_id),
        "security_boats": get_security_boats(prod_id),
        "assignments": [a for a in get_security_boat_assignments(prod_id) if a.get("working_days")],
    }
    from datetime import datetime as dt
    fname = f"KLAS7_SECURITY-BOATS_{dt.now().strftime('%y%m%d')}.json"
    return Response(
        json.dumps(data, indent=2, ensure_ascii=False),
        mimetype="application/json",
        headers={"Content-Disposition": f"attachment; filename={fname}"}
    )


# ─── FNB ──────────────────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/fnb", methods=["GET"])
def api_fnb(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_fnb_services(prod_id))


# ─── Fuel ─────────────────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/fuel", methods=["GET"])
def api_fuel(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_fuel_logs(prod_id))


# ─── Transport ────────────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/transport", methods=["GET"])
def api_transport(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_transport_schedules(prod_id))


# ─── Guards ───────────────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/guards", methods=["GET"])
def api_guards(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_guard_schedules(prod_id))


# ─── Budget ───────────────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/budget", methods=["GET"])
def api_budget(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_budget(prod_id))


# ─── History / Undo ───────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/history", methods=["GET"])
def api_history(prod_id):
    prod_or_404(prod_id)
    limit = int(request.args.get("limit", 50))
    return jsonify(get_history(prod_id, limit))


@app.route("/api/productions/<int:prod_id>/undo", methods=["POST"])
def api_undo(prod_id):
    prod_or_404(prod_id)
    return jsonify(undo_last_boat_assignment(prod_id))


# ─── Working days util ────────────────────────────────────────────────────────

@app.route("/api/working-days")
def api_working_days():
    start = request.args.get("start")
    end = request.args.get("end")
    return jsonify({"working_days": working_days(start, end)})


# ─── Export ───────────────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/export/csv")
def api_export_csv(prod_id):
    prod_or_404(prod_id)
    budget = get_budget(prod_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Department", "Function", "Boat", "Vendor", "Start", "End",
                     "Working Days", "Rate/day", "Total Estimate", "Total Actual"])
    for r in budget["rows"]:
        writer.writerow([
            r.get("department") or "BOATS",
            r.get("name") or "",
            r.get("boat") or r.get("boat_name") or r.get("boat_name_override") or "",
            r.get("vendor") or "",
            r.get("start_date") or "", r.get("end_date") or "",
            r.get("working_days") or "",
            r.get("unit_price_estimate") or "",
            r.get("amount_estimate") or "", r.get("amount_actual") or "",
        ])
    writer.writerow([])
    writer.writerow(["", "", "", "", "", "", "GRAND TOTAL",
                     budget["grand_total_estimate"], budget["grand_total_actual"]])
    output.seek(0)
    from datetime import datetime as dt
    fname = f"KLAS7_BOATS_{dt.now().strftime('%y%m%d')}.csv"
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={fname}"}
    )


@app.route("/api/productions/<int:prod_id>/export/json")
def api_export_json(prod_id):
    prod_or_404(prod_id)
    data = {
        "production": get_production(prod_id),
        "shooting_days": get_shooting_days(prod_id),
        "boats": get_boats(prod_id),
        "boat_functions": get_boat_functions(prod_id),
        "assignments": [a for a in get_boat_assignments(prod_id, context='boats') if a.get("working_days")],
        "budget": get_budget(prod_id),
    }
    from datetime import datetime as dt
    fname = f"KLAS7_BOATS_{dt.now().strftime('%y%m%d')}.json"
    return Response(
        json.dumps(data, indent=2, ensure_ascii=False),
        mimetype="application/json",
        headers={"Content-Disposition": f"attachment; filename={fname}"}
    )


# ─── Picture Boats export ─────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/export/picture-boats/csv")
def api_export_pb_csv(prod_id):
    prod_or_404(prod_id)
    rows = [r for r in get_picture_boat_assignments(prod_id) if r.get("working_days")]
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Function", "Group", "Boat", "Captain", "Vendor",
                     "Start", "End", "Working Days", "Rate/day (est.)",
                     "Total Estimate", "Total Actual"])
    for r in rows:
        writer.writerow([
            r.get("function_name") or "",
            r.get("function_group") or "",
            r.get("boat_name_override") or r.get("boat_name") or "",
            r.get("captain") or "",
            r.get("vendor") or "",
            r.get("start_date") or "", r.get("end_date") or "",
            r.get("working_days") or "",
            r.get("price_override") or r.get("boat_daily_rate_estimate") or "",
            r.get("amount_estimate") or "",
            r.get("amount_actual") or "",
        ])
    grand_est = sum(r.get("amount_estimate") or 0 for r in rows)
    grand_act = sum(r.get("amount_actual") or 0 for r in rows)
    writer.writerow([])
    writer.writerow(["", "", "", "", "", "", "GRAND TOTAL", "", "", grand_est, grand_act])
    output.seek(0)
    from datetime import datetime as dt
    fname = f"KLAS7_PICTURE-BOATS_{dt.now().strftime('%y%m%d')}.csv"
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={fname}"}
    )


@app.route("/api/productions/<int:prod_id>/export/picture-boats/json")
def api_export_pb_json(prod_id):
    prod_or_404(prod_id)
    data = {
        "production": get_production(prod_id),
        "picture_boats": get_picture_boats(prod_id),
        "assignments": [a for a in get_picture_boat_assignments(prod_id) if a.get("working_days")],
    }
    from datetime import datetime as dt
    fname = f"KLAS7_PICTURE-BOATS_{dt.now().strftime('%y%m%d')}.json"
    return Response(
        json.dumps(data, indent=2, ensure_ascii=False),
        mimetype="application/json",
        headers={"Content-Disposition": f"attachment; filename={fname}"}
    )


# ─── Transport ────────────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/transport-vehicles", methods=["GET"])
def api_transport_vehicles(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_transport_vehicles(prod_id))


@app.route("/api/productions/<int:prod_id>/transport-vehicles", methods=["POST"])
def api_create_transport_vehicle(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data["production_id"] = prod_id
    if not data.get("name"):
        return jsonify({"error": "name required"}), 400
    vid = create_transport_vehicle(data)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM transport_vehicles WHERE id=?", (vid,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/transport-vehicles/<int:vehicle_id>", methods=["GET"])
def api_get_transport_vehicle(vehicle_id):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM transport_vehicles WHERE id=?", (vehicle_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/transport-vehicles/<int:vehicle_id>", methods=["PUT"])
def api_update_transport_vehicle(vehicle_id):
    update_transport_vehicle(vehicle_id, request.json or {})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM transport_vehicles WHERE id=?", (vehicle_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/transport-vehicles/<int:vehicle_id>", methods=["DELETE"])
def api_delete_transport_vehicle(vehicle_id):
    delete_transport_vehicle(vehicle_id)
    return jsonify({"deleted": vehicle_id})


@app.route("/api/transport-vehicles/<int:vehicle_id>/upload-image", methods=["POST"])
def api_upload_transport_vehicle_image(vehicle_id):
    import os
    f = request.files.get('image')
    if not f:
        return jsonify({"error": "No file provided"}), 400
    upload_dir = os.path.join(os.path.dirname(__file__), 'static', 'uploads', 'transport')
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(f.filename or '')[1].lower() or '.jpg'
    filename = f"tv_{vehicle_id}{ext}"
    filepath = os.path.join(upload_dir, filename)
    f.save(filepath)
    rel_path = f"static/uploads/transport/{filename}"
    update_transport_vehicle(vehicle_id, {"image_path": rel_path})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM transport_vehicles WHERE id=?", (vehicle_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/productions/<int:prod_id>/transport-assignments", methods=["GET"])
def api_transport_assignments(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_transport_assignments(prod_id))


@app.route("/api/productions/<int:prod_id>/transport-assignments", methods=["POST"])
def api_create_transport_assignment(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    if not data.get("boat_function_id"):
        return jsonify({"error": "boat_function_id required"}), 400
    aid = create_transport_assignment(data)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM transport_assignments WHERE id=?", (aid,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/transport-assignments/<int:assignment_id>", methods=["PUT"])
def api_update_transport_assignment(assignment_id):
    update_transport_assignment(assignment_id, request.json or {})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM transport_assignments WHERE id=?", (assignment_id,)).fetchone()
    return jsonify(dict(row)) if row else ("", 404)


@app.route("/api/transport-assignments/<int:assignment_id>", methods=["DELETE"])
def api_delete_transport_assignment(assignment_id):
    delete_transport_assignment(assignment_id)
    return jsonify({"deleted": assignment_id})


@app.route("/api/productions/<int:prod_id>/transport-assignments/function/<int:func_id>",
           methods=["DELETE"])
def api_delete_transport_assignment_by_function(prod_id, func_id):
    prod_or_404(prod_id)
    delete_transport_assignment_by_function(func_id)
    return jsonify({"deleted_for_function": func_id})


@app.route("/api/productions/<int:prod_id>/export/transport/csv")
def api_export_transport_csv(prod_id):
    prod_or_404(prod_id)
    rows = [r for r in get_transport_assignments(prod_id) if r.get("working_days")]
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Function", "Group", "Vehicle", "Type", "Driver", "Vendor",
                     "Start", "End", "Working Days", "Rate/day (est.)",
                     "Total Estimate", "Total Actual"])
    for r in rows:
        writer.writerow([
            r.get("function_name") or "",
            r.get("function_group") or "",
            r.get("vehicle_name_override") or r.get("vehicle_name") or "",
            r.get("vehicle_type") or "",
            r.get("driver") or "",
            r.get("vendor") or "",
            r.get("start_date") or "", r.get("end_date") or "",
            r.get("working_days") or "",
            r.get("price_override") or r.get("vehicle_daily_rate_estimate") or "",
            r.get("amount_estimate") or "",
            r.get("amount_actual") or "",
        ])
    grand_est = sum(r.get("amount_estimate") or 0 for r in rows)
    grand_act = sum(r.get("amount_actual") or 0 for r in rows)
    writer.writerow([])
    writer.writerow(["", "", "", "", "", "", "GRAND TOTAL", "", "", "", grand_est, grand_act])
    output.seek(0)
    from datetime import datetime as dt
    fname = f"KLAS7_TRANSPORT_{dt.now().strftime('%y%m%d')}.csv"
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={fname}"}
    )


@app.route("/api/productions/<int:prod_id>/export/transport/json")
def api_export_transport_json(prod_id):
    prod_or_404(prod_id)
    data = {
        "production": get_production(prod_id),
        "transport_vehicles": get_transport_vehicles(prod_id),
        "assignments": [a for a in get_transport_assignments(prod_id) if a.get("working_days")],
    }
    from datetime import datetime as dt
    fname = f"KLAS7_TRANSPORT_{dt.now().strftime('%y%m%d')}.json"
    return Response(
        json.dumps(data, indent=2, ensure_ascii=False),
        mimetype="application/json",
        headers={"Content-Disposition": f"attachment; filename={fname}"}
    )


# ─── Fuel entries ────────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/fuel-entries", methods=["GET"])
def api_get_fuel_entries(prod_id):
    prod_or_404(prod_id)
    source = request.args.get('source')
    return jsonify(get_fuel_entries(prod_id, source_type=source or None))


@app.route("/api/productions/<int:prod_id>/fuel-entries", methods=["POST"])
def api_upsert_fuel_entry(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data['production_id'] = prod_id
    entry = upsert_fuel_entry(data)
    return jsonify(entry or {}), 200


@app.route("/api/fuel-entries/<int:entry_id>", methods=["DELETE"])
def api_delete_fuel_entry(entry_id):
    delete_fuel_entry(entry_id)
    return jsonify({"ok": True})


@app.route("/api/productions/<int:prod_id>/fuel-entries/assignment/<source_type>/<int:assignment_id>", methods=["DELETE"])
def api_delete_fuel_entries_for_assignment(prod_id, source_type, assignment_id):
    prod_or_404(prod_id)
    delete_fuel_entries_for_assignment(source_type, assignment_id)
    return jsonify({"ok": True})


# ─── Fuel machinery ───────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/fuel-machinery", methods=["GET"])
def api_get_fuel_machinery(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_fuel_machinery(prod_id))


@app.route("/api/productions/<int:prod_id>/fuel-machinery", methods=["POST"])
def api_create_fuel_machinery(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data['production_id'] = prod_id
    mid = create_fuel_machinery(data)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM fuel_machinery WHERE id=?", (mid,)).fetchone()
    return jsonify(dict(row) if row else {}), 201


@app.route("/api/fuel-machinery/<int:machinery_id>", methods=["PUT"])
def api_update_fuel_machinery(machinery_id):
    update_fuel_machinery(machinery_id, request.json or {})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM fuel_machinery WHERE id=?", (machinery_id,)).fetchone()
    return jsonify(dict(row) if row else {})


@app.route("/api/fuel-machinery/<int:machinery_id>", methods=["DELETE"])
def api_delete_fuel_machinery(machinery_id):
    delete_fuel_machinery(machinery_id)
    return jsonify({"ok": True})


# ─── Fuel prices (global settings) ───────────────────────────────────────────

@app.route("/api/fuel-prices", methods=["GET"])
def api_get_fuel_prices():
    """Get global fuel prices (diesel/petrol in USD per litre)."""
    diesel = get_setting("fuel_price_diesel", "0")
    petrol = get_setting("fuel_price_petrol", "0")
    return jsonify({"diesel": float(diesel), "petrol": float(petrol)})


@app.route("/api/fuel-prices", methods=["PUT"])
def api_set_fuel_prices():
    """Set global fuel prices."""
    data = request.json or {}
    if "diesel" in data:
        set_setting("fuel_price_diesel", str(float(data["diesel"])))
    if "petrol" in data:
        set_setting("fuel_price_petrol", str(float(data["petrol"])))
    diesel = get_setting("fuel_price_diesel", "0")
    petrol = get_setting("fuel_price_petrol", "0")
    return jsonify({"diesel": float(diesel), "petrol": float(petrol)})


# ─── Fuel locked prices (day snapshots) ─────────────────────────────────────

@app.route("/api/fuel-locked-prices", methods=["GET"])
def api_get_fuel_locked_prices():
    """Get all locked day price snapshots."""
    return jsonify(get_fuel_locked_prices())


@app.route("/api/fuel-locked-prices", methods=["POST"])
def api_lock_fuel_day():
    """Lock a day with current fuel prices snapshot."""
    data = request.json or {}
    date = data.get("date")
    if not date:
        return jsonify({"error": "date is required"}), 400
    diesel_price = float(data.get("diesel_price", 0))
    petrol_price = float(data.get("petrol_price", 0))
    set_fuel_locked_price(date, diesel_price, petrol_price)
    return jsonify({"ok": True, "date": date, "diesel_price": diesel_price, "petrol_price": petrol_price})


@app.route("/api/fuel-locked-prices/<date>", methods=["DELETE"])
def api_unlock_fuel_day(date):
    """Unlock a day (remove the price snapshot)."""
    delete_fuel_locked_price(date)
    return jsonify({"ok": True})


# ─── Fuel budget export (from BUDGET tab) ────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/export/fuel-budget/csv")
def api_export_fuel_budget_csv(prod_id):
    """Export fuel budget breakdown by consumer: total litres + total price.
    Filename: KLAS7_FUEL_YYMMDD
    """
    from datetime import datetime as dt
    prod_or_404(prod_id)
    entries = get_fuel_entries(prod_id)
    machinery = get_fuel_machinery(prod_id)
    locked_prices = get_fuel_locked_prices()

    # Current global prices
    cur_diesel = float(get_setting("fuel_price_diesel", "0"))
    cur_petrol = float(get_setting("fuel_price_petrol", "0"))

    # Build consumer breakdown: group by source_type + entity name
    # We need assignment data to resolve consumer names
    from database import (get_boat_assignments, get_picture_boat_assignments,
                          get_transport_assignments, get_security_boat_assignments)
    asgn_map = {}
    for ctx, fetcher in [
        ('boats', lambda: get_boat_assignments(prod_id, context='boats')),
        ('picture_boats', lambda: get_picture_boat_assignments(prod_id)),
        ('security_boats', lambda: get_security_boat_assignments(prod_id)),
        ('transport', lambda: get_transport_assignments(prod_id)),
    ]:
        for a in fetcher():
            asgn_map[(ctx, a['id'])] = (
                a.get('boat_name_override') or a.get('boat_name') or
                a.get('vehicle_name_override') or a.get('vehicle_name') or '?',
                a.get('function_name') or '?'
            )

    # Group entries by consumer (skip machinery — handled separately below)
    consumers = {}
    for e in entries:
        if e['source_type'] == 'machinery':
            continue
        key = (e['source_type'], e['assignment_id'])
        name_info = asgn_map.get(key, (f"#{e['assignment_id']}", '?'))
        consumer_key = f"{e['source_type'].upper()} | {name_info[0]} | {name_info[1]}"
        if consumer_key not in consumers:
            consumers[consumer_key] = {'diesel_l': 0, 'petrol_l': 0, 'cost_up_to_date': 0, 'cost_estimate': 0}
        ft = e.get('fuel_type', 'DIESEL')
        liters = e.get('liters', 0) or 0
        date = e.get('date', '')
        # Price: use locked price if day is locked, else current price
        if date in locked_prices:
            price = locked_prices[date]['diesel_price'] if ft == 'DIESEL' else locked_prices[date]['petrol_price']
            consumers[consumer_key]['cost_up_to_date'] += liters * price
        else:
            price = cur_diesel if ft == 'DIESEL' else cur_petrol
            consumers[consumer_key]['cost_estimate'] += liters * price
        if ft == 'PETROL':
            consumers[consumer_key]['petrol_l'] += liters
        else:
            consumers[consumer_key]['diesel_l'] += liters

    # Machinery — computed from actual fuel_entries (source_type='machinery')
    # Build a name lookup from machinery records
    machinery_names = {m['id']: m['name'] for m in machinery}
    for e in entries:
        if e['source_type'] != 'machinery':
            continue
        m_name = machinery_names.get(e['assignment_id'], f"Machine #{e['assignment_id']}")
        consumer_key = f"MACHINERY | {m_name}"
        if consumer_key not in consumers:
            consumers[consumer_key] = {'diesel_l': 0, 'petrol_l': 0, 'cost_up_to_date': 0, 'cost_estimate': 0}
        ft = e.get('fuel_type', 'DIESEL')
        liters = e.get('liters', 0) or 0
        date = e.get('date', '')
        if date in locked_prices:
            price = locked_prices[date]['diesel_price'] if ft == 'DIESEL' else locked_prices[date]['petrol_price']
            consumers[consumer_key]['cost_up_to_date'] += liters * price
        else:
            price = cur_diesel if ft == 'DIESEL' else cur_petrol
            consumers[consumer_key]['cost_estimate'] += liters * price
        if ft == 'PETROL':
            consumers[consumer_key]['petrol_l'] += liters
        else:
            consumers[consumer_key]['diesel_l'] += liters

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Consumer", "Diesel (L)", "Petrol (L)", "Total (L)",
                "Cost Up to Date ($)", "Cost Estimate ($)", "Total Cost ($)"])
    grand_diesel = 0
    grand_petrol = 0
    grand_cost_utd = 0
    grand_cost_est = 0
    for name, data in sorted(consumers.items()):
        total_l = data['diesel_l'] + data['petrol_l']
        total_cost = data['cost_up_to_date'] + data['cost_estimate']
        w.writerow([name, round(data['diesel_l'], 1), round(data['petrol_l'], 1),
                    round(total_l, 1), round(data['cost_up_to_date'], 2),
                    round(data['cost_estimate'], 2), round(total_cost, 2)])
        grand_diesel += data['diesel_l']
        grand_petrol += data['petrol_l']
        grand_cost_utd += data['cost_up_to_date']
        grand_cost_est += data['cost_estimate']
    w.writerow([])
    grand_total_l = grand_diesel + grand_petrol
    grand_total_cost = grand_cost_utd + grand_cost_est
    avg_price = grand_total_cost / grand_total_l if grand_total_l > 0 else 0
    w.writerow(["GRAND TOTAL", round(grand_diesel, 1), round(grand_petrol, 1),
                round(grand_total_l, 1), round(grand_cost_utd, 2),
                round(grand_cost_est, 2), round(grand_total_cost, 2)])
    w.writerow(["AVERAGE PRICE PER LITRE", "", "", "", "", "", round(avg_price, 4)])
    w.writerow([])
    w.writerow([f"Current Diesel price: ${cur_diesel}/L"])
    w.writerow([f"Current Petrol price: ${cur_petrol}/L"])
    out.seek(0)
    fname = f"KLAS7_FUEL_{dt.now().strftime('%y%m%d')}.csv"
    return Response(out.read(), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={fname}"})


# ─── Fuel exports ─────────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/export/fuel/csv")
def api_export_fuel_csv(prod_id):
    prod_or_404(prod_id)
    entries = get_fuel_entries(prod_id)
    machinery = get_fuel_machinery(prod_id)
    import csv, io
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Category", "Name / Function", "Date", "Liters", "Fuel Type"])
    totals = {"DIESEL": 0, "PETROL": 0}
    # Build machinery name lookup for readable export
    machinery_names = {m['id']: m['name'] for m in machinery}
    for e in entries:
        src = e.get("source_type", "")
        name = e.get("assignment_id", "")
        # For machinery entries, resolve to readable name
        if src == "machinery":
            name = machinery_names.get(e.get("assignment_id"), name)
        w.writerow([src, name,
                    e.get("date", ""), e.get("liters", 0), e.get("fuel_type", "")])
        ft = e.get("fuel_type", "DIESEL")
        totals[ft] = totals.get(ft, 0) + (e.get("liters") or 0)
    w.writerow([])
    w.writerow(["GRAND TOTAL DIESEL", "", "", totals.get("DIESEL", 0), "DIESEL"])
    w.writerow(["GRAND TOTAL PETROL", "", "", totals.get("PETROL", 0), "PETROL"])
    out.seek(0)
    from datetime import datetime as dt
    fname = f"KLAS7_FUEL_{dt.now().strftime('%y%m%d')}.csv"
    return Response(out.read(), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={fname}"})


@app.route("/api/productions/<int:prod_id>/export/fuel/json")
def api_export_fuel_json(prod_id):
    prod_or_404(prod_id)
    data = {
        "production": get_production(prod_id),
        "fuel_entries": get_fuel_entries(prod_id),
        "fuel_machinery": get_fuel_machinery(prod_id),
    }
    from datetime import datetime as dt
    fname = f"KLAS7_FUEL_{dt.now().strftime('%y%m%d')}.json"
    return Response(
        json.dumps(data, indent=2, ensure_ascii=False),
        mimetype="application/json",
        headers={"Content-Disposition": f"attachment; filename={fname}"}
    )


# ─── Migrate boat photos from BATEAUX project ────────────────────────────────

@app.route("/api/migrate-boat-photos", methods=["POST"])
def api_migrate_boat_photos():
    import os, re, shutil
    SRC = os.path.join(os.path.dirname(__file__), '..', 'BATEAUX', 'static', 'boat_images')
    DST = os.path.join(os.path.dirname(__file__), 'static', 'uploads', 'boats')
    if not os.path.isdir(SRC):
        return jsonify({"error": f"Source directory not found: {SRC}"}), 404
    os.makedirs(DST, exist_ok=True)
    with get_db() as conn:
        boats = conn.execute("SELECT id, boat_nr FROM boats").fetchall()
        nr_map = {b['boat_nr']: b['id'] for b in boats if b['boat_nr']}
        done, skipped = [], []
        for f in sorted(os.listdir(SRC)):
            m = re.match(r'BOAT_+(\d+)_+', f)
            if not m or not f.lower().endswith('.jpg'):
                skipped.append(f)
                continue
            nr = int(m.group(1))
            if nr not in nr_map:
                skipped.append(f"{f} (boat_nr {nr} not in DB)")
                continue
            boat_id = nr_map[nr]
            ext = os.path.splitext(f)[1].lower() or '.jpg'
            dst_name = f"boat_{boat_id}{ext}"
            shutil.copy2(os.path.join(SRC, f), os.path.join(DST, dst_name))
            rel = f"static/uploads/boats/{dst_name}"
            conn.execute("UPDATE boats SET image_path=? WHERE id=?", (rel, boat_id))
            done.append(dst_name)
    return jsonify({"migrated": len(done), "skipped": len(skipped), "files": done})


# ─── Data reload ──────────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/reload", methods=["POST"])
def api_reload(prod_id):
    prod_or_404(prod_id)
    from data_loader import migrate_from_bateaux
    result = migrate_from_bateaux(prod_id, force=True)
    return jsonify(result)


# ─── Location Sites CRUD ─────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/locations", methods=["GET"])
def api_get_locations(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_location_sites(prod_id))


@app.route("/api/productions/<int:prod_id>/locations", methods=["POST"])
def api_create_location(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data['production_id'] = prod_id
    if not data.get('name'):
        return jsonify({"error": "name is required"}), 400
    result = create_location_site(data)
    return jsonify(result), 201


@app.route("/api/locations/<int:loc_id>", methods=["PUT"])
def api_update_location(loc_id):
    data = request.json or {}
    # Get old name for schedule cascade
    from database import get_db
    with get_db() as conn:
        old = conn.execute("SELECT * FROM locations WHERE id=?", (loc_id,)).fetchone()
    if not old:
        return jsonify({"error": "not found"}), 404
    old = dict(old)
    old_name = old['name']
    result = update_location_site(loc_id, data)
    # Cascade rename in schedules
    if 'name' in data and data['name'] != old_name:
        rename_location_in_schedules(old['production_id'], old_name, data['name'])
    return jsonify(result or {})


@app.route("/api/locations/<int:loc_id>", methods=["DELETE"])
def api_delete_location(loc_id):
    delete_location_site(loc_id)
    return jsonify({"deleted": loc_id})


# ─── Guard Posts CRUD ────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/guard-posts", methods=["GET"])
def api_get_guard_posts(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_guard_posts(prod_id))


@app.route("/api/productions/<int:prod_id>/guard-posts", methods=["POST"])
def api_create_guard_post(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data['production_id'] = prod_id
    if not data.get('name'):
        return jsonify({"error": "name is required"}), 400
    result = create_guard_post(data)
    return jsonify(result), 201


@app.route("/api/guard-posts/<int:post_id>", methods=["PUT"])
def api_update_guard_post(post_id):
    data = request.json or {}
    from database import get_db
    with get_db() as conn:
        old = conn.execute("SELECT * FROM guard_posts WHERE id=?", (post_id,)).fetchone()
    if not old:
        return jsonify({"error": "not found"}), 404
    old = dict(old)
    old_name = old['name']
    result = update_guard_post(post_id, data)
    # Cascade rename in guard schedules
    if 'name' in data and data['name'] != old_name:
        rename_guard_post_in_schedules(old['production_id'], old_name, data['name'])
    return jsonify(result or {})


@app.route("/api/guard-posts/<int:post_id>", methods=["DELETE"])
def api_delete_guard_post(post_id):
    delete_guard_post(post_id)
    return jsonify({"deleted": post_id})


# ─── Location Schedules ──────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/location-schedules", methods=["GET"])
def api_get_location_schedules(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_location_schedules(prod_id))


@app.route("/api/productions/<int:prod_id>/location-schedules", methods=["POST"])
def api_upsert_location_schedule(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data['production_id'] = prod_id
    if not data.get('location_name') or not data.get('date') or not data.get('status'):
        return jsonify({"error": "location_name, date, status required"}), 400
    result = upsert_location_schedule(data)
    return jsonify(result or {}), 200


@app.route("/api/productions/<int:prod_id>/location-schedules/delete", methods=["POST"])
def api_delete_location_schedule(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    if not data.get('location_name') or not data.get('date'):
        return jsonify({"error": "location_name and date required"}), 400
    delete_location_schedule(prod_id, data['location_name'], data['date'])
    return jsonify({"ok": True})


@app.route("/api/productions/<int:prod_id>/location-schedules/<int:schedule_id>", methods=["DELETE"])
def api_delete_location_schedule_by_id(prod_id, schedule_id):
    prod_or_404(prod_id)
    delete_location_schedule_by_id(schedule_id)
    return jsonify({"deleted": schedule_id})


@app.route("/api/productions/<int:prod_id>/location-schedules/lock", methods=["PUT"])
def api_lock_location_schedules(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    dates = data.get('dates', [])
    locked = data.get('locked', True)
    lock_location_schedules(prod_id, dates, locked)
    return jsonify({"ok": True})


@app.route("/api/productions/<int:prod_id>/location-schedules/auto-fill", methods=["POST"])
def api_auto_fill_locations(prod_id):
    prod_or_404(prod_id)
    created = auto_fill_locations_from_pdt(prod_id)
    return jsonify({"created": created})


@app.route("/api/productions/<int:prod_id>/sync-pdt-locations", methods=["POST"])
def api_sync_pdt_locations(prod_id):
    """Sync a single PDT day's locations to the Locations schedule.
    Body: { date: "YYYY-MM-DD", locations: ["LOC1", "LOC2", ...] }
    For deletions: { date: "YYYY-MM-DD", locations: [], deleted: true }
    """
    prod_or_404(prod_id)
    data = request.json or {}
    day_date = data.get('date')
    if not day_date:
        return jsonify({"error": "date required"}), 400

    if data.get('deleted'):
        remove_pdt_film_days_for_date(prod_id, day_date)
    else:
        locations = data.get('locations', [])
        sync_pdt_day_to_locations(prod_id, day_date, locations)
    return jsonify({"ok": True})


# ─── Guard Location Schedules ───────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/guard-schedules", methods=["GET"])
def api_get_guard_location_schedules(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_guard_location_schedules(prod_id))


@app.route("/api/productions/<int:prod_id>/guard-schedules", methods=["POST"])
def api_upsert_guard_location_schedule(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data['production_id'] = prod_id
    if not data.get('location_name') or not data.get('date') or not data.get('status'):
        return jsonify({"error": "location_name, date, status required"}), 400
    result = upsert_guard_location_schedule(data)
    return jsonify(result or {}), 200


@app.route("/api/productions/<int:prod_id>/guard-schedules/delete", methods=["POST"])
def api_delete_guard_location_schedule(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    if not data.get('location_name') or not data.get('date'):
        return jsonify({"error": "location_name and date required"}), 400
    delete_guard_location_schedule(prod_id, data['location_name'], data['date'])
    return jsonify({"ok": True})


@app.route("/api/productions/<int:prod_id>/guard-schedules/lock", methods=["PUT"])
def api_lock_guard_location_schedules(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    dates = data.get('dates', [])
    locked = data.get('locked', True)
    lock_guard_location_schedules(prod_id, dates, locked)
    return jsonify({"ok": True})


@app.route("/api/productions/<int:prod_id>/guard-schedules/sync", methods=["POST"])
def api_sync_guard_location_schedules(prod_id):
    """Sync guard_location_schedules from location_schedules (auto-populate defaults)."""
    prod_or_404(prod_id)
    result = sync_guard_location_from_locations(prod_id)
    return jsonify(result)


@app.route("/api/productions/<int:prod_id>/guard-schedules/update-guards", methods=["POST"])
def api_update_guard_location_nb_guards(prod_id):
    """Update nb_guards for a specific location/date."""
    prod_or_404(prod_id)
    data = request.json or {}
    if not data.get('location_name') or not data.get('date'):
        return jsonify({"error": "location_name and date required"}), 400
    nb_guards = int(data.get('nb_guards', 0))
    if nb_guards < 0:
        return jsonify({"error": "nb_guards must be >= 0"}), 400
    result = update_guard_location_nb_guards(prod_id, data['location_name'], data['date'], nb_guards)
    return jsonify(result or {})


# ─── Guard Camp (Base Camp) Workers & Assignments ─────────────────────────

@app.route("/api/productions/<int:prod_id>/guard-camp-workers", methods=["GET"])
def api_guard_camp_workers(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_guard_camp_workers(prod_id))


@app.route("/api/productions/<int:prod_id>/guard-camp-workers", methods=["POST"])
def api_create_guard_camp_worker(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data["production_id"] = prod_id
    if not data.get("name"):
        return jsonify({"error": "name required"}), 400
    worker_id = create_guard_camp_worker(data)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM guard_camp_workers WHERE id=?", (worker_id,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/guard-camp-workers/<int:worker_id>", methods=["PUT"])
def api_update_guard_camp_worker(worker_id):
    data = request.json or {}
    update_guard_camp_worker(worker_id, data)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM guard_camp_workers WHERE id=?", (worker_id,)).fetchone()
    if not row:
        abort(404)
    return jsonify(dict(row))


@app.route("/api/guard-camp-workers/<int:worker_id>", methods=["DELETE"])
def api_delete_guard_camp_worker(worker_id):
    delete_guard_camp_worker(worker_id)
    return jsonify({"deleted": worker_id})


@app.route("/api/guard-camp-workers/<int:worker_id>/upload-image", methods=["POST"])
def api_upload_guard_camp_worker_image(worker_id):
    if 'image' not in request.files:
        return jsonify({"error": "No image file"}), 400
    file = request.files['image']
    upload_dir = os.path.join(app.static_folder, 'uploads', 'guard_camp')
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename)[1] or '.jpg'
    fname = f"gc_{worker_id}{ext}"
    filepath = os.path.join(upload_dir, fname)
    file.save(filepath)
    rel_path = f"static/uploads/guard_camp/{fname}"
    update_guard_camp_worker(worker_id, {"image_path": rel_path})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM guard_camp_workers WHERE id=?", (worker_id,)).fetchone()
    return jsonify(dict(row))


@app.route("/api/productions/<int:prod_id>/guard-camp-assignments", methods=["GET"])
def api_guard_camp_assignments(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_guard_camp_assignments(prod_id))


@app.route("/api/productions/<int:prod_id>/guard-camp-assignments", methods=["POST"])
def api_create_guard_camp_assignment(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    if not data.get("boat_function_id"):
        return jsonify({"error": "boat_function_id required"}), 400
    assignment_id = create_guard_camp_assignment(data)
    assignments = get_guard_camp_assignments(prod_id)
    asgn = next((a for a in assignments if a["id"] == assignment_id), None)
    return jsonify(asgn), 201


@app.route("/api/guard-camp-assignments/<int:assignment_id>", methods=["PUT"])
def api_update_guard_camp_assignment(assignment_id):
    data = request.json or {}
    update_guard_camp_assignment(assignment_id, data)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM guard_camp_assignments WHERE id=?", (assignment_id,)).fetchone()
    if not row:
        abort(404)
    return jsonify(dict(row))


@app.route("/api/guard-camp-assignments/<int:assignment_id>", methods=["DELETE"])
def api_delete_guard_camp_assignment(assignment_id):
    delete_guard_camp_assignment(assignment_id)
    return jsonify({"deleted": assignment_id})


@app.route("/api/productions/<int:prod_id>/guard-camp-assignments/function/<int:func_id>", methods=["DELETE"])
def api_delete_guard_camp_assignment_by_function(prod_id, func_id):
    prod_or_404(prod_id)
    delete_guard_camp_assignment_by_function(func_id)
    return jsonify({"ok": True})


@app.route("/api/productions/<int:prod_id>/export/guard-camp/csv")
def api_export_guard_camp_csv(prod_id):
    prod_or_404(prod_id)
    rows = [r for r in get_guard_camp_assignments(prod_id) if r.get("working_days")]
    from collections import OrderedDict
    by_group = OrderedDict()
    for r in rows:
        g = r.get("function_group") or r.get("helper_group") or "GENERAL"
        if g not in by_group:
            by_group[g] = []
        by_group[g].append(r)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Group", "Function", "Guard", "Role", "Contact",
                     "Start", "End", "Working Days", "Rate/day",
                     "Total Estimate", "Total Actual"])
    grand_est = 0
    grand_act = 0
    for group_name, group_rows in by_group.items():
        group_est = 0
        group_act = 0
        for r in group_rows:
            est = r.get("amount_estimate") or 0
            act = r.get("amount_actual") or 0
            group_est += est
            group_act += act
            writer.writerow([
                group_name,
                r.get("function_name") or "",
                r.get("helper_name_override") or r.get("helper_name") or "",
                r.get("helper_role") or "",
                r.get("helper_contact") or "",
                r.get("start_date") or "", r.get("end_date") or "",
                r.get("working_days") or "",
                r.get("price_override") or r.get("helper_daily_rate_estimate") or "",
                est,
                act if act else "",
            ])
        writer.writerow(["", "", "", "", "", "", f"SUB-TOTAL {group_name}", "", "", group_est, group_act if group_act else ""])
        writer.writerow([])
        grand_est += group_est
        grand_act += group_act
    writer.writerow(["", "", "", "", "", "", "GRAND TOTAL", "", "", grand_est, grand_act if grand_act else ""])
    output.seek(0)
    from datetime import datetime as dt
    fname = f"KLAS7_GUARDS-BASECAMP_{dt.now().strftime('%y%m%d')}.csv"
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={fname}"}
    )


# ─── Security Auto-fill from Locations ──────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/security-auto-fill", methods=["POST"])
def api_security_auto_fill(prod_id):
    """Auto-create security boat day overrides based on location schedule F days."""
    prod_or_404(prod_id)
    loc_schedules = get_location_schedules(prod_id)
    # Filter only F (filming) days for game locations
    filming_days = [ls for ls in loc_schedules
                    if ls['status'] == 'F' and ls['location_type'] == 'game']
    return jsonify({
        "message": f"Found {len(filming_days)} filming days at game locations",
        "filming_days": filming_days,
    })


# ─── FNB Budget Export ───────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/export/fnb-budget/csv")
def api_export_fnb_budget_csv(prod_id):
    """Export simplified FNB budget: totals by category only.
    Two columns: Up to Date (consumption) and Estimate (purchases).
    Filename: KLAS7_FNB_YYMMDD
    """
    from datetime import datetime as dt
    prod_or_404(prod_id)
    budget = get_fnb_budget_data(prod_id)

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["KLAS 7 - FNB BUDGET EXPORT"])
    w.writerow([f"Generated: {dt.now().strftime('%Y-%m-%d %H:%M')}"])
    w.writerow([])
    w.writerow(["Category", "Up to Date ($)", "Estimate ($)", "Total ($)"])

    grand_utd = 0
    grand_est = 0
    for cat in budget.get('categories', []):
        utd = round(cat.get('consumption_total', 0), 2)
        est = round(cat.get('purchase_total', 0), 2)
        total = round(utd + est, 2)
        w.writerow([cat['name'], utd, est, total])
        grand_utd += utd
        grand_est += est

    w.writerow([])
    grand_total = round(grand_utd + grand_est, 2)
    w.writerow(["GRAND TOTAL", round(grand_utd, 2), round(grand_est, 2), grand_total])
    w.writerow([])
    balance = round(grand_est - grand_utd, 2)
    w.writerow([f"Balance (Estimate - Up to Date): ${balance}"])

    out.seek(0)
    fname = f"KLAS7_FNB_{dt.now().strftime('%y%m%d')}.csv"
    return Response(out.read(), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={fname}"})


# ─── FNB Tracking ───────────────────────────────────────────────────────────

@app.route("/api/productions/<int:prod_id>/fnb-tracking", methods=["GET"])
def api_get_fnb_tracking(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_fnb_tracking(prod_id))


@app.route("/api/productions/<int:prod_id>/fnb-tracking", methods=["POST"])
def api_upsert_fnb_tracking(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data['production_id'] = prod_id
    if not data.get('date') or not data.get('category'):
        return jsonify({"error": "date and category required"}), 400
    result = upsert_fnb_tracking(data)
    return jsonify(result or {}), 200


@app.route("/api/fnb-tracking/<int:entry_id>", methods=["DELETE"])
def api_delete_fnb_tracking(entry_id):
    delete_fnb_tracking(entry_id)
    return jsonify({"deleted": entry_id})


@app.route("/api/productions/<int:prod_id>/fnb-summary", methods=["GET"])
def api_fnb_summary(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_fnb_summary(prod_id))


# ─── FNB v2 (dynamic categories / items / entries) ──────────────────────────

@app.route("/api/productions/<int:prod_id>/fnb-categories", methods=["GET"])
def api_get_fnb_categories(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_fnb_categories(prod_id))


@app.route("/api/productions/<int:prod_id>/fnb-categories", methods=["POST"])
def api_create_fnb_category(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data['production_id'] = prod_id
    if not data.get('name'):
        return jsonify({"error": "name required"}), 400
    try:
        result = create_fnb_category(data)
        return jsonify(result), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/fnb-categories/<int:cat_id>", methods=["PUT"])
def api_update_fnb_category(cat_id):
    data = request.json or {}
    result = update_fnb_category(cat_id, data)
    if not result:
        abort(404)
    return jsonify(result)


@app.route("/api/fnb-categories/<int:cat_id>", methods=["DELETE"])
def api_delete_fnb_category(cat_id):
    delete_fnb_category(cat_id)
    return jsonify({"deleted": cat_id})


@app.route("/api/productions/<int:prod_id>/fnb-items", methods=["GET"])
def api_get_fnb_items(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_fnb_items(prod_id))


@app.route("/api/productions/<int:prod_id>/fnb-items", methods=["POST"])
def api_create_fnb_item(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data['production_id'] = prod_id
    if not data.get('name') or not data.get('category_id'):
        return jsonify({"error": "name and category_id required"}), 400
    try:
        result = create_fnb_item(data)
        return jsonify(result), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/fnb-items/<int:item_id>", methods=["PUT"])
def api_update_fnb_item(item_id):
    data = request.json or {}
    result = update_fnb_item(item_id, data)
    if not result:
        abort(404)
    return jsonify(result)


@app.route("/api/fnb-items/<int:item_id>", methods=["DELETE"])
def api_delete_fnb_item(item_id):
    delete_fnb_item(item_id)
    return jsonify({"deleted": item_id})


@app.route("/api/productions/<int:prod_id>/fnb-entries", methods=["GET"])
def api_get_fnb_entries(prod_id):
    prod_or_404(prod_id)
    entry_type = request.args.get('type')
    return jsonify(get_fnb_entries(prod_id, entry_type))


@app.route("/api/productions/<int:prod_id>/fnb-entries", methods=["POST"])
def api_upsert_fnb_entry(prod_id):
    prod_or_404(prod_id)
    data = request.json or {}
    data['production_id'] = prod_id
    if not data.get('item_id') or not data.get('entry_type') or not data.get('date'):
        return jsonify({"error": "item_id, entry_type and date required"}), 400
    if data['entry_type'] not in ('purchase', 'consumption'):
        return jsonify({"error": "entry_type must be 'purchase' or 'consumption'"}), 400
    result = upsert_fnb_entry(data)
    return jsonify(result or {}), 200


@app.route("/api/fnb-entries/<int:entry_id>", methods=["DELETE"])
def api_delete_fnb_entry(entry_id):
    delete_fnb_entry(entry_id)
    return jsonify({"deleted": entry_id})


@app.route("/api/productions/<int:prod_id>/fnb-budget", methods=["GET"])
def api_fnb_budget(prod_id):
    prod_or_404(prod_id)
    return jsonify(get_fnb_budget_data(prod_id))


# ─── Global Budget Export (multi-sheet Excel) ────────────────────────────────

@app.route("/api/productions/<int:prod_id>/export/budget-global")
def api_export_budget_global(prod_id):
    """Export full budget as a multi-sheet Excel file (.xlsx).
    One sheet per category, plus a Summary sheet.
    Filename: KLAS7_BUDGET_YYMMDD.xlsx
    """
    from datetime import datetime as dt
    from collections import OrderedDict
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    prod_or_404(prod_id)

    wb = Workbook()

    # -- Style constants --
    header_font = Font(bold=True, color="FFFFFF", size=10)
    header_fill = PatternFill(start_color="2D2D2D", end_color="2D2D2D", fill_type="solid")
    title_font = Font(bold=True, size=12)
    subtotal_font = Font(bold=True, size=10)
    money_fmt = '#,##0'
    money_fmt_dec = '#,##0.00'
    green_font = Font(bold=True, color="22C55E")
    thin_border = Border(
        bottom=Side(style='thin', color='CCCCCC')
    )

    def style_header_row(ws, num_cols):
        for col in range(1, num_cols + 1):
            cell = ws.cell(row=ws.max_row, column=col)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal='center')

    def auto_width(ws):
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                try:
                    if cell.value:
                        max_len = max(max_len, len(str(cell.value)))
                except:
                    pass
            ws.column_dimensions[col_letter].width = min(max(max_len + 2, 8), 40)

    # Collect category totals for summary
    summary_data = OrderedDict()

    # ── Sheet 1: LOCATIONS ────────────────────────────────────────────────────
    ws = wb.active
    ws.title = "Locations"
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

    loc_day_counts = {}
    for ls in loc_schedules:
        loc_name = ls['location_name']
        loc_day_counts.setdefault(loc_name, {'P': 0, 'F': 0, 'W': 0})
        if ls['status'] in ('P', 'F', 'W'):
            loc_day_counts[loc_name][ls['status']] += 1

    ws.append(["KLAS 7 - LOCATIONS BUDGET"])
    ws.cell(row=1, column=1).font = title_font
    ws.append([f"Generated: {dt.now().strftime('%Y-%m-%d %H:%M')}"])
    ws.append([])
    ws.append(["Location", "Type", "P Days", "F Days", "W Days", "Total Days",
               "$/P", "$/F", "$/W", "Global Deal", "Total ($)"])
    style_header_row(ws, 11)

    loc_grand = 0
    for loc_name, counts in sorted(loc_day_counts.items()):
        pricing = site_pricing.get(loc_name, {'price_p': 0, 'price_f': 0, 'price_w': 0, 'global_deal': None})
        site_info = next((s for s in loc_sites if s['name'] == loc_name), {})
        loc_type = site_info.get('location_type', '')
        if pricing['global_deal'] and pricing['global_deal'] > 0:
            total = pricing['global_deal']
        else:
            total = (counts['P'] * pricing['price_p'] +
                     counts['F'] * pricing['price_f'] +
                     counts['W'] * pricing['price_w'])
        loc_grand += total
        ws.append([loc_name, loc_type, counts['P'], counts['F'], counts['W'],
                   counts['P'] + counts['F'] + counts['W'],
                   pricing['price_p'], pricing['price_f'], pricing['price_w'],
                   pricing['global_deal'] or "", round(total, 2)])
    ws.append([])
    ws.append(["", "", "", "", "", "", "", "", "", "GRAND TOTAL", round(loc_grand, 2)])
    ws.cell(row=ws.max_row, column=11).font = green_font
    auto_width(ws)
    summary_data["LOCATIONS"] = round(loc_grand, 2)

    # ── Sheet 2: BOATS ────────────────────────────────────────────────────────
    ws = wb.create_sheet("Boats")
    budget = get_budget(prod_id)
    boat_rows = [r for r in get_boat_assignments(prod_id, context='boats') if r.get("working_days")]
    ws.append(["KLAS 7 - BOATS BUDGET"])
    ws.cell(row=1, column=1).font = title_font
    ws.append([f"Generated: {dt.now().strftime('%Y-%m-%d %H:%M')}"])
    ws.append([])
    ws.append(["Department", "Function", "Boat", "Vendor", "Start", "End",
               "Working Days", "Rate/day", "Total Estimate", "Total Actual"])
    style_header_row(ws, 10)
    grand_est = 0
    grand_act = 0
    for r in boat_rows:
        est = r.get("amount_estimate") or 0
        act = r.get("amount_actual") or 0
        grand_est += est
        grand_act += act
        ws.append([
            r.get("department") or "BOATS",
            r.get("function_name") or r.get("name") or "",
            r.get("boat_name_override") or r.get("boat_name") or "",
            r.get("vendor") or "",
            r.get("start_date") or "", r.get("end_date") or "",
            r.get("working_days") or "",
            r.get("price_override") or r.get("boat_daily_rate_estimate") or "",
            est, act if act else "",
        ])
    ws.append([])
    ws.append(["", "", "", "", "", "", "GRAND TOTAL", "", round(grand_est, 2), round(grand_act, 2)])
    ws.cell(row=ws.max_row, column=9).font = green_font
    auto_width(ws)
    summary_data["BOATS"] = round(grand_est, 2)

    # ── Sheet 3: PICTURE BOATS ────────────────────────────────────────────────
    ws = wb.create_sheet("Picture Boats")
    pb_rows = [r for r in get_picture_boat_assignments(prod_id) if r.get("working_days")]
    ws.append(["KLAS 7 - PICTURE BOATS BUDGET"])
    ws.cell(row=1, column=1).font = title_font
    ws.append([f"Generated: {dt.now().strftime('%Y-%m-%d %H:%M')}"])
    ws.append([])
    ws.append(["Function", "Group", "Boat", "Captain", "Vendor",
               "Start", "End", "Working Days", "Rate/day (est.)",
               "Total Estimate", "Total Actual"])
    style_header_row(ws, 11)
    grand_est = 0
    grand_act = 0
    for r in pb_rows:
        est = r.get("amount_estimate") or 0
        act = r.get("amount_actual") or 0
        grand_est += est
        grand_act += act
        ws.append([
            r.get("function_name") or "",
            r.get("function_group") or "",
            r.get("boat_name_override") or r.get("boat_name") or "",
            r.get("captain") or "",
            r.get("vendor") or "",
            r.get("start_date") or "", r.get("end_date") or "",
            r.get("working_days") or "",
            r.get("price_override") or r.get("boat_daily_rate_estimate") or "",
            est, act if act else "",
        ])
    ws.append([])
    ws.append(["", "", "", "", "", "", "GRAND TOTAL", "", "", round(grand_est, 2), round(grand_act, 2)])
    ws.cell(row=ws.max_row, column=10).font = green_font
    auto_width(ws)
    summary_data["PICTURE BOATS"] = round(grand_est, 2)

    # ── Sheet 4: SECURITY BOATS ───────────────────────────────────────────────
    ws = wb.create_sheet("Security Boats")
    sb_rows = [r for r in get_security_boat_assignments(prod_id) if r.get("working_days")]
    ws.append(["KLAS 7 - SECURITY BOATS BUDGET"])
    ws.cell(row=1, column=1).font = title_font
    ws.append([f"Generated: {dt.now().strftime('%Y-%m-%d %H:%M')}"])
    ws.append([])
    ws.append(["Function", "Group", "Boat", "Captain", "Vendor",
               "Start", "End", "Working Days", "Rate/day (est.)",
               "Total Estimate", "Total Actual"])
    style_header_row(ws, 11)
    grand_est = 0
    grand_act = 0
    for r in sb_rows:
        est = r.get("amount_estimate") or 0
        act = r.get("amount_actual") or 0
        grand_est += est
        grand_act += act
        ws.append([
            r.get("function_name") or "",
            r.get("function_group") or "",
            r.get("boat_name_override") or r.get("boat_name") or "",
            r.get("captain") or "",
            r.get("vendor") or "",
            r.get("start_date") or "", r.get("end_date") or "",
            r.get("working_days") or "",
            r.get("price_override") or r.get("boat_daily_rate_estimate") or "",
            est, act if act else "",
        ])
    ws.append([])
    ws.append(["", "", "", "", "", "", "GRAND TOTAL", "", "", round(grand_est, 2), round(grand_act, 2)])
    ws.cell(row=ws.max_row, column=10).font = green_font
    auto_width(ws)
    summary_data["SECURITY BOATS"] = round(grand_est, 2)

    # ── Sheet 5: TRANSPORT ────────────────────────────────────────────────────
    ws = wb.create_sheet("Transport")
    tr_rows = [r for r in get_transport_assignments(prod_id) if r.get("working_days")]
    ws.append(["KLAS 7 - TRANSPORT BUDGET"])
    ws.cell(row=1, column=1).font = title_font
    ws.append([f"Generated: {dt.now().strftime('%Y-%m-%d %H:%M')}"])
    ws.append([])
    ws.append(["Function", "Group", "Vehicle", "Type", "Driver", "Vendor",
               "Start", "End", "Working Days", "Rate/day (est.)",
               "Total Estimate", "Total Actual"])
    style_header_row(ws, 12)
    grand_est = 0
    grand_act = 0
    for r in tr_rows:
        est = r.get("amount_estimate") or 0
        act = r.get("amount_actual") or 0
        grand_est += est
        grand_act += act
        ws.append([
            r.get("function_name") or "",
            r.get("function_group") or "",
            r.get("vehicle_name_override") or r.get("vehicle_name") or "",
            r.get("vehicle_type") or "",
            r.get("driver") or "",
            r.get("vendor") or "",
            r.get("start_date") or "", r.get("end_date") or "",
            r.get("working_days") or "",
            r.get("price_override") or r.get("vehicle_daily_rate_estimate") or "",
            est, act if act else "",
        ])
    ws.append([])
    ws.append(["", "", "", "", "", "", "GRAND TOTAL", "", "", "", round(grand_est, 2), round(grand_act, 2)])
    ws.cell(row=ws.max_row, column=11).font = green_font
    auto_width(ws)
    summary_data["TRANSPORT"] = round(grand_est, 2)

    # ── Sheet 6: FUEL ─────────────────────────────────────────────────────────
    ws = wb.create_sheet("Fuel")
    entries = get_fuel_entries(prod_id)
    machinery = get_fuel_machinery(prod_id)
    locked_prices = get_fuel_locked_prices()
    cur_diesel = float(get_setting("fuel_price_diesel", "0"))
    cur_petrol = float(get_setting("fuel_price_petrol", "0"))

    # Build consumer breakdown (same logic as fuel-budget CSV export)
    asgn_map = {}
    for ctx, fetcher in [
        ('boats', lambda: get_boat_assignments(prod_id, context='boats')),
        ('picture_boats', lambda: get_picture_boat_assignments(prod_id)),
        ('security_boats', lambda: get_security_boat_assignments(prod_id)),
        ('transport', lambda: get_transport_assignments(prod_id)),
    ]:
        for a in fetcher():
            asgn_map[(ctx, a['id'])] = (
                a.get('boat_name_override') or a.get('boat_name') or
                a.get('vehicle_name_override') or a.get('vehicle_name') or '?',
                a.get('function_name') or '?'
            )

    consumers = {}
    for e in entries:
        if e['source_type'] == 'machinery':
            continue  # handled separately below with proper name resolution
        key = (e['source_type'], e['assignment_id'])
        name_info = asgn_map.get(key, (f"#{e['assignment_id']}", '?'))
        consumer_key = f"{e['source_type'].upper()} | {name_info[0]} | {name_info[1]}"
        if consumer_key not in consumers:
            consumers[consumer_key] = {'diesel_l': 0, 'petrol_l': 0, 'cost_up_to_date': 0, 'cost_estimate': 0}
        ft = e.get('fuel_type', 'DIESEL')
        liters = e.get('liters', 0) or 0
        date = e.get('date', '')
        if date in locked_prices:
            price = locked_prices[date]['diesel_price'] if ft == 'DIESEL' else locked_prices[date]['petrol_price']
            consumers[consumer_key]['cost_up_to_date'] += liters * price
        else:
            price = cur_diesel if ft == 'DIESEL' else cur_petrol
            consumers[consumer_key]['cost_estimate'] += liters * price
        if ft == 'PETROL':
            consumers[consumer_key]['petrol_l'] += liters
        else:
            consumers[consumer_key]['diesel_l'] += liters

    # Machinery entries from fuel_entries with source_type='machinery'
    # Resolve machinery names for consumer keys
    machinery_names = {m['id']: m['name'] for m in machinery}
    for e in entries:
        if e['source_type'] != 'machinery':
            continue
        m_name = machinery_names.get(e['assignment_id'], f"Machine #{e['assignment_id']}")
        consumer_key = f"MACHINERY | {m_name}"
        if consumer_key not in consumers:
            consumers[consumer_key] = {'diesel_l': 0, 'petrol_l': 0, 'cost_up_to_date': 0, 'cost_estimate': 0}
        ft = e.get('fuel_type', 'DIESEL')
        liters = e.get('liters', 0) or 0
        date = e.get('date', '')
        if date in locked_prices:
            price = locked_prices[date]['diesel_price'] if ft == 'DIESEL' else locked_prices[date]['petrol_price']
            consumers[consumer_key]['cost_up_to_date'] += liters * price
        else:
            price = cur_diesel if ft == 'DIESEL' else cur_petrol
            consumers[consumer_key]['cost_estimate'] += liters * price
        if ft == 'PETROL':
            consumers[consumer_key]['petrol_l'] += liters
        else:
            consumers[consumer_key]['diesel_l'] += liters

    ws.append(["KLAS 7 - FUEL BUDGET"])
    ws.cell(row=1, column=1).font = title_font
    ws.append([f"Generated: {dt.now().strftime('%Y-%m-%d %H:%M')}"])
    ws.append([])
    ws.append(["Consumer", "Diesel (L)", "Petrol (L)", "Total (L)",
               "Cost Up to Date ($)", "Cost Estimate ($)", "Total Cost ($)"])
    style_header_row(ws, 7)
    fuel_grand_diesel = 0
    fuel_grand_petrol = 0
    fuel_grand_utd = 0
    fuel_grand_est = 0
    for name, data in sorted(consumers.items()):
        total_l = data['diesel_l'] + data['petrol_l']
        total_cost = data['cost_up_to_date'] + data['cost_estimate']
        ws.append([name, round(data['diesel_l'], 1), round(data['petrol_l'], 1),
                   round(total_l, 1), round(data['cost_up_to_date'], 2),
                   round(data['cost_estimate'], 2), round(total_cost, 2)])
        fuel_grand_diesel += data['diesel_l']
        fuel_grand_petrol += data['petrol_l']
        fuel_grand_utd += data['cost_up_to_date']
        fuel_grand_est += data['cost_estimate']
    ws.append([])
    fuel_total_l = fuel_grand_diesel + fuel_grand_petrol
    fuel_total_cost = fuel_grand_utd + fuel_grand_est
    avg_price = fuel_total_cost / fuel_total_l if fuel_total_l > 0 else 0
    ws.append(["GRAND TOTAL", round(fuel_grand_diesel, 1), round(fuel_grand_petrol, 1),
               round(fuel_total_l, 1), round(fuel_grand_utd, 2),
               round(fuel_grand_est, 2), round(fuel_total_cost, 2)])
    ws.cell(row=ws.max_row, column=7).font = green_font
    ws.append(["AVERAGE PRICE PER LITRE", "", "", "", "", "", round(avg_price, 4)])
    ws.append([])
    ws.append([f"Current Diesel price: ${cur_diesel}/L"])
    ws.append([f"Current Petrol price: ${cur_petrol}/L"])
    auto_width(ws)
    summary_data["FUEL"] = round(fuel_total_cost, 2)

    # ── Sheet 7: LABOUR ───────────────────────────────────────────────────────
    ws = wb.create_sheet("Labour")
    lb_rows = [r for r in get_helper_assignments(prod_id) if r.get("working_days")]
    by_group = OrderedDict()
    for r in lb_rows:
        g = r.get("function_group") or r.get("helper_group") or "GENERAL"
        by_group.setdefault(g, []).append(r)

    ws.append(["KLAS 7 - LABOUR BUDGET"])
    ws.cell(row=1, column=1).font = title_font
    ws.append([f"Generated: {dt.now().strftime('%Y-%m-%d %H:%M')}"])
    ws.append([])
    ws.append(["Group", "Function", "Worker", "Role", "Contact",
               "Start", "End", "Working Days", "Rate/day",
               "Total Estimate", "Total Actual"])
    style_header_row(ws, 11)
    grand_est = 0
    grand_act = 0
    for group_name, group_rows in by_group.items():
        group_est = 0
        group_act = 0
        for r in group_rows:
            est = r.get("amount_estimate") or 0
            act = r.get("amount_actual") or 0
            group_est += est
            group_act += act
            ws.append([
                group_name,
                r.get("function_name") or "",
                r.get("helper_name_override") or r.get("helper_name") or "",
                r.get("helper_role") or "",
                r.get("helper_contact") or "",
                r.get("start_date") or "", r.get("end_date") or "",
                r.get("working_days") or "",
                r.get("price_override") or r.get("helper_daily_rate_estimate") or "",
                est, act if act else "",
            ])
        ws.append(["", "", "", "", "", "", f"SUB-TOTAL {group_name}", "", "",
                   round(group_est, 2), round(group_act, 2) if group_act else ""])
        ws.cell(row=ws.max_row, column=10).font = subtotal_font
        ws.append([])
        grand_est += group_est
        grand_act += group_act
    ws.append(["", "", "", "", "", "", "GRAND TOTAL", "", "",
               round(grand_est, 2), round(grand_act, 2) if grand_act else ""])
    ws.cell(row=ws.max_row, column=10).font = green_font
    auto_width(ws)
    summary_data["LABOUR"] = round(grand_est, 2)

    # ── Sheet 8: GUARDS (merged Location + Base Camp) ───────────────────────
    ws = wb.create_sheet("Guards")
    ws.append(["KLAS 7 - GUARDS BUDGET"])
    ws.cell(row=1, column=1).font = title_font
    ws.append([f"Generated: {dt.now().strftime('%Y-%m-%d %H:%M')}"])
    ws.append([])

    # Part A: Location Guards (from guard_location_schedules)
    guard_loc_data = get_guard_location_schedules(prod_id)
    type_by_name = {s['name']: s.get('location_type', 'game') for s in loc_sites}
    loc_guard_by_loc = {}
    for gls in guard_loc_data:
        loc_name = gls['location_name']
        nb = gls.get('nb_guards', 2)
        loc_type = type_by_name.get(loc_name, 'game')
        loc_guard_by_loc.setdefault(loc_name, {'days': 0, 'total_guard_days': 0, 'cost': 0, 'type': loc_type})
        loc_guard_by_loc[loc_name]['days'] += 1
        loc_guard_by_loc[loc_name]['total_guard_days'] += nb
        loc_guard_by_loc[loc_name]['cost'] += nb * 45

    ws.append(["LOCATION GUARDS"])
    ws.cell(row=ws.max_row, column=1).font = subtotal_font
    ws.append(["Location", "Type", "Active Days", "Guard-Days", "Rate/Guard/Day ($)", "Total ($)"])
    style_header_row(ws, 6)
    gl_grand = 0
    for loc_name, info in sorted(loc_guard_by_loc.items()):
        ws.append([loc_name, info['type'], info['days'], info['total_guard_days'], 45, round(info['cost'], 2)])
        gl_grand += info['cost']
    ws.append([])
    ws.append(["", "", "", "", "SUB-TOTAL LOCATION", round(gl_grand, 2)])
    ws.cell(row=ws.max_row, column=6).font = subtotal_font
    ws.append([])

    # Part B: Base Camp Guards
    gc_rows = [r for r in get_guard_camp_assignments(prod_id) if r.get("working_days")]
    by_group = OrderedDict()
    for r in gc_rows:
        g = r.get("function_group") or r.get("helper_group") or "GENERAL"
        by_group.setdefault(g, []).append(r)

    ws.append(["BASE CAMP GUARDS"])
    ws.cell(row=ws.max_row, column=1).font = subtotal_font
    ws.append(["Group", "Function", "Guard", "Role", "Contact",
               "Start", "End", "Working Days", "Rate/day",
               "Total Estimate", "Total Actual"])
    style_header_row(ws, 11)
    gc_grand_est = 0
    gc_grand_act = 0
    for group_name, group_rows in by_group.items():
        group_est = 0
        group_act = 0
        for r in group_rows:
            est = r.get("amount_estimate") or 0
            act = r.get("amount_actual") or 0
            group_est += est
            group_act += act
            ws.append([
                group_name,
                r.get("function_name") or "",
                r.get("helper_name_override") or r.get("helper_name") or "",
                r.get("helper_role") or "",
                r.get("helper_contact") or "",
                r.get("start_date") or "", r.get("end_date") or "",
                r.get("working_days") or "",
                r.get("price_override") or r.get("helper_daily_rate_estimate") or "",
                est, act if act else "",
            ])
        ws.append(["", "", "", "", "", "", f"SUB-TOTAL {group_name}", "", "",
                   round(group_est, 2), round(group_act, 2) if group_act else ""])
        ws.cell(row=ws.max_row, column=10).font = subtotal_font
        ws.append([])
        gc_grand_est += group_est
        gc_grand_act += group_act
    ws.append(["", "", "", "", "", "", "SUB-TOTAL BASE CAMP", "", "",
               round(gc_grand_est, 2), round(gc_grand_act, 2) if gc_grand_act else ""])
    ws.cell(row=ws.max_row, column=10).font = subtotal_font
    ws.append([])
    total_guards = gl_grand + gc_grand_est
    ws.append(["", "", "", "", "", "", "GRAND TOTAL GUARDS", "", "",
               round(total_guards, 2), ""])
    ws.cell(row=ws.max_row, column=10).font = green_font
    auto_width(ws)
    summary_data["GUARDS"] = round(total_guards, 2)

    # ── Sheet 10: FNB ─────────────────────────────────────────────────────────
    ws = wb.create_sheet("FNB")
    fnb_budget = get_fnb_budget_data(prod_id)
    ws.append(["KLAS 7 - FNB BUDGET"])
    ws.cell(row=1, column=1).font = title_font
    ws.append([f"Generated: {dt.now().strftime('%Y-%m-%d %H:%M')}"])
    ws.append([])
    ws.append(["Category", "Up to Date ($)", "Estimate ($)", "Total ($)"])
    style_header_row(ws, 4)
    fnb_grand_utd = 0
    fnb_grand_est = 0
    for cat in fnb_budget.get('categories', []):
        utd = round(cat.get('consumption_total', 0), 2)
        est = round(cat.get('purchase_total', 0), 2)
        total = round(utd + est, 2)
        ws.append([cat['name'], utd, est, total])
        fnb_grand_utd += utd
        fnb_grand_est += est
    ws.append([])
    fnb_total = round(fnb_grand_utd + fnb_grand_est, 2)
    ws.append(["GRAND TOTAL", round(fnb_grand_utd, 2), round(fnb_grand_est, 2), fnb_total])
    ws.cell(row=ws.max_row, column=4).font = green_font
    ws.append([])
    balance = round(fnb_grand_est - fnb_grand_utd, 2)
    ws.append([f"Balance (Estimate - Up to Date): ${balance}"])
    auto_width(ws)
    summary_data["FNB"] = round(fnb_grand_est, 2)  # Use purchase (estimate) as budget total

    # ── Insert Summary sheet at position 0 ────────────────────────────────────
    ws_summary = wb.create_sheet("Summary", 0)
    ws_summary.append(["KLAS 7 - GLOBAL BUDGET SUMMARY"])
    ws_summary.cell(row=1, column=1).font = Font(bold=True, size=14)
    ws_summary.append([f"Generated: {dt.now().strftime('%Y-%m-%d %H:%M')}"])
    ws_summary.append([])
    ws_summary.append(["Category", "Total Estimate ($)"])
    style_header_row(ws_summary, 2)
    overall_total = 0
    for dept, total in summary_data.items():
        ws_summary.append([dept, total])
        ws_summary.cell(row=ws_summary.max_row, column=2).number_format = money_fmt_dec
        overall_total += total
    ws_summary.append([])
    ws_summary.append(["GRAND TOTAL", round(overall_total, 2)])
    ws_summary.cell(row=ws_summary.max_row, column=1).font = Font(bold=True, size=12)
    ws_summary.cell(row=ws_summary.max_row, column=2).font = Font(bold=True, size=12, color="22C55E")
    ws_summary.cell(row=ws_summary.max_row, column=2).number_format = money_fmt_dec
    auto_width(ws_summary)

    # Save to bytes
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    fname = f"KLAS7_BUDGET_{dt.now().strftime('%y%m%d')}.xlsx"
    return Response(
        output.getvalue(),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={fname}"}
    )


# ─── Bootstrap ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    init_db()
    from data_loader import bootstrap
    bootstrap()
    app.run(host="0.0.0.0", port=5002, debug=True)
