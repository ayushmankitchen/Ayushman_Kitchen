from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

import backend.server as server


class _Cursor:
    def __init__(self, records):
        self.records = records

    async def to_list(self, _limit):
        return [dict(record) for record in self.records]


class _Collection:
    def __init__(self, records):
        self.records = records

    def find(self, query, _projection=None):
        def matches(record):
            for key, expected in query.items():
                actual = record.get(key)
                if isinstance(expected, dict):
                    if "$gte" in expected and (actual is None or actual < expected["$gte"]):
                        return False
                    if "$lt" in expected and (actual is None or actual >= expected["$lt"]):
                        return False
                elif actual != expected:
                    return False
            return True

        return _Cursor([record for record in self.records if matches(record)])


def _dashboard_db(workers=(), attendance=(), payments=(), extra_work=()):
    return SimpleNamespace(
        workers=_Collection(workers),
        attendance=_Collection(attendance),
        payments=_Collection(payments),
        extra_work=_Collection(extra_work),
    )


@pytest.mark.asyncio
async def test_admin_dashboard_stats_are_business_scoped_and_use_real_totals(monkeypatch):
    """Dashboard aggregates must not include another business's people or money."""
    monkeypatch.setattr(server, "get_today_date", lambda: "2026-08-15")
    monkeypatch.setattr(server, "get_yesterday_date", lambda: "2026-08-14")
    monkeypatch.setattr(server, "db", _dashboard_db(
        workers=[
            {"id": "worker-a1", "business_id": "business-a", "name": "Asha", "salary": 31000},
            {"id": "worker-a2", "business_id": "business-a", "name": "Bharat", "salary": 31000},
            {"id": "worker-b1", "business_id": "business-b", "name": "Other", "salary": 31000},
        ],
        attendance=[
            {"worker_id": "worker-a1", "business_id": "business-a", "date": "2026-08-15", "status": "Present"},
            {"worker_id": "worker-a2", "business_id": "business-a", "date": "2026-08-15", "status": "Absent"},
            {"worker_id": "worker-b1", "business_id": "business-b", "date": "2026-08-15", "status": "Present"},
        ],
        payments=[
            {"worker_id": "worker-a1", "business_id": "business-a", "date": "2026-08-15", "type": "SALARY_PAYMENT", "amount": 200, "deleted_at": None},
            {"worker_id": "worker-a2", "business_id": "business-a", "date": "2026-08-14", "type": "ADJUSTMENT", "amount": 50, "deleted_at": None},
            {"worker_id": "worker-b1", "business_id": "business-b", "date": "2026-08-15", "type": "SALARY_PAYMENT", "amount": 9000, "deleted_at": None},
        ],
        extra_work=[
            {"worker_id": "worker-a1", "business_id": "business-a", "date": "2026-08-15", "amount": 500, "deleted_at": None},
            {"worker_id": "worker-b1", "business_id": "business-b", "date": "2026-08-15", "amount": 4000, "deleted_at": None},
        ],
    ))

    stats = await server.admin_stats({"business_id": "business-a"})

    assert stats["total_workers"] == 2
    assert stats["present_today"] == 1
    assert stats["absent_today"] == 1
    assert stats["today_payments"] == 200
    assert stats["payment_count_this_month"] == 2
    assert stats["total_paid_month"] == 250
    assert stats["gross_earned_month"] == 1500
    assert stats["remaining_payable"] == 1250
    assert stats["monthly_attendance"] == [{"date": "2026-08-15", "present": 1, "absent": 1, "half_day": 0}]
    assert all(item["worker_name"] != "Other" for item in stats["recent_activity"])


@pytest.mark.asyncio
async def test_admin_dashboard_stats_handles_a_business_with_no_workers(monkeypatch):
    monkeypatch.setattr(server, "get_today_date", lambda: "2026-08-15")
    monkeypatch.setattr(server, "get_yesterday_date", lambda: "2026-08-14")
    monkeypatch.setattr(server, "db", _dashboard_db())

    stats = await server.admin_stats({"business_id": "empty-business"})

    assert stats["total_workers"] == 0
    assert stats["attendance_rate"] == 0
    assert stats["monthly_attendance"] == []
    assert stats["recent_activity"] == []
    assert stats["payment_count_this_month"] == 0


@pytest.mark.asyncio
async def test_admin_dashboard_stats_requires_authentication():
    transport = ASGITransport(app=server.app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/admin/stats")

    assert response.status_code in {401, 403}
