from fastapi.testclient import TestClient

from app.main import app, settings


def test_demo_api_is_runnable_without_sharepoint(monkeypatch):
    monkeypatch.setattr(settings, "data_source", "demo")
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["data_source"] == "demo"
        response = client.get("/api/cases")
        assert response.status_code == 200
        data = response.json()
        assert data["meta"]["data_source"] == "demo"
        assert len(data["cases"]) == 5
        assert data["meta"]["unresolved_count"] == 1
