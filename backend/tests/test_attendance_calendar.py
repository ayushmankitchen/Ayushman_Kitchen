import pytest
from types import SimpleNamespace
from httpx import ASGITransport, AsyncClient

import backend.server as server
from backend.services.payroll import PayrollService


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
                if isinstance(v, dict) and "$regex" in v:
                    pattern = v["$regex"]
                    actual = str(r.get(k, ""))
                    if not actual.startswith(pattern.replace("^", "")):
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


def test_payroll_service_monthly_attendance_calculation():
    worker = {
        "id": "w-1",
        "name": "Ramesh Kumar",
        "joining_date": "2026-08-05",
    }
    # 5 days Present, 2 days Half Day, 1 day Absent in August 2026
    records = [
        {"worker_id": "w-1", "date": "2026-08-05", "status": "Present"},
        {"worker_id": "w-1", "date": "2026-08-06", "status": "Present"},
        {"worker_id": "w-1", "date": "2026-08-07", "status": "Present"},
        {"worker_id": "w-1", "date": "2026-08-08", "status": "Half Day"},
        {"worker_id": "w-1", "date": "2026-08-09", "status": "Half Day"},
        {"worker_id": "w-1", "date": "2026-08-10", "status": "Absent"},
        {"worker_id": "w-1", "date": "2026-08-11", "status": "Present"},
        {"worker_id": "w-1", "date": "2026-08-12", "status": "Present"},
    ]
    # Assume today is August 15, 2026
    res = PayrollService.calculate_worker_month_attendance(
        worker=worker,
        attendance_records=records,
        year=2026,
        month=8,
        today_date_str="2026-08-15",
    )

    assert res["year"] == 2026
    assert res["month"] == 8
    assert res["days_in_month"] == 31
    summary = res["summary"]

    # Pre-joining dates: Aug 1 to Aug 4 (4 days) - not counted in not_marked or absent
    # Eligible past/today dates: Aug 5 to Aug 15 (11 days)
    # Recorded: 5 Present + 2 Half Day + 1 Absent = 8 days
    # Unmarked: 11 eligible - 8 recorded = 3 days (Aug 13, 14, 15)
    assert summary["present"] == 5
    assert summary["half_day"] == 2
    assert summary["absent"] == 1
    assert summary["not_marked"] == 3
    assert summary["eligible_days"] == 11
    # Earned units = 5 + (2 * 0.5) = 6.0
    assert summary["earned_units"] == 6.0
    # Rate = (6.0 / 11) * 100 = 54.5%
    assert summary["attendance_rate"] == 54.5

    # Check future days (Aug 16..31) are flagged is_future
    day16 = next(d for d in res["days"] if d["date"] == "2026-08-16")
    assert day16["is_future"] is True
    assert day16["is_pre_joining"] is False

    # Check pre-joining days (Aug 1..4) are flagged is_pre_joining
    day1 = next(d for d in res["days"] if d["date"] == "2026-08-01")
    assert day1["is_pre_joining"] is True
    assert day1["is_future"] is False


def test_zero_attendance_future_month_is_safe():
    worker = {"id": "w-2", "name": "Asha", "joining_date": "2026-01-01"}
    # September 2026 when today is August 15, 2026
    res = PayrollService.calculate_worker_month_attendance(
        worker=worker,
        attendance_records=[],
        year=2026,
        month=9,
        today_date_str="2026-08-15",
    )
    assert res["summary"]["eligible_days"] == 0
    assert res["summary"]["attendance_rate"] == 0.0
    assert res["summary"]["present"] == 0
    assert res["summary"]["not_marked"] == 0
    assert all(d["is_future"] for d in res["days"])


@pytest.mark.asyncio
async def test_admin_get_worker_monthly_attendance_endpoint(monkeypatch):
    worker_doc = {
        "id": "worker-1",
        "business_id": "biz-alpha",
        "name": "Ramesh Kumar",
        "work_type": "Mason",
        "joining_date": "2026-08-01",
    }
    attendance_docs = [
        {"worker_id": "worker-1", "business_id": "biz-alpha", "date": "2026-08-01", "status": "Present"},
        {"worker_id": "worker-1", "business_id": "biz-alpha", "date": "2026-08-02", "status": "Present"},
        {"worker_id": "worker-1", "business_id": "biz-alpha", "date": "2026-08-03", "status": "Half Day"},
    ]
    mock_db = SimpleNamespace(
        workers=_MockCollection([worker_doc]),
        attendance=_MockCollection(attendance_docs),
    )
    monkeypatch.setattr(server, "db", mock_db)
    monkeypatch.setattr(server, "get_today_date", lambda: "2026-08-15")

    async def mock_admin():
        return {"id": "admin-1", "business_id": "biz-alpha", "username": "owner"}

    server.app.dependency_overrides[server.get_current_admin] = mock_admin

    try:
        transport = ASGITransport(app=server.app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.get("/api/workers/worker-1/attendance/month?year=2026&month=8")
            assert res.status_code == 200
            data = res.json()
            assert data["year"] == 2026
            assert data["month"] == 8
            assert data["worker"]["id"] == "worker-1"
            assert data["summary"]["present"] == 2
            assert data["summary"]["half_day"] == 1
            assert data["summary"]["absent"] == 0
            assert len(data["days"]) == 31
    finally:
        server.app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_cross_business_monthly_attendance_blocked(monkeypatch):
    worker_doc = {
        "id": "worker-other",
        "business_id": "biz-beta",
        "name": "Suresh",
    }
    mock_db = SimpleNamespace(
        workers=_MockCollection([worker_doc]),
        attendance=_MockCollection([]),
    )
    monkeypatch.setattr(server, "db", mock_db)

    # Admin belongs to biz-alpha, worker belongs to biz-beta
    async def mock_admin():
        return {"id": "admin-1", "business_id": "biz-alpha", "username": "owner"}

    server.app.dependency_overrides[server.get_current_admin] = mock_admin

    try:
        transport = ASGITransport(app=server.app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.get("/api/workers/worker-other/attendance/month?year=2026&month=8")
            assert res.status_code == 404
    finally:
        server.app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_worker_self_monthly_attendance_endpoint(monkeypatch):
    worker_doc = {
        "id": "w-self",
        "business_id": "biz-alpha",
        "name": "Dinesh",
        "work_type": "Helper",
        "joining_date": "2026-08-01",
    }
    attendance_docs = [
        {"worker_id": "w-self", "business_id": "biz-alpha", "date": "2026-08-10", "status": "Present"},
    ]
    mock_db = SimpleNamespace(
        workers=_MockCollection([worker_doc]),
        attendance=_MockCollection(attendance_docs),
    )
    monkeypatch.setattr(server, "db", mock_db)
    monkeypatch.setattr(server, "get_today_date", lambda: "2026-08-15")

    async def mock_worker():
        return {"worker_id": "w-self", "business_id": "biz-alpha", "id": "w-self"}

    server.app.dependency_overrides[server.get_current_worker] = mock_worker

    try:
        transport = ASGITransport(app=server.app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.get("/api/worker/me/attendance/month?year=2026&month=8")
            assert res.status_code == 200
            data = res.json()
            assert data["worker"]["name"] == "Dinesh"
            assert data["summary"]["present"] == 1
    finally:
        server.app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_monthly_attendance_invalid_parameters():
    transport = ASGITransport(app=server.app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Month 13 is invalid
        res = await client.get("/api/workers/w-1/attendance/month?year=2026&month=13")
        assert res.status_code in {422, 401}
