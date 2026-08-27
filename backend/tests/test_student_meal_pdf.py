import pytest
from types import SimpleNamespace
from httpx import ASGITransport, AsyncClient

import backend.server as server
from backend.services.student_meal_pdf import generate_student_meal_statement_pdf


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
        cursor = _MockCursor(matched)
        setattr(cursor, "sort", lambda *args, **kwargs: cursor)
        return cursor


def test_generate_student_meal_statement_pdf_creates_valid_pdf():
    worker = {
        "id": "w_123",
        "name": "Aman Sharma",
        "login_id": "STU-101",
        "mobile": "9876543210",
        "meal_plan_type": "BOTH",
        "delivery_preference": "DELIVERY",
        "delivery_address": "Hostel 4, Room 202",
        "dietary_preference": "VEG",
        "joining_date": "2026-08-01",
    }
    business = {
        "id": "biz_1",
        "name": "Ayushman Kitchen",
        "phone": "+91 9999999999",
        "address": "Bhopal, MP",
    }
    calendar_data = {
        "month": "2026-08",
        "summary": {
            "total_quota": 60,
            "total_used": 20,
            "total_skipped": 2,
            "on_leave": 3,
            "total_remaining": 35,
            "validity_expiry_date": "2026-09-15",
            "validity_days_left": 20,
        },
        "days": [
            {"date": "2026-08-01", "lunch": "ATE", "lunch_choice": "Paneer Butter Masala", "dinner": "ATE", "dinner_choice": "Dal Tadka", "lunch_delivery": "DELIVERY"},
            {"date": "2026-08-02", "lunch": "CANCELLED", "dinner": "ATE", "dinner_choice": "Mix Veg", "lunch_delivery": "DINE_IN"},
            {"date": "2026-08-03", "lunch": "LEAVE", "dinner": "LEAVE", "lunch_delivery": "DELIVERY"},
        ]
    }
    payments = [
        {"date": "2026-08-01", "amount": 3500, "note": "Monthly Subscription Fee", "payment_method": "UPI"}
    ]

    pdf_bytes = generate_student_meal_statement_pdf(
        worker=worker,
        business=business,
        month="2026-08",
        calendar_data=calendar_data,
        payments=payments,
    )

    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 500
    assert pdf_bytes.startswith(b"%PDF-")


@pytest.mark.asyncio
async def test_admin_student_meal_pdf_endpoint(monkeypatch):
    worker_doc = {
        "id": "w_test_pdf",
        "name": "Rahul Verma",
        "business_id": "biz_pdf",
        "joining_date": "2026-08-01",
        "meal_plan_type": "BOTH",
        "total_quota": 60,
    }
    business_doc = {
        "id": "biz_pdf",
        "name": "Ayushman Kitchen",
    }

    mock_db = SimpleNamespace(
        workers=_MockCollection([worker_doc]),
        businesses=_MockCollection([business_doc]),
        meal_selections=_MockCollection([]),
        worker_leaves=_MockCollection([]),
        meal_settings=_MockCollection([]),
        payments=_MockCollection([]),
        attendance=_MockCollection([]),
    )
    monkeypatch.setattr(server, "db", mock_db)

    async def _mock_admin():
        return {"id": "admin_1", "business_id": "biz_pdf"}

    server.app.dependency_overrides[server.get_current_admin] = _mock_admin

    async with AsyncClient(
        transport=ASGITransport(app=server.app),
        base_url="http://test",
    ) as ac:
        res = await ac.get("/api/admin/workers/w_test_pdf/meal-pdf?month=2026-08")
        assert res.status_code == 200
        assert res.headers["content-type"] == "application/pdf"
        assert "Content-Disposition" in res.headers
        assert res.content.startswith(b"%PDF-")

    server.app.dependency_overrides.clear()
