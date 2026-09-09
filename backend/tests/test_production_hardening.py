import asyncio
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from backend import server
from backend.services.script_safety import require_local_scratch_database


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, limit):
        return deepcopy(self.rows if limit is None else self.rows[:limit])


class Collection:
    def __init__(self, rows=()):
        self.rows = rows
        self.calls = 0

    def find(self, query, projection=None):
        self.calls += 1
        rows = [dict(row) for row in self.rows if all(row.get(key) == value for key, value in query.items() if not isinstance(value, dict))]
        if projection:
            rows = [{key: value for key, value in row.items() if projection.get(key) != 0} for row in rows]
        return Cursor(rows)

    async def find_one(self, query, projection=None):
        rows = await self.find(query, projection).to_list(1)
        return rows[0] if rows else None

    def aggregate(self, pipeline):
        self.calls += 1
        return Cursor([])


def test_legacy_maintenance_utilities_reject_live_databases():
    with pytest.raises(RuntimeError):
        require_local_scratch_database("mongodb+srv://example.mongodb.net", "ayushman_kitchen")
    with pytest.raises(RuntimeError):
        require_local_scratch_database("mongodb://127.0.0.1:27019", "ayushman_kitchen")
    require_local_scratch_database("mongodb://127.0.0.1:27019", "ayushman_test")


@pytest.mark.asyncio
async def test_headcount_includes_600_students_without_settings(monkeypatch):
    workers = [{"id": str(i), "business_id": "biz", "status": "ACTIVE"} for i in range(600)]
    mock_db = SimpleNamespace(workers=Collection(workers), meal_settings=Collection(),
                              meal_selections=Collection(), worker_leaves=Collection())
    monkeypatch.setattr(server, "db", mock_db)
    defaults = deepcopy(server.DEFAULT_WEEKLY_MENU)
    result = await server.get_meal_headcount(date="2026-09-09", admin={"business_id": "biz"})
    assert result["lunch"]["summary"]["total_students"] == 600
    assert len(result["dinner"]["students"]) == 600
    assert server.DEFAULT_WEEKLY_MENU == defaults


@pytest.mark.asyncio
async def test_chat_queries_are_batched_and_never_return_password_hashes(monkeypatch):
    workers = [{"id": str(i), "business_id": "biz", "password_hash": "secret-hash"} for i in range(600)]
    conversations = [{"id": "c"+str(i), "worker_id": str(i), "business_id": "biz"} for i in range(600)]
    mock_db = SimpleNamespace(workers=Collection(workers), conversations=Collection(conversations), messages=Collection())
    monkeypatch.setattr(server, "db", mock_db)
    result = await server.list_admin_conversations({"business_id": "biz"})
    assert len(result) == 600
    assert all("password_hash" not in item["worker"] for item in result)
    assert sum(c.calls for c in vars(mock_db).values()) == 3


@pytest.mark.asyncio
async def test_low_balance_inputs_are_batched(monkeypatch):
    workers = [{"id": str(i), "business_id": "biz", "status": "ACTIVE", "joining_date": server.get_today_date()} for i in range(600)]
    mock_db = SimpleNamespace(workers=Collection(workers), meal_settings=Collection(),
                              worker_leaves=Collection(), meal_selections=Collection())
    monkeypatch.setattr(server, "db", mock_db)
    result = await server.get_low_balance_students({"business_id": "biz"})
    assert result == []
    assert sum(c.calls for c in vars(mock_db).values()) == 4


@pytest.mark.asyncio
async def test_cleanup_requires_explicit_opt_in(monkeypatch):
    monkeypatch.delenv("ENABLE_MEAL_DATA_CLEANUP", raising=False)
    monkeypatch.setattr(server, "db", SimpleNamespace())
    assert await server.cleanup_old_meal_data() == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [{"date": "bad"}, {"meal_slot": "breakfast"}, {"notes": {}}, {"action": "DELETE"}])
async def test_invalid_meal_request_is_422_before_database_access(monkeypatch, body):
    monkeypatch.setattr(server, "db", SimpleNamespace())
    with pytest.raises(HTTPException) as caught:
        await server.save_student_meal_selection(body, {"business_id": "biz", "worker_id": "w"})
    assert caught.value.status_code == 422


def test_long_and_malformed_passwords_do_not_crash_login():
    assert server.verify_password("x" * 73, "$2b$bad-hash") is False
    assert server.verify_password("password", "broken") is False
    with pytest.raises(HTTPException) as caught:
        server.hash_password("🍲" * 19)
    assert caught.value.status_code == 422


@pytest.mark.parametrize("endpoint", ["http://127.0.0.1/internal", "https://169.254.169.254/", "https://evil.test/", "https://fcm.googleapis.com.evil.test/"])
def test_push_rejects_arbitrary_network_destinations(endpoint):
    with pytest.raises(ValidationError):
        server.PushSubscriptionCreate(endpoint=endpoint, keys={"p256dh": "key", "auth": "auth"})


@pytest.mark.asyncio
async def test_password_verification_does_not_block_health(monkeypatch):
    entered = __import__("threading").Event()
    release = __import__("threading").Event()

    def slow_check(*args):
        entered.set()
        release.wait(2)
        return False

    monkeypatch.setattr(server, "verify_password", slow_check)
    monkeypatch.setattr(server, "db", SimpleNamespace(admins=SimpleNamespace(find_one=AsyncMock(return_value={"id": "a", "password_hash": "hash"}))))
    async with AsyncClient(transport=ASGITransport(app=server.app), base_url="http://test") as client:
        login = asyncio.create_task(client.post("/api/admin/login", json={"identifier": "admin", "password": "password"}))
        try:
            for _ in range(100):
                if entered.is_set():
                    break
                await asyncio.sleep(0.005)
            assert entered.is_set()
            health = await asyncio.wait_for(client.get("/api/health"), timeout=0.5)
            assert health.status_code == 200
            assert not login.done()
        finally:
            release.set()
            assert (await login).status_code == 401
