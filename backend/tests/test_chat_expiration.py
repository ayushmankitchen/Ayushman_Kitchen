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
                if operator == "$exists" and ((key in document) != value):
                    return False
                if operator == "$ne" and actual == value:
                    return False
                if operator == "$nin" and actual in value:
                    return False
                if operator == "$gt" and not (actual is not None and actual > value):
                    return False
                if operator == "$lt" and not (actual is not None and actual < value):
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

    def __aiter__(self):
        self.index = 0
        return self

    async def __anext__(self):
        if self.index >= len(self.documents):
            raise StopAsyncIteration
        item = self.documents[self.index]
        self.index += 1
        return dict(item)


class FakeCollection:
    def __init__(self, documents=None):
        self.documents = documents or []

    def find(self, query, projection=None):
        found = [item for item in self.documents if matches(item, query)]
        return FakeCursor(found)

    async def find_one(self, query, projection=None, sort=None):
        found = [item for item in self.documents if matches(item, query)]
        if sort:
            found.sort(key=lambda item: item.get(sort[0][0], ""))
        return dict(found[0]) if found else None

    async def update_many(self, query, update):
        modified = 0
        for item in self.documents:
            if matches(item, query):
                item.update(update.get("$set", {}))
                for key in update.get("$unset", {}):
                    item.pop(key, None)
                modified += 1
        return SimpleNamespace(modified_count=modified)

    async def update_one(self, query, update):
        result = await self.update_many(query, update)
        return SimpleNamespace(modified_count=min(result.modified_count, 1))

    async def count_documents(self, query):
        return sum(matches(item, query) for item in self.documents)


@pytest.mark.asyncio
async def test_unread_and_read_messages_keep_creation_based_48_hour_expiry(monkeypatch):
    created_at = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
    documents = [
        {"id": "incoming", "conversation_id": "c1", "business_id": "b1", "worker_id": "w1", "sender_type": "owner", "message_type": "text", "read_at": None, "created_at": created_at.isoformat()},
        {"id": "outgoing", "conversation_id": "c1", "business_id": "b1", "worker_id": "w1", "sender_type": "worker", "message_type": "text", "read_at": None, "created_at": created_at.isoformat()},
    ]
    messages = FakeCollection(documents)
    monkeypatch.setattr(server, "db", SimpleNamespace(messages=messages, voice_assets=FakeCollection()))

    await server.migrate_message_expirations()
    expiry_before_read = documents[0]["expires_at"]
    await server.persist_conversation_read("c1", False, {"business_id": "b1", "worker_id": "w1"})

    assert expiry_before_read == created_at + timedelta(hours=48)
    assert documents[0]["expires_at"] == expiry_before_read
    assert documents[0]["read_at"] is not None
    assert documents[1]["read_at"] is None
    assert documents[1]["expires_at"] == created_at + timedelta(hours=48)


@pytest.mark.asyncio
async def test_expired_message_does_not_appear_in_message_api(monkeypatch):
    now = datetime.now(timezone.utc)
    messages = FakeCollection([
        {"id": "expired", "conversation_id": "c1", "business_id": "b1", "worker_id": "w1", "created_at": "1", "expires_at": now - timedelta(seconds=1), "message_type": "text"},
        {"id": "visible", "conversation_id": "c1", "business_id": "b1", "worker_id": "w1", "created_at": "2", "message_type": "text"},
    ])
    monkeypatch.setattr(server, "db", SimpleNamespace(messages=messages))

    async def actor(*_args):
        return False, True, {}, {"business_id": "b1", "worker_id": "w1"}

    async def mark_read(*_args):
        return {}

    monkeypatch.setattr(server, "resolve_conversation_actor", actor)
    monkeypatch.setattr(server, "persist_conversation_read", mark_read)

    result = await server.get_messages("c1", request=None)

    assert [message["id"] for message in result] == ["visible"]


@pytest.mark.asyncio
async def test_old_read_messages_migrate_safely(monkeypatch):
    created_at = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
    existing_expiry = created_at + timedelta(hours=24)
    documents = [
        {"_id": "mongo-1", "id": "old-read", "business_id": "b1", "conversation_id": "c1", "created_at": created_at.isoformat(), "read_at": created_at.isoformat()},
        {"_id": "mongo-2", "id": "unread", "business_id": "b1", "conversation_id": "c1", "created_at": created_at.isoformat(), "read_at": None},
        {"_id": "mongo-3", "id": "other-business", "business_id": "b2", "conversation_id": "c2", "created_at": created_at.isoformat(), "read_at": None},
        {"_id": "mongo-4", "id": "existing", "business_id": "b2", "conversation_id": "c2", "created_at": created_at.isoformat(), "read_at": None, "expires_at": existing_expiry},
    ]
    messages = FakeCollection(documents)
    monkeypatch.setattr(server, "db", SimpleNamespace(messages=messages, voice_assets=FakeCollection()))

    migrated = await server.migrate_message_expirations()

    assert migrated == 3
    assert documents[0]["expires_at"] == created_at + timedelta(hours=48)
    assert documents[1]["expires_at"] == created_at + timedelta(hours=48)
    assert documents[2]["expires_at"] == created_at + timedelta(hours=48)
    assert documents[3]["expires_at"] == existing_expiry
