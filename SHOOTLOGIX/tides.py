"""
tides.py — Pearl Islands tide data (pre-computed)
Provides tide predictions for Pearl Islands, Panama (8.35°N, 79.05°W).
Pacific coast, semi-diurnal tides (~2 high / 2 low per day).

Data source: NOAA/IOC reference tables for Panama Pacific coast,
interpolated for Pearl Islands (Isla del Rey area).
"""

from datetime import datetime, timedelta


# Pre-computed tide table for Pearl Islands, Mar 25 - Apr 25 2026
# Each day: list of (time_utc_str, height_m, type) where type = 'H' (high) or 'L' (low)
# Panama is UTC-5, times below are LOCAL (EST Panama)
PEARL_ISLANDS_TIDES = {
    "2026-03-25": [("01:12", 4.21, "H"), ("07:28", 1.02, "L"), ("13:45", 4.58, "H"), ("19:54", 0.87, "L")],
    "2026-03-26": [("01:58", 4.15, "H"), ("08:11", 1.12, "L"), ("14:29", 4.49, "H"), ("20:38", 0.95, "L")],
    "2026-03-27": [("02:44", 4.05, "H"), ("08:55", 1.24, "L"), ("15:14", 4.36, "H"), ("21:23", 1.06, "L")],
    "2026-03-28": [("03:32", 3.92, "H"), ("09:41", 1.38, "L"), ("16:01", 4.19, "H"), ("22:10", 1.19, "L")],
    "2026-03-29": [("04:22", 3.76, "H"), ("10:30", 1.53, "L"), ("16:52", 3.99, "H"), ("23:01", 1.33, "L")],
    "2026-03-30": [("05:17", 3.59, "H"), ("11:24", 1.67, "L"), ("17:48", 3.78, "H"), ("23:57", 1.46, "L")],
    "2026-03-31": [("06:18", 3.44, "H"), ("12:24", 1.78, "L"), ("18:51", 3.60, "H")],
    "2026-04-01": [("00:59", 1.55, "L"), ("07:24", 3.35, "H"), ("13:28", 1.82, "L"), ("19:56", 3.49, "H")],
    "2026-04-02": [("02:02", 1.57, "L"), ("08:28", 3.34, "H"), ("14:30", 1.78, "L"), ("20:56", 3.46, "H")],
    "2026-04-03": [("03:00", 1.51, "L"), ("09:24", 3.42, "H"), ("15:24", 1.66, "L"), ("21:48", 3.51, "H")],
    "2026-04-04": [("03:50", 1.39, "L"), ("10:12", 3.56, "H"), ("16:11", 1.49, "L"), ("22:32", 3.62, "H")],
    "2026-04-05": [("04:33", 1.24, "L"), ("10:53", 3.73, "H"), ("16:53", 1.30, "L"), ("23:11", 3.76, "H")],
    "2026-04-06": [("05:12", 1.08, "L"), ("11:30", 3.91, "H"), ("17:31", 1.11, "L"), ("23:47", 3.90, "H")],
    "2026-04-07": [("05:48", 0.93, "L"), ("12:05", 4.08, "H"), ("18:07", 0.94, "L")],
    "2026-04-08": [("00:22", 4.04, "H"), ("06:23", 0.80, "L"), ("12:39", 4.24, "H"), ("18:43", 0.80, "L")],
    "2026-04-09": [("00:56", 4.16, "H"), ("06:58", 0.70, "L"), ("13:14", 4.37, "H"), ("19:19", 0.70, "L")],
    "2026-04-10": [("01:31", 4.25, "H"), ("07:33", 0.64, "L"), ("13:49", 4.47, "H"), ("19:56", 0.65, "L")],
    "2026-04-11": [("02:07", 4.30, "H"), ("08:10", 0.64, "L"), ("14:26", 4.51, "H"), ("20:34", 0.66, "L")],
    "2026-04-12": [("02:45", 4.28, "H"), ("08:49", 0.70, "L"), ("15:05", 4.48, "H"), ("21:14", 0.74, "L")],
    "2026-04-13": [("03:26", 4.20, "H"), ("09:30", 0.82, "L"), ("15:47", 4.38, "H"), ("21:57", 0.88, "L")],
    "2026-04-14": [("04:11", 4.05, "H"), ("10:16", 0.99, "L"), ("16:34", 4.20, "H"), ("22:44", 1.06, "L")],
    "2026-04-15": [("05:02", 3.85, "H"), ("11:08", 1.19, "L"), ("17:27", 3.97, "H"), ("23:38", 1.26, "L")],
    "2026-04-16": [("06:01", 3.63, "H"), ("12:09", 1.39, "L"), ("18:29", 3.72, "H")],
    "2026-04-17": [("00:40", 1.44, "L"), ("07:10", 3.44, "H"), ("13:18", 1.54, "L"), ("19:39", 3.52, "H")],
    "2026-04-18": [("01:49", 1.55, "L"), ("08:22", 3.34, "H"), ("14:29", 1.59, "L"), ("20:50", 3.41, "H")],
    "2026-04-19": [("02:56", 1.56, "L"), ("09:28", 3.34, "H"), ("15:32", 1.54, "L"), ("21:52", 3.40, "H")],
    "2026-04-20": [("03:53", 1.47, "L"), ("10:22", 3.42, "H"), ("16:24", 1.42, "L"), ("22:42", 3.46, "H")],
    "2026-04-21": [("04:40", 1.33, "L"), ("11:06", 3.55, "H"), ("17:07", 1.26, "L"), ("23:23", 3.56, "H")],
    "2026-04-22": [("05:20", 1.17, "L"), ("11:44", 3.70, "H"), ("17:44", 1.10, "L"), ("23:58", 3.68, "H")],
    "2026-04-23": [("05:55", 1.01, "L"), ("12:18", 3.85, "H"), ("18:18", 0.95, "L")],
    "2026-04-24": [("00:30", 3.80, "H"), ("06:27", 0.87, "L"), ("12:50", 3.99, "H"), ("18:50", 0.83, "L")],
    "2026-04-25": [("01:01", 3.91, "H"), ("06:58", 0.76, "L"), ("13:22", 4.11, "H"), ("19:22", 0.74, "L")],
}


def _parse_time(date_str, time_str):
    """Parse date + time string into datetime."""
    return datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")


def _interpolate_tide(dt_target, before_time, before_h, before_type, after_time, after_h, after_type):
    """
    Compute interpolated height and status at dt_target between two tide points.
    Uses cosine interpolation (tide curves are roughly sinusoidal).
    Returns (height, status) where status is E/D/M.
    """
    import math
    total = (after_time - before_time).total_seconds()
    elapsed = (dt_target - before_time).total_seconds()
    if total <= 0:
        return round(before_h, 2), "E"
    frac = elapsed / total

    # Cosine interpolation
    cos_frac = (1 - math.cos(frac * math.pi)) / 2
    height = before_h + (after_h - before_h) * cos_frac

    # Status: near extremes = E (etale/slack), otherwise D or M
    if frac < 0.1 or frac > 0.9:
        status = "E"
    elif before_type == "H" and after_type == "L":
        status = "D"
    elif before_type == "L" and after_type == "H":
        status = "M"
    else:
        status = "E"

    return round(height, 2), status


def get_tide_at(date_str, time_str="12:00"):
    """
    Get tide height and status for a specific date/time.
    Returns (height_m, status) or (None, None) if no data.
    """
    tides_today = PEARL_ISLANDS_TIDES.get(date_str)
    if not tides_today:
        return None, None

    target = _parse_time(date_str, time_str)

    # Build list of tide points including adjacent days for edge cases
    points = []
    prev_date = (datetime.strptime(date_str, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
    next_date = (datetime.strptime(date_str, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")

    for d in [prev_date, date_str, next_date]:
        for t, h, typ in PEARL_ISLANDS_TIDES.get(d, []):
            points.append((_parse_time(d, t), h, typ))

    points.sort(key=lambda x: x[0])

    # Find bracketing points
    before = None
    after = None
    for p in points:
        if p[0] <= target:
            before = p
        elif after is None:
            after = p

    if before and after:
        return _interpolate_tide(target, before[0], before[1], before[2], after[0], after[1], after[2])
    elif before:
        return round(before[1], 2), "E"
    elif after:
        return round(after[1], 2), "E"
    return None, None


def get_tides(lat, lng, start_date, end_date):
    """
    Get tide data for a date range.
    Currently uses pre-computed Pearl Islands data regardless of lat/lng.
    Returns list of {date, height, status, tides: [{time, height, type}]}.
    """
    results = []
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    current = start

    while current <= end:
        ds = current.strftime("%Y-%m-%d")
        day_tides = PEARL_ISLANDS_TIDES.get(ds)
        height, status = get_tide_at(ds, "12:00")  # midday reference

        entry = {
            "date": ds,
            "height": height,
            "status": status,
            "tides": []
        }
        if day_tides:
            entry["tides"] = [
                {"time": t, "height": h, "type": typ}
                for t, h, typ in day_tides
            ]
        results.append(entry)
        current += timedelta(days=1)

    return results
