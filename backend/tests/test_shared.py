import base64
import copy
import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi.testclient import TestClient

from app.core import shared_auth
from app.main import app, settings
from app.services import shared_store

CODE = "test-only-shared-code-1234567890"
URL = "/api/shared/cases"
AUTH = {"Authorization": "Basic " + base64.b64encode(f"nrgi:{CODE}".encode()).decode()}


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "shared_access_code", CODE)
    monkeypatch.setattr(settings, "shared_database_path", str(tmp_path / "shared.sqlite3"))
    monkeypatch.setattr(shared_auth, "login_limiter", shared_auth.LoginFailureLimiter())
    with TestClient(app) as client:
        yield client


@pytest.fixture
def payload():
    return {
        "expected_revision": 0,
        "file_name": "synthetic.xlsx",
        "data": {
            "meta": {
                "fetched_at": "2026-09-11T10:00:00Z", "data_source": "local",
                "total_rows": 1, "resolved_count": 0, "unresolved_count": 1,
                "error_count": 0, "warning_count": 1,
            },
            "cases": [{
                "id": "excel-row-2", "department": "Bygninger Vest",
                "address_raw": "Fiktiv adresse", "source_row": 2, "geocode_status": "afventer",
                "status": "delvist_faerdig", "invoiced": False,
            }],
            "issues": [{"row_number": 2, "severity": "advarsel", "message": "Fiktiv test"}],
        },
    }


@pytest.mark.parametrize("code", ["", "short", " " * 30])
def test_auth_fails_closed(client, monkeypatch, code):
    monkeypatch.setattr(settings, "shared_access_code", code)
    for method in ("get", "put"):
        response = getattr(client, method)(URL, headers=AUTH)
        assert response.status_code == 503
        assert "no-store" in response.headers["cache-control"]


@pytest.mark.parametrize("header", [
    "", "Bearer token", "Basic !!!", "Basic bm8tY29sb24=", "Basic /w==",
    "Basic " + base64.b64encode(b"other:" + CODE.encode()).decode(),
    "Basic " + base64.b64encode(b"nrgi:incorrect").decode(),
])
def test_missing_wrong_malformed_auth(client, header):
    for method in ("get", "put"):
        response = getattr(client, method)(URL, headers={"Authorization": header})
        assert response.status_code == 401
        assert response.headers["www-authenticate"].startswith("Basic ")


def test_unicode_basic_access_code(client, monkeypatch):
    code = "fiktiv-kode-med-æøå-1234567890"
    monkeypatch.setattr(settings, "shared_access_code", code)
    header = "Basic " + base64.b64encode(f"nrgi:{code}".encode()).decode()
    assert client.get(URL, headers={"Authorization": header}).status_code == 200


def test_failure_limiter_ignores_forwarded_headers_and_expires(client, monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(shared_auth.time, "monotonic", lambda: clock[0])
    for index in range(10):
        assert client.get(URL, headers={"X-Forwarded-For": f"192.0.2.{index}"}).status_code == 401
    limited = client.get(URL, headers=AUTH)
    assert limited.status_code == 429
    assert limited.headers["retry-after"] == "300"
    clock[0] += 301
    assert client.get(URL, headers=AUTH).status_code == 200


def test_limiter_memory_is_bounded():
    limiter = shared_auth.LoginFailureLimiter(max_clients=2)
    for client in ("one", "two", "three"):
        limiter.record_failure(client)
    assert len(limiter.failures) == 2
    assert limiter.limited("three")


def test_empty_store_never_uses_demo(client):
    response = client.get(URL, headers=AUTH)
    assert response.status_code == 200
    assert response.json() == {
        "revision": 0, "file_name": None, "uploaded_at": None, "data": None,
    }
    assert response.headers["cache-control"] == "no-store"


def test_save_reload_replace_and_conflict(client, payload):
    saved = client.put(URL, headers=AUTH, json=payload)
    assert saved.status_code == 200
    first = saved.json()
    assert first["revision"] == 1
    assert first["uploaded_at"].endswith(("Z", "+00:00"))
    assert first["data"]["meta"]["fetched_at"] == first["uploaded_at"]
    assert "latitude" not in first["data"]["cases"][0]
    assert "template_rows_skipped" not in first["data"]["meta"]
    with TestClient(app) as colleague:
        assert colleague.get(URL, headers=AUTH).json() == first
    assert client.put(URL, headers=AUTH, json=payload).status_code == 409
    assert client.get(URL, headers=AUTH).json() == first
    payload["expected_revision"] = 1
    payload["file_name"] = "replacement.xlsx"
    assert client.put(URL, headers=AUTH, json=payload).json()["revision"] == 2
    with sqlite3.connect(settings.shared_database_path) as database:
        assert database.execute("SELECT COUNT(*) FROM shared_snapshot").fetchone()[0] == 1


@pytest.mark.parametrize("initial", [False, True])
def test_concurrent_writes_are_compare_and_swap(client, payload, initial):
    if initial:
        assert client.put(URL, headers=AUTH, json=payload).status_code == 200
        payload["expected_revision"] = 1
    barrier = Barrier(2)

    def upload(_):
        with TestClient(app) as colleague:
            barrier.wait()
            return colleague.put(URL, headers=AUTH, json=payload).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(upload, range(2))) == [200, 409]
    assert client.get(URL, headers=AUTH).json()["revision"] == (2 if initial else 1)


@pytest.mark.parametrize("department", ["Bygninger", "  BYGNINGER\tØst ", "Bygninger-Vest"])
def test_department_normalization(client, payload, department):
    payload["data"]["cases"][0]["department"] = department
    assert client.put(URL, headers=AUTH, json=payload).status_code == 200


@pytest.mark.parametrize("kind", [
    "outscope", "prefix", "missing_department", "contact", "raw_workbook", "meta_contact",
    "issue_contact", "negative_revision", "bool_revision", "too_many_cases", "nan",
    "latitude_range", "longitude_range", "counter", "issue_row", "duplicate",
    "bad_status", "bad_source", "bad_datetime", "numeric_datetime", "epoch_string", "long_filename",
    "bad_issue_count", "bad_total_count", "string_row", "bool_row",
])
def test_invalid_data_preserves_existing_snapshot(client, payload, kind):
    first = client.put(URL, headers=AUTH, json=payload).json()
    invalid = copy.deepcopy(payload)
    invalid["expected_revision"] = 1
    data = invalid["data"]
    case = data["cases"][0]
    if kind == "outscope":
        case["department"] = "Industri"
    elif kind == "prefix":
        case["department"] = "BygningerExtra"
    elif kind == "missing_department":
        del case["department"]
    elif kind == "contact":
        case["email"] = "synthetic@example.invalid"
    elif kind == "raw_workbook":
        invalid["workbook"] = "raw"
    elif kind == "meta_contact":
        data["meta"]["phone"] = "not-allowed"
    elif kind == "issue_contact":
        data["issues"][0]["contact"] = "not-allowed"
    elif kind == "negative_revision":
        invalid["expected_revision"] = -1
    elif kind == "bool_revision":
        invalid["expected_revision"] = True
    elif kind == "too_many_cases":
        data["cases"] = [case] * 5001
    elif kind == "nan":
        case["latitude"] = float("nan")
    elif kind == "latitude_range":
        case["latitude"] = 91
    elif kind == "longitude_range":
        case["longitude"] = -181
    elif kind == "counter":
        data["meta"]["resolved_count"] = 1
    elif kind == "issue_row":
        data["issues"][0]["row_number"] = 500
    elif kind == "duplicate":
        data["cases"].append(case)
    elif kind == "bad_status":
        case["status"] = "unknown"
    elif kind == "bad_source":
        data["meta"]["data_source"] = "graph"
    elif kind == "bad_datetime":
        data["meta"]["fetched_at"] = "not-a-date"
    elif kind == "numeric_datetime":
        data["meta"]["fetched_at"] = 12345
    elif kind == "epoch_string":
        data["meta"]["fetched_at"] = "12345"
    elif kind == "long_filename":
        invalid["file_name"] = "x" * 256
    elif kind == "bad_issue_count":
        data["meta"]["warning_count"] = 2
    elif kind == "bad_total_count":
        data["meta"]["total_rows"] = 4
    elif kind == "string_row":
        case["source_row"] = "2"
    elif kind == "bool_row":
        case["source_row"] = True
    response = client.put(
        URL, headers={**AUTH, "Content-Type": "application/json"}, content=json.dumps(invalid),
    )
    assert response.status_code == 422
    assert "synthetic@example.invalid" not in response.text
    assert client.get(URL, headers=AUTH).json() == first


def test_body_limit_with_and_without_content_length(client, payload):
    first = client.put(URL, headers=AUTH, json=payload).json()
    body = b" " * (shared_store.MAX_JSON_BYTES + 1)
    for content in (body, iter([body[:5000], body[5000:]])):
        response = client.put(
            URL, headers={**AUTH, "Content-Type": "application/json"}, content=content,
        )
        assert response.status_code == 413
    assert client.get(URL, headers=AUTH).json() == first


@pytest.mark.parametrize("body,headers", [
    (b"{", {"Content-Type": "application/json"}),
    (b"{}", {"Content-Type": "text/plain"}),
    (b"{}", {"Content-Type": "application/json", "Content-Encoding": "gzip"}),
])
def test_invalid_json_or_media(client, body, headers):
    assert client.put(URL, headers={**AUTH, **headers}, content=body).status_code == 422


@pytest.mark.parametrize("path", ["", ":memory:", "file:memory?mode=memory"])
def test_unconfigured_storage(client, monkeypatch, payload, path):
    monkeypatch.setattr(settings, "shared_database_path", path)
    assert client.get(URL, headers=AUTH).status_code == 503
    assert client.put(URL, headers=AUTH, json=payload).status_code == 503


def test_unavailable_storage_sanitizes_logs(client, monkeypatch, tmp_path, caplog):
    path = str(tmp_path / "private-sensitive-path" / "shared.sqlite3")
    monkeypatch.setattr(settings, "shared_database_path", path)
    response = client.get(URL, headers=AUTH)
    assert response.status_code == 503
    assert path not in response.text
    assert "private-sensitive-path" not in caplog.text
    assert "OperationalError" in caplog.text


def test_write_failure_rolls_back_and_preserves_previous(client, payload, monkeypatch, caplog):
    first = client.put(URL, headers=AUTH, json=payload).json()
    connect = sqlite3.connect

    class FailingCommit(sqlite3.Connection):
        def commit(self):
            raise sqlite3.OperationalError("sensitive diagnostic must not leak")

    with monkeypatch.context() as patch:
        patch.setattr(
            shared_store.sqlite3, "connect",
            lambda *args, **kwargs: connect(*args, **kwargs, factory=FailingCommit),
        )
        payload["expected_revision"] = 1
        payload["file_name"] = "failed-replacement.xlsx"
        response = client.put(URL, headers=AUTH, json=payload)
        assert response.status_code == 503
        assert "sensitive" not in response.text
        assert "sensitive diagnostic" not in caplog.text
    assert client.get(URL, headers=AUTH).json() == first


def test_cors_preflight_and_no_cross_origin_wildcard(client):
    response = client.options(URL, headers={
        "Origin": "http://localhost:5173", "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "PUT" in response.headers["access-control-allow-methods"]
    response = client.options(URL, headers={
        "Origin": "https://untrusted.example", "Access-Control-Request-Method": "PUT",
    })
    assert "access-control-allow-origin" not in response.headers


def test_shared_snapshot_is_not_exposed_by_demo_route(client, payload, monkeypatch):
    monkeypatch.setattr(settings, "data_source", "demo")
    payload["data"]["cases"][0]["customer_name"] = "SYNTHETIC_SHARED_ONLY_MARKER"
    assert client.put(URL, headers=AUTH, json=payload).status_code == 200
    response = client.get("/api/cases")
    assert response.status_code == 200
    assert response.json()["meta"]["data_source"] == "demo"
    assert "SYNTHETIC_SHARED_ONLY_MARKER" not in response.text
