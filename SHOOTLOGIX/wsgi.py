"""
wsgi.py -- Production entry point for gunicorn.

When gunicorn imports this module, it triggers database initialization,
auth migrations, data seeding, and photo matching -- the same bootstrap
sequence that runs under `if __name__ == "__main__"` in app.py.

Usage (Procfile):
    web: gunicorn wsgi:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120
"""
import os

# Ensure working directory is the SHOOTLOGIX folder so relative paths resolve.
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# ---- Persistent uploads via symlink (Railway / production) ----
# If UPLOAD_DIR is set (e.g. /data/uploads), create a symlink from
# static/uploads -> $UPLOAD_DIR so that all upload routes write to the
# persistent volume without any code changes.
_upload_dir = os.environ.get("UPLOAD_DIR")
if _upload_dir:
    _link = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "uploads")
    os.makedirs(_upload_dir, exist_ok=True)
    # Remove existing uploads dir/link if present, replace with symlink
    if os.path.islink(_link):
        os.unlink(_link)
    elif os.path.isdir(_link):
        # Move any existing uploads into the persistent dir before symlinking
        import shutil
        for item in os.listdir(_link):
            src = os.path.join(_link, item)
            dst = os.path.join(_upload_dir, item)
            if not os.path.exists(dst):
                shutil.move(src, dst)
        os.rmdir(_link)
    os.symlink(_upload_dir, _link)
    print(f"Uploads symlinked: {_link} -> {_upload_dir}")

from app import app
from database import init_db

# ---- Bootstrap (runs once when gunicorn master loads the module) ----
init_db()

from auth.models import migrate_auth_tables
migrate_auth_tables()

from data_loader import bootstrap
bootstrap()

from auth.seed import seed_auth_data
seed_auth_data()

# Photo matching is best-effort; skip if BATEAUX folder is not present (e.g. Railway).
try:
    from app import _ensure_boat_images_symlink, _auto_match_boat_photos
    _ensure_boat_images_symlink()
    n = _auto_match_boat_photos()
    if n:
        print(f"Auto-matched {n} boat photo(s)")
except Exception as e:
    print(f"Skipping boat photo auto-match: {e}")
