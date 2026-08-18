import io
import re
import pytest
from types import SimpleNamespace
from httpx import AsyncClient, ASGITransport

from backend import server
from backend.services.payroll import PayrollService
from backend.services.salary_slip_pdf import (
    generate_salary_slip_pdf,
    format_indian_currency,
    sanitize_filename,
    safe_pdf_text,
)


class _MockCursor:
    def __init__(self, items):
        self._items = items

    def sort(self, *args, **kwargs):
        return self

    async def to_list(self, length=None):
        return list(self._items)


class _MockCollection:
    def __init__(self, data=None):
        self.data = list(data or [])

    async def find_one(self, query, projection=None):
        for r in self.data:
            match = True
            for k, v in query.items():
                if isinstance(v, dict):
                    if "$regex" in v and not re.search(v["$regex"], str(r.get(k, ""))):
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
                return res
        return None

    def find(self, query=None, projection=None):
        query = query or {}
        matched = []
        for r in self.data:
            match = True
            for k, v in query.items():
                if isinstance(v, dict):
                    if "$regex" in v and not re.search(v["$regex"], str(r.get(k, ""))):
                        match = False
                        break
                    if "$gte" in v and str(r.get(k, "")) < str(v["$gte"]):
                        match = False
                        break
                    if "$lt" in v and str(r.get(k, "")) >= str(v["$lt"]):
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


def test_format_indian_currency():
    assert format_indian_currency(20000) == "Rs. 20,000"
    assert format_indian_currency(125000) == "Rs. 1,25,000"
    assert format_indian_currency(5000000) == "Rs. 50,00,000"
    assert format_indian_currency(0) == "Rs. 0"
    assert format_indian_currency(-500) == "-Rs. 500"


def test_sanitize_filename():
    assert sanitize_filename("Ramesh Kumar") == "Ramesh_Kumar"
    assert sanitize_filename("A/B\\C:D*E?\"<F>|G") == "A_B_C_D_E_F_G"
    assert sanitize_filename("   ") == "Worker"


def test_pdf_text_is_ascii_safe_and_replaces_unsupported_names():
    assert safe_pdf_text("Ramesh Kumar") == "Ramesh Kumar"
    sanitized = safe_pdf_text("रमेश कुमार")
    assert sanitized.isascii()
    assert "?" in sanitized


def test_generate_salary_slip_pdf_creates_valid_pdf():
    worker = {
        "id": "w-1",
        "name": "Ramesh Kumar",
        "login_id": "WF-7K4P92",
        "work_type": "Mason",
        "mobile": "9876543210",
        "joining_date": "2026-08-01",
        "salary": 20000.0,
    }
    business = {
        "id": "biz-1",
        "name": "Sushant Construction",
        "owner_name": "Sushant Sharma",
    }
    summary = {
        "monthly_salary": 20000.0,
        "daily_rate": 645.16,
        "days_in_month": 31,
        "present_days": 24,
        "half_days": 2,
        "absent_days": 5,
        "earned_salary": 16129.0,
        "extra_work_earned": 2000.0,
        "gross_earned": 18129.0,
        "paid_this_month": 10000.0,
        "advance_taken": 3000.0,
        "extra_work_paid": 0.0,
        "total_paid_month": 13000.0,
        "remaining_payable": 5129.0,
    }
    attendance_summary = {
        "present": 24,
        "half_day": 2,
        "absent": 5,
        "earned_units": 25.0,
        "attendance_rate": 80.6,
    }
    recent_payments = [
        {"date": "2026-08-05", "type": "ADVANCE", "amount": 3000.0, "note": "Advance"},
        {"date": "2026-08-15", "type": "SALARY_PAYMENT", "amount": 10000.0, "note": "Part salary"},
    ]

    pdf_bytes = generate_salary_slip_pdf(
        worker=worker,
        business=business,
        summary=summary,
        attendance_summary=attendance_summary,
        year=2026,
        month=8,
        recent_payments=recent_payments,
    )

    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 500
    assert pdf_bytes.startswith(b"%PDF-")  # Valid PDF header marker
    assert "उपार्जन".encode("utf-8") not in pdf_bytes
    assert "भुगतान".encode("utf-8") not in pdf_bytes
    assert b"Rs. 18,129" in pdf_bytes or len(pdf_bytes) > 500


def test_salary_slip_pdf_does_not_crash_for_hindi_worker_or_business_names():
    pdf_bytes = generate_salary_slip_pdf(
        worker={"name": "रमेश कुमार", "salary": 15000},
        business={"name": "निर्माण कंपनी", "owner_name": "निशांत"},
        summary={"monthly_salary": 15000, "gross_earned": 500, "remaining_payable": 500},
        attendance_summary={},
        year=2026,
        month=8,
    )

    assert pdf_bytes.startswith(b"%PDF-")
    assert "रमेश".encode("utf-8") not in pdf_bytes


@pytest.mark.asyncio
async def test_admin_salary_slip_endpoint_returns_pdf(monkeypatch):
    test_worker = {
        "id": "w-1",
        "business_id": "biz-1",
        "name": "Ramesh Kumar",
        "login_id": "WF-7K4P92",
        "work_type": "Mason",
        "mobile": "9876543210",
        "joining_date": "2026-08-01",
        "salary": 20000.0,
    }
    test_business = {"id": "biz-1", "name": "Test Construction", "owner_name": "Test Owner"}
    attendance_docs = [
        {"worker_id": "w-1", "business_id": "biz-1", "date": "2026-08-01", "status": "Present"},
        {"worker_id": "w-1", "business_id": "biz-1", "date": "2026-08-02", "status": "Present"},
    ]

    mock_db = SimpleNamespace(
        workers=_MockCollection([test_worker]),
        businesses=_MockCollection([test_business]),
        attendance=_MockCollection(attendance_docs),
        payments=_MockCollection([]),
        extra_work=_MockCollection([]),
    )
    monkeypatch.setattr(server, "db", mock_db)

    async def mock_admin():
        return {"id": "admin-1", "business_id": "biz-1", "email": "admin@test.com"}

    server.app.dependency_overrides[server.get_current_admin] = mock_admin

    try:
        transport = ASGITransport(app=server.app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
            resp = await ac.get("/api/workers/w-1/salary-slip?year=2026&month=8")
            assert resp.status_code == 200
            assert resp.headers.get("content-type") == "application/pdf"
            assert "attachment;" in resp.headers.get("content-disposition", "")
            assert "WorkForce_Salary_Slip_Ramesh_Kumar_August_2026.pdf" in resp.headers.get("content-disposition", "")
            assert resp.headers.get("cache-control") == "no-store, private"
            assert resp.content.startswith(b"%PDF-")
    finally:
        server.app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_cross_business_salary_slip_is_blocked(monkeypatch):
    test_worker = {
        "id": "w-other",
        "business_id": "biz-2",
        "name": "Suresh",
    }
    mock_db = SimpleNamespace(
        workers=_MockCollection([test_worker]),
        businesses=_MockCollection([]),
        attendance=_MockCollection([]),
        payments=_MockCollection([]),
        extra_work=_MockCollection([]),
    )
    monkeypatch.setattr(server, "db", mock_db)

    async def mock_admin():
        return {"id": "admin-1", "business_id": "biz-1", "email": "admin@test.com"}

    server.app.dependency_overrides[server.get_current_admin] = mock_admin

    try:
        transport = ASGITransport(app=server.app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
            resp = await ac.get("/api/workers/w-other/salary-slip?year=2026&month=8")
            assert resp.status_code == 404
    finally:
        server.app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_worker_self_salary_slip_endpoint_returns_pdf(monkeypatch):
    test_worker_session = {
        "id": "u-1",
        "worker_id": "w-1",
        "business_id": "biz-1",
        "role": "worker",
    }
    test_worker = {
        "id": "w-1",
        "business_id": "biz-1",
        "name": "Amit Singh",
        "login_id": "WF-998877",
        "work_type": "Painter",
        "joining_date": "2026-08-01",
        "salary": 18000.0,
    }
    test_business = {"id": "biz-1", "name": "BuildCraft", "owner_name": "Sharma Ji"}

    mock_db = SimpleNamespace(
        workers=_MockCollection([test_worker]),
        businesses=_MockCollection([test_business]),
        attendance=_MockCollection([]),
        payments=_MockCollection([]),
        extra_work=_MockCollection([]),
    )
    monkeypatch.setattr(server, "db", mock_db)

    async def mock_worker():
        return test_worker_session

    server.app.dependency_overrides[server.get_current_worker] = mock_worker

    try:
        transport = ASGITransport(app=server.app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
            resp = await ac.get("/api/worker/me/salary-slip?year=2026&month=8")
            assert resp.status_code == 200
            assert resp.headers.get("content-type") == "application/pdf"
            assert "WorkForce_Salary_Slip_Amit_Singh_August_2026.pdf" in resp.headers.get("content-disposition", "")
            assert resp.content.startswith(b"%PDF-")
    finally:
        server.app.dependency_overrides.clear()
