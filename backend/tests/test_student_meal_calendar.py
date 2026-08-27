import pytest
from types import SimpleNamespace
from httpx import ASGITransport, AsyncClient

import backend.server as server


class _MockCursor:
    def __init__(self, records):
        self.records = records

    async def to_list(self, _limit=1000):
        return [dict(r) for r in self.records]


class _MockCollection:
    def __init__(self, records=None):
        self.records = list(records or [])

    async def find_one(self, query, projection=None):
        for r in self.records:
            match = True
            for k, v in query.items():
                if r.get(k) != v:
                    match = False
                    break
            if match:
                res = dict(r)
                if projection:
                    for p, val in projection.items():
                        if val == 0 and p in res:
                            del res[p]
                return res
        return None

    def find(self, query, projection=None):
        matched = []
        for r in self.records:
            match = True
            for k, v in query.items():
                if isinstance(v, dict) and "$in" in v:
                    if r.get(k) not in v["$in"]:
                        match = False
                        break
                elif isinstance(v, dict) and ("$lte" in v or "$gte" in v):
                    # basic range check for dates
                    val = r.get(k, "")
                    if "$lte" in v and val > v["$lte"]:
                        match = False
                        break
                    if "$gte" in v and val < v["$gte"]:
                        match = False
                        break
                elif r.get(k) != v:
                    match = False
                    break
            if match:
                res = dict(r)
                if projection:
                    for p, val in projection.items():
                        if val == 0 and p in res:
                            del res[p]
                matched.append(res)
        return _MockCursor(matched)


@pytest.mark.asyncio
async def test_compute_student_meal_calendar(monkeypatch):
    worker_doc = {
        "id": "w_test1",
        "name": "Gourav",
        "business_id": "biz_test1",
        "joining_date": "2026-08-01",
        "lunch_start_date": "2026-08-01",
        "dinner_start_date": "2026-08-01",
        "meal_plan_type": "BOTH",
        "total_quota": 60,
        "password_hash": "secret_hash",
    }
    selections = [
        {"business_id": "biz_test1", "worker_id": "w_test1", "date": "2026-08-05", "meal_slot": "lunch", "selection_type": "VEG"},
        {"business_id": "biz_test1", "worker_id": "w_test1", "date": "2026-08-06", "meal_slot": "dinner", "selection_type": "CANCELLED", "action": "CANCEL"},
    ]
    leaves = [
        {"business_id": "biz_test1", "worker_id": "w_test1", "status": "ACTIVE", "start_date": "2026-08-10", "end_date": "2026-08-12"},
    ]

    mock_db = SimpleNamespace(
        workers=_MockCollection([worker_doc]),
        meal_selections=_MockCollection(selections),
        worker_leaves=_MockCollection(leaves),
        meal_settings=_MockCollection([]),
        attendance=_MockCollection([]),
    )
    monkeypatch.setattr(server, "db", mock_db)

    # Test direct computation
    res = await server.compute_student_meal_calendar("biz_test1", "w_test1", "2026-08")
    assert res["month"] == "2026-08"
    assert len(res["days"]) == 31
    assert res["summary"]["total_quota"] == 60
    assert "worker" in res
    assert "password_hash" not in res["worker"]
    assert res["worker"]["name"] == "Gourav"


@pytest.mark.asyncio
async def test_student_meal_calendar_endpoint(monkeypatch):
    worker_doc = {
        "id": "w_gourav",
        "name": "Gourav",
        "business_id": "biz_1",
        "joining_date": "2026-08-01",
        "meal_plan_type": "BOTH",
        "total_quota": 60,
        "portal_enabled": True,
        "password_hash": "somehash",
    }

    mock_db = SimpleNamespace(
        workers=_MockCollection([worker_doc]),
        meal_selections=_MockCollection([]),
        worker_leaves=_MockCollection([]),
        meal_settings=_MockCollection([]),
        attendance=_MockCollection([]),
    )
    monkeypatch.setattr(server, "db", mock_db)

    async def _mock_worker():
        return {"worker_id": "w_gourav", "business_id": "biz_1", "id": "w_gourav"}

    server.app.dependency_overrides[server.get_current_worker] = _mock_worker

    async with AsyncClient(
        transport=ASGITransport(app=server.app),
        base_url="http://test",
    ) as ac:
        res = await ac.get("/api/worker/meal-calendar?month=2026-08")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["month"] == "2026-08"
        assert len(data["days"]) == 31
        assert data["summary"]["total_quota"] == 60
        assert data["worker"]["name"] == "Gourav"
        assert "password_hash" not in data["worker"]

    server.app.dependency_overrides.clear()
