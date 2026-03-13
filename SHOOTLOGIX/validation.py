"""
validation.py — ShootLogix
Server-side validation for all incoming data.
"""
import re
import sqlite3
import json
from datetime import datetime


class ValidationError(Exception):
    """Raised when validation fails. Contains a dict of field -> message."""
    def __init__(self, errors):
        if isinstance(errors, str):
            errors = {"_general": errors}
        self.errors = errors
        super().__init__(str(errors))


def validate_required(data, fields):
    """Check that all required fields are present and non-empty."""
    errors = {}
    for f in fields:
        val = data.get(f)
        if val is None or (isinstance(val, str) and not val.strip()):
            errors[f] = f"{f} is required"
    if errors:
        raise ValidationError(errors)


def validate_iso_date(value, field_name="date"):
    """Validate ISO date format YYYY-MM-DD. Returns parsed date or raises."""
    if not value:
        raise ValidationError({field_name: f"{field_name} is required"})
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise ValidationError({field_name: f"{field_name} must be a valid date (YYYY-MM-DD)"})


def validate_date_range(start, end, start_field="start_date", end_field="end_date"):
    """Validate that start <= end. Both must be ISO dates."""
    if not start or not end:
        return  # optional range, skip if either is missing
    d_start = validate_iso_date(start, start_field)
    d_end = validate_iso_date(end, end_field)
    if d_start > d_end:
        raise ValidationError({end_field: f"{end_field} must be on or after {start_field}"})


def validate_positive_number(value, field_name, allow_zero=True):
    """Validate that a numeric value is positive (or zero if allowed)."""
    if value is None or value == "" or value == "":
        return None  # field is optional
    try:
        num = float(value)
    except (ValueError, TypeError):
        raise ValidationError({field_name: f"{field_name} must be a number"})
    if allow_zero and num < 0:
        raise ValidationError({field_name: f"{field_name} must be >= 0"})
    if not allow_zero and num <= 0:
        raise ValidationError({field_name: f"{field_name} must be > 0"})
    return num


def validate_enum(value, allowed, field_name):
    """Validate that value is one of the allowed options."""
    if value is not None and value not in allowed:
        raise ValidationError({field_name: f"{field_name} must be one of: {', '.join(str(a) for a in allowed)}"})


def validate_assignment(data):
    """Validate a boat/picture/security/transport assignment."""
    errors = {}
    # Date range
    start = data.get("start_date")
    end = data.get("end_date")
    if start and end:
        try:
            validate_date_range(start, end)
        except ValidationError as e:
            errors.update(e.errors)

    # Rates must be positive
    for field in ("daily_rate_estimate", "daily_rate_actual", "price_override",
                  "amount_estimate", "amount_actual"):
        val = data.get(field)
        if val is not None and val != "" and val != 0:
            try:
                validate_positive_number(val, field)
            except ValidationError as e:
                errors.update(e.errors)

    # Status enum
    status = data.get("assignment_status")
    if status is not None:
        try:
            validate_enum(status, ("confirmed", "pending", "cancelled", "tentative"), "assignment_status")
        except ValidationError as e:
            errors.update(e.errors)

    if errors:
        raise ValidationError(errors)


def validate_assignment_dates(start_date, end_date, prod_start, prod_end):
    """Validate that assignment dates are within the production date range.
    start_date, end_date: assignment dates (ISO strings)
    prod_start, prod_end: production dates (ISO strings)
    All checks are skipped if any date is missing.
    """
    if not start_date or not end_date:
        return
    if start_date > end_date:
        raise ValidationError({"end_date": "End date must be after start date"})
    if prod_start and start_date < prod_start:
        raise ValidationError({"start_date": "Start date is before production start"})
    if prod_end and end_date > prod_end:
        raise ValidationError({"end_date": "End date is after production end"})


def validate_fuel_entry(data):
    """Validate a fuel entry."""
    errors = {}

    # Date required
    if not data.get("date"):
        errors["date"] = "date is required"
    else:
        try:
            validate_iso_date(data["date"], "date")
        except ValidationError as e:
            errors.update(e.errors)

    # Liters must be positive
    liters = data.get("liters")
    if liters is not None:
        try:
            validate_positive_number(liters, "liters", allow_zero=False)
        except ValidationError as e:
            errors.update(e.errors)

    # Fuel type enum
    fuel_type = data.get("fuel_type")
    if fuel_type:
        try:
            validate_enum(fuel_type, ("DIESEL", "PETROL"), "fuel_type")
        except ValidationError as e:
            errors.update(e.errors)

    if errors:
        raise ValidationError(errors)


def validate_shooting_day(data):
    """Validate a shooting day."""
    errors = {}
    if data.get("date"):
        try:
            validate_iso_date(data["date"], "date")
        except ValidationError as e:
            errors.update(e.errors)

    day_number = data.get("day_number")
    if day_number is not None:
        try:
            n = int(day_number)
            if n < 0:
                errors["day_number"] = "day_number must be >= 0"
        except (ValueError, TypeError):
            errors["day_number"] = "day_number must be an integer"

    if errors:
        raise ValidationError(errors)


def validate_assignment_overlap(table_name, entity_col, entity_id, start_date, end_date, exclude_id=None):
    """Check that an entity (boat, vehicle, helper) is not double-booked on overlapping dates.
    table_name: e.g. 'boat_assignments'
    entity_col: e.g. 'boat_id'
    entity_id: the ID of the entity being assigned
    start_date, end_date: date range of the new/updated assignment
    exclude_id: assignment ID to exclude (for updates)
    """
    if not entity_id or not start_date or not end_date:
        return
    from database import get_db
    with get_db() as conn:
        query = f"""SELECT id, start_date, end_date FROM {table_name}
                    WHERE {entity_col} = ? AND assignment_status != 'cancelled'
                    AND start_date <= ? AND end_date >= ?"""
        params = [entity_id, end_date, start_date]
        if exclude_id:
            query += " AND id != ?"
            params.append(exclude_id)
        conflicts = conn.execute(query, params).fetchall()
        if conflicts:
            raise ValidationError({
                "date_overlap": f"This entity is already assigned during {start_date} - {end_date} (conflicts with assignment(s): {', '.join(str(c['id']) for c in conflicts)})"
            })


def validate_required_fields(data, fields):
    """Check that all specified fields are present and non-empty in data dict.
    fields: list of field names (strings).
    Returns None on success, raises ValidationError with all missing fields."""
    errors = {}
    for f in fields:
        val = data.get(f)
        if val is None or (isinstance(val, str) and not val.strip()):
            errors[f] = f"{f} is required"
    if errors:
        raise ValidationError(errors)


def validate_numeric_fields(data, fields, allow_zero=True):
    """Validate that specified fields, if present, are valid numbers.
    Skips fields that are None or empty string (treated as optional).
    Raises ValidationError if any field is not a valid number."""
    errors = {}
    for f in fields:
        val = data.get(f)
        if val is None or val == "":
            continue
        try:
            num = float(val)
            if allow_zero and num < 0:
                errors[f] = f"{f} must be >= 0"
            elif not allow_zero and num <= 0:
                errors[f] = f"{f} must be > 0"
        except (ValueError, TypeError):
            errors[f] = f"{f} must be a number"
    if errors:
        raise ValidationError(errors)


def validate_entity_name(data, field="name"):
    """If 'name' (or specified field) is present in data, ensure it's not empty."""
    val = data.get(field)
    if val is not None and (not isinstance(val, str) or not val.strip()):
        raise ValidationError({field: f"{field} cannot be empty"})


def validate_guard_schedule(data):
    """Validate guard schedule entry."""
    errors = {}
    if data.get("date"):
        try:
            validate_iso_date(data["date"], "date")
        except ValidationError as e:
            errors.update(e.errors)

    nb_guards = data.get("nb_guards")
    if nb_guards is not None:
        try:
            n = int(nb_guards)
            if n < 0:
                errors["nb_guards"] = "nb_guards must be >= 0"
        except (ValueError, TypeError):
            errors["nb_guards"] = "nb_guards must be an integer"

    if errors:
        raise ValidationError(errors)
