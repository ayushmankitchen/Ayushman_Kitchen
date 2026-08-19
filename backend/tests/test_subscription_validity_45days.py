from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import pytest

from backend import server


@pytest.mark.asyncio
async def test_subscription_active_within_45_days(monkeypatch):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    joining_date = (datetime.now(timezone.utc) - timedelta(days=20)).strftime("%Y-%m-%d")

    worker = {
        "id": "w_active",
        "name": "Active Student",
        "joining_date": joining_date,
        "meal_plan_type": "BOTH",
        "total_quota": 60,
        "status": "ACTIVE",
    }

    async def mock_find_one(*args, **kwargs):
        return None

    class MockFind:
        async def to_list(self, limit):
            return []

    # Mock db collections
    monkeypatch.setattr(server, "db", SimpleNamespace(
        meal_settings=SimpleNamespace(find_one=mock_find_one),
        worker_leaves=SimpleNamespace(find=lambda *args, **kwargs: MockFind()),
        meal_selections=SimpleNamespace(find=lambda *args, **kwargs: MockFind()),
    ))

    stats = await server.compute_worker_meal_consumption("biz_1", worker)

    assert stats["is_validity_expired"] is False
    assert stats["validity_days"] == 45
    assert stats["validity_days_left"] == 25  # 45 - 20
    assert stats["lapsed_meals"] == 0
    assert stats["total_remaining"] is not None


@pytest.mark.asyncio
async def test_subscription_expires_after_45_days(monkeypatch):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # Started 50 days ago (> 45 days)
    joining_date = (datetime.now(timezone.utc) - timedelta(days=50)).strftime("%Y-%m-%d")

    worker = {
        "id": "w_expired",
        "name": "Expired Student",
        "joining_date": joining_date,
        "meal_plan_type": "BOTH",
        "total_quota": 60,
        "status": "ACTIVE",
    }

    async def mock_find_one(*args, **kwargs):
        return None

    class MockFind:
        async def to_list(self, limit):
            return []

    # Mock db collections
    monkeypatch.setattr(server, "db", SimpleNamespace(
        meal_settings=SimpleNamespace(find_one=mock_find_one),
        worker_leaves=SimpleNamespace(find=lambda *args, **kwargs: MockFind()),
        meal_selections=SimpleNamespace(find=lambda *args, **kwargs: MockFind()),
    ))

    stats = await server.compute_worker_meal_consumption("biz_1", worker)

    assert stats["is_validity_expired"] is True
    assert stats["is_expired"] is True
    assert stats["expiry_reason"] == "45_DAYS_EXPIRED"
    assert stats["validity_days_left"] == 0
    assert stats["total_remaining"] == 0  # Unusable after 45 days
    assert stats["lapsed_meals"] == stats["raw_remaining"]
