"""Security tests for /api/documents/download/<filepath>.

Covers:
- Path traversal is rejected (403) instead of leaking files outside data/documents/.
- Non-existent files return 404.
- Legit files inside data/documents/<prod_id>/ are served successfully.
"""
import os

import pytest


APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS_DIR = os.path.join(APP_DIR, "data", "documents")


@pytest.fixture(scope="module")
def seeded_doc(prod_id):
    """Create a small legit file under data/documents/<prod_id>/ so we can
    assert that valid downloads still work. Cleans up after the test module."""
    target_dir = os.path.join(DOCS_DIR, str(prod_id))
    os.makedirs(target_dir, exist_ok=True)
    path = os.path.join(target_dir, "sec_test_doc.txt")
    with open(path, "wb") as f:
        f.write(b"legit content")
    yield f"data/documents/{prod_id}/sec_test_doc.txt"
    try:
        os.remove(path)
    except OSError:
        pass


def test_path_traversal_rejected(client, auth_headers):
    """Traversal attempts must not leak files outside data/documents/."""
    # A file that definitely exists on disk but is outside data/documents/.
    resp = client.get(
        "/api/documents/download/../app.py",
        headers=auth_headers,
    )
    # Must NOT return the contents of app.py.
    assert resp.status_code in (403, 404)
    assert b"Flask" not in resp.data


def test_deep_traversal_rejected(client, auth_headers):
    """Traversal that escapes via multiple ../ segments must be rejected."""
    resp = client.get(
        "/api/documents/download/../../../../etc/passwd",
        headers=auth_headers,
        follow_redirects=True,
    )
    assert resp.status_code in (403, 404)
    assert b"root:" not in resp.data


def test_traversal_from_inside_docs_rejected(client, auth_headers, prod_id):
    """Traversal that starts from inside data/documents/ must also be rejected."""
    resp = client.get(
        f"/api/documents/download/data/documents/{prod_id}/../../../app.py",
        headers=auth_headers,
        follow_redirects=True,
    )
    assert resp.status_code in (403, 404)
    assert b"from flask import" not in resp.data


def test_missing_file_returns_404(client, auth_headers, prod_id):
    """A well-formed path to a non-existent file returns 404."""
    resp = client.get(
        f"/api/documents/download/data/documents/{prod_id}/does_not_exist.pdf",
        headers=auth_headers,
    )
    assert resp.status_code == 404


def test_legit_download_succeeds(client, auth_headers, seeded_doc):
    """Files inside data/documents/<prod_id>/ are served as before."""
    resp = client.get(
        f"/api/documents/download/{seeded_doc}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.data == b"legit content"


def test_unauthenticated_download_rejected(client):
    """Download endpoint still requires authentication."""
    resp = client.get("/api/documents/download/data/documents/1/anything.pdf")
    assert resp.status_code == 401
