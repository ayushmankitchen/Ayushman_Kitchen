from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import pytest

from backend import server


def matches(document, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(matches(document, item) for item in expected):
                return False
            continue
        if key == "$and":
            if not all(matches(document, item) for item in expected):
                return False
            continue
        actual = document.get(key)
        if isinstance(expected, dict):
            for operator, value in expected.items():
                if operator == "$nin" and actual in value:
                    return False
                if operator == "$in" and actual not in value:
                    return False
                if operator == "$lte" and not (actual is not None and actual <= value):
                    return False
                if operator == "$gt" and not (actual is not None and actual > value):
                    return False
            continue
        if actual != expected:
            return False
    return True


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, key, direction):
        self.documents.sort(key=lambda item: item.get(key, ""), reverse=direction < 0)
        return self

    async def to_list(self, limit):
        return [dict(item) for item in self.documents[:limit]]


class FakeActivityCollection:
    def __init__(self, documents=None):
        self.documents = documents or []

    def find(self, query, projection=None):
        found = [item for item in self.documents if matches(item, query)]
        return FakeCursor(found)

    async def delete_many(self, query):
        initial_len = len(self.documents)
        self.documents = [item for item in self.documents if not matches(item, query)]
        return SimpleNamespace(deleted_count=initial_len - len(self.documents))


@pytest.mark.asyncio
async def test_notification_cleanup_deletes_old_non_renewal_keeps_renewals(monkeypatch):
    now = datetime.now(timezone.utc)
    old_date = (now - timedelta(days=4)).isoformat()
    recent_date = (now - timedelta(days=1)).isoformat()

    activity_docs = [
        # Old vacation notification (> 3 days) -> SHOULD BE DELETED
        {"id": "act_1", "business_id": "biz_1", "type": "VACATION_START", "title": "Old Vacation", "created_at": old_date},
        # Old meal cancel notification (> 3 days) -> SHOULD BE DELETED
        {"id": "act_2", "business_id": "biz_1", "type": "MEAL_CANCELLED", "title": "Old Cancel", "created_at": old_date},
        # Old subscription renewal (> 3 days) -> MUST BE PRESERVED
        {"id": "act_3", "business_id": "biz_1", "type": "SUBSCRIPTION_RENEWED", "title": "Old Renewal", "created_at": old_date},
        # Recent vacation notification (< 3 days) -> MUST BE PRESERVED
        {"id": "act_4", "business_id": "biz_1", "type": "VACATION_START", "title": "Recent Vacation", "created_at": recent_date},
        # Recent renewal (< 3 days) -> MUST BE PRESERVED
        {"id": "act_5", "business_id": "biz_1", "type": "SUBSCRIPTION_RENEWED", "title": "Recent Renewal", "created_at": recent_date},
    ]

    activity_col = FakeActivityCollection(activity_docs)
    monkeypatch.setattr(server, "db", SimpleNamespace(activity_logs=activity_col))

    # Run cleanup
    deleted_count = await server.cleanup_expired_notifications()

    # Should have deleted act_1 and act_2 (2 old regular notifications)
    assert deleted_count == 2
    remaining_ids = [doc["id"] for doc in activity_col.documents]
    assert "act_1" not in remaining_ids
    assert "act_2" not in remaining_ids
    assert "act_3" in remaining_ids  # Old renewal kept!
    assert "act_4" in remaining_ids  # Recent vacation kept!
    assert "act_5" in remaining_ids  # Recent renewal kept!


@pytest.mark.asyncio
async def test_get_admin_activity_feed_filters_old_notifications_retains_renewals(monkeypatch):
    now = datetime.now(timezone.utc)
    old_date = (now - timedelta(days=5)).isoformat()
    recent_date = (now - timedelta(days=1)).isoformat()

    activity_docs = [
        {"id": "old_meal", "business_id": "biz_1", "type": "MEAL_CUSTOMIZED", "title": "Old Meal", "created_at": old_date},
        {"id": "old_renewal", "business_id": "biz_1", "type": "SUBSCRIPTION_RENEWED", "title": "Old Renewal", "created_at": old_date},
        {"id": "recent_vacation", "business_id": "biz_1", "type": "VACATION_START", "title": "Recent Vacation", "created_at": recent_date},
    ]

    activity_col = FakeActivityCollection(activity_docs)
    monkeypatch.setattr(server, "db", SimpleNamespace(activity_logs=activity_col))

    admin = {"business_id": "biz_1"}
    feed = await server.get_admin_activity_feed(admin=admin)

    feed_ids = [item["id"] for item in feed]
    assert "old_meal" not in feed_ids
    assert "old_renewal" in feed_ids
    assert "recent_vacation" in feed_ids
